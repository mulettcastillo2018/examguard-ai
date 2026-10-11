import "server-only";
import { Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import { createCredentialUser } from "@/modules/auth/credentials";
import { assertNotDemoAccount } from "@/modules/demo/demo";
import type { CurrentUser } from "@/modules/auth/session";
import { assertCan, ROLES } from "@/modules/rbac";
import { parseUserImport, type ImportRowError } from "./csv";
import { generateTemporaryPassword } from "./temporary-password";

// Administración de usuarios de la institución. Las contraseñas temporales se devuelven
// una sola vez para que la administración las entregue; nunca se guardan en claro.

export const userInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    email: z.email().trim().toLowerCase().max(254),
    role: z.enum(ROLES),
    isMinor: z.boolean().default(false),
  })
  .refine((value) => !value.isMinor || value.role === "STUDENT", { path: ["isMinor"], message: "minorNotStudent" });

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    role: z.enum(ROLES),
    isMinor: z.boolean().default(false),
    active: z.boolean(),
  })
  .refine((value) => !value.isMinor || value.role === "STUDENT", { path: ["isMinor"], message: "minorNotStudent" });

export type UserInput = z.input<typeof userInputSchema>;
export type UserUpdate = z.input<typeof userUpdateSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      undefined,
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

/** Usuarios de la institución del administrador (nunca de otra institución). */
export async function listInstitutionUsers(actor: CurrentUser) {
  assertCan(actor, "users:manage");
  const users = await prisma.user.findMany({
    where: { institutionId: actor.institutionId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isMinor: true,
      active: true,
      mustChangePassword: true,
      guardianConsent: { select: { revokedAt: true } },
    },
  });
  // Para los menores: si hay una autorización del acudiente vigente.
  return users.map(({ guardianConsent, ...user }) => ({ ...user, guardianConsent: Boolean(guardianConsent && !guardianConsent.revokedAt) }));
}

async function findOwnUser(actor: CurrentUser, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, institutionId: actor.institutionId } });
  if (!user) throw new NotFoundError("El usuario no existe en tu institución.");
  return user;
}

/** Crea un usuario con contraseña temporal (debe cambiarla al primer ingreso). */
export async function createUser(actor: CurrentUser, input: UserInput) {
  assertCan(actor, "users:manage");
  const data = parseOrThrow(userInputSchema, input);
  const temporaryPassword = generateTemporaryPassword();

  try {
    const user = await createCredentialUser({
      institutionId: actor.institutionId,
      name: data.name,
      email: data.email,
      role: data.role,
      isMinor: data.isMinor,
      password: temporaryPassword,
      mustChangePassword: true,
    });
    await recordAudit({
      institutionId: actor.institutionId,
      actorId: actor.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      metadata: { role: user.role, isMinor: user.isMinor },
    });
    return { user, temporaryPassword };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Ya existe un usuario con ese correo.");
    }
    throw error;
  }
}

/** Evita dejar la institución sin administración activa. */
async function assertKeepsAnActiveAdmin(institutionId: string, userId: string) {
  const otherAdmins = await prisma.user.count({
    where: { institutionId, role: "ADMIN", active: true, id: { not: userId } },
  });
  if (otherAdmins === 0) throw new ForbiddenError("La institución debe conservar al menos una cuenta de administración activa.");
}

/** Edita nombre, rol, condición de menor de edad y estado. Desactivar cierra sus sesiones. */
export async function updateUser(actor: CurrentUser, userId: string, input: UserUpdate) {
  assertCan(actor, "users:manage");
  const data = parseOrThrow(userUpdateSchema, input);
  const current = await findOwnUser(actor, userId);
  assertNotDemoAccount(current.email);

  if (current.id === actor.id && (!data.active || data.role !== "ADMIN")) {
    throw new ForbiddenError("No puedes desactivar tu propia cuenta ni quitarte el rol de administración.");
  }
  if (current.role === "ADMIN" && current.active && (!data.active || data.role !== "ADMIN")) {
    await assertKeepsAnActiveAdmin(actor.institutionId, current.id);
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: current.id },
      data: { name: data.name, role: data.role, isMinor: data.isMinor, active: data.active },
    });
    // Un cambio de rol o una desactivación invalida las sesiones abiertas al instante.
    if (!data.active || data.role !== current.role) await tx.session.deleteMany({ where: { userId: current.id } });
    return updated;
  });

  const action = current.active && !data.active ? "USER_DEACTIVATED" : !current.active && data.active ? "USER_REACTIVATED" : "USER_UPDATED";
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action,
    entityType: "User",
    entityId: user.id,
    metadata: { role: { from: current.role, to: user.role }, isMinor: user.isMinor },
  });
  return user;
}

/** Nueva contraseña temporal; cierra las sesiones abiertas del usuario. */
export async function resetUserPassword(actor: CurrentUser, userId: string) {
  assertCan(actor, "users:manage");
  const user = await findOwnUser(actor, userId);
  if (user.id === actor.id) throw new ForbiddenError("Para cambiar tu propia contraseña usa la opción de tu cuenta.");
  assertNotDemoAccount(user.email);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.$transaction([
    prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: passwordHash } }),
    prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: user.id,
  });
  return { temporaryPassword };
}

export type ImportResultRow =
  | { line: number; email: string; name: string; status: "created"; temporaryPassword: string; unknownCourses: string[] }
  | { line: number; email: string; status: "exists" }
  | { line: number; email?: string; status: "invalid"; error: ImportRowError["error"] };

/**
 * Importa usuarios desde la planilla. Cada fila se procesa por separado: las válidas se
 * crean (y se matriculan en los cursos indicados), las demás se reportan con su línea.
 */
export async function importUsers(actor: CurrentUser, csvText: string) {
  assertCan(actor, "users:manage");
  const parsed = parseUserImport(csvText);
  if (!parsed.ok) return { ok: false as const, error: parsed.error, missing: parsed.missing ?? [] };

  const results: ImportResultRow[] = parsed.errors.map((error) => ({ ...error, status: "invalid" as const }));
  const existing = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: parsed.rows.map((row) => row.email) } },
        select: { email: true },
      })
    ).map((user) => user.email),
  );
  const courses = await prisma.course.findMany({
    where: { institutionId: actor.institutionId },
    select: { id: true, code: true },
  });
  const courseByCode = new Map(courses.map((course) => [course.code.toUpperCase(), course.id]));

  for (const row of parsed.rows) {
    if (existing.has(row.email)) {
      results.push({ line: row.line, email: row.email, status: "exists" });
      continue;
    }
    const temporaryPassword = generateTemporaryPassword();
    const user = await createCredentialUser({
      institutionId: actor.institutionId,
      name: row.name,
      email: row.email,
      role: row.role,
      isMinor: row.isMinor,
      password: temporaryPassword,
      mustChangePassword: true,
    });
    const known = row.courseCodes.filter((code) => courseByCode.has(code));
    if (known.length && row.role === "STUDENT") {
      await prisma.enrollment.createMany({
        data: known.map((code) => ({ courseId: courseByCode.get(code)!, studentId: user.id })),
        skipDuplicates: true,
      });
    }
    if (known.length && row.role === "TEACHER") {
      await prisma.courseTeacher.createMany({
        data: known.map((code) => ({ courseId: courseByCode.get(code)!, teacherId: user.id })),
        skipDuplicates: true,
      });
    }
    results.push({
      line: row.line,
      email: row.email,
      name: row.name,
      status: "created",
      temporaryPassword,
      unknownCourses: row.courseCodes.filter((code) => !courseByCode.has(code)),
    });
  }

  results.sort((a, b) => a.line - b.line);
  const summary = {
    created: results.filter((r) => r.status === "created").length,
    exists: results.filter((r) => r.status === "exists").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  };
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "USERS_IMPORTED",
    entityType: "User",
    metadata: summary,
  });
  return { ok: true as const, summary, results };
}
