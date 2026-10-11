import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { assertCan } from "@/modules/rbac";

// Autorización del acudiente para un estudiante menor (Ley 1581 de 2012, art. 7): la
// administración la registra con el soporte que la institución conserve. Solo habilita lo
// que el acudiente autorizó; el estudiante igual puede no activarlo en cada examen.

export const DEFAULT_CONSENT_TEXT_VERSION = "2026-10-01";

export const guardianConsentSchema = z
  .object({
    guardianName: z.string().trim().min(3, "guardianName").max(120, "guardianName"),
    relationship: z.string().trim().min(2, "relationship").max(40, "relationship"),
    camera: z.boolean(),
    microphone: z.boolean(),
    evidence: z.string().trim().max(200, "evidence").default(""),
  })
  // Registrar que el acudiente no autorizó nada no habilita nada: basta con no registrar.
  .refine((value) => value.camera || value.microphone, { path: ["camera"], message: "nothingAuthorized" });

export type GuardianConsentInput = z.input<typeof guardianConsentSchema>;

/** El estudiante menor de la institución de quien administra (404 para cualquier otro). */
async function findMinorStudent(actor: CurrentUser, studentId: string) {
  assertCan(actor, "users:manage");
  const student = await prisma.user.findFirst({
    where: { id: studentId, institutionId: actor.institutionId, role: "STUDENT" },
    select: { id: true, name: true, email: true, isMinor: true, active: true },
  });
  if (!student) throw new NotFoundError("El estudiante no existe en tu institución.");
  return student;
}

/** Lo autorizado y vigente para un estudiante (para la pantalla previa y el inicio del examen). */
export async function activeGuardianConsent(studentId: string) {
  const consent = await prisma.guardianConsent.findUnique({
    where: { studentId },
    select: { camera: true, microphone: true, recordedAt: true, revokedAt: true },
  });
  if (!consent || consent.revokedAt) return null;
  return { camera: consent.camera, microphone: consent.microphone, recordedAt: consent.recordedAt };
}

/** La autorización vigente (o la última revocada) y su historial, para la administración. */
export async function getGuardianConsent(actor: CurrentUser, studentId: string) {
  const student = await findMinorStudent(actor, studentId);
  const [consent, history, policy] = await Promise.all([
    prisma.guardianConsent.findUnique({
      where: { studentId },
      select: {
        guardianName: true,
        relationship: true,
        camera: true,
        microphone: true,
        textVersion: true,
        evidence: true,
        recordedAt: true,
        revokedAt: true,
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { institutionId: actor.institutionId, entityType: "GuardianConsent", entityId: studentId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, createdAt: true, metadata: true, actor: { select: { name: true } } },
    }),
    prisma.policy.findUnique({ where: { institutionId: actor.institutionId }, select: { consentTextVersion: true } }),
  ]);
  return { student, consent, history, textVersion: policy?.consentTextVersion ?? DEFAULT_CONSENT_TEXT_VERSION };
}

/** Registra la autorización (o la reemplaza por una nueva). Solo para estudiantes menores. */
export async function recordGuardianConsent(actor: CurrentUser, studentId: string, input: GuardianConsentInput, now = new Date()) {
  const student = await findMinorStudent(actor, studentId);
  if (!student.isMinor) throw new ConflictError("Solo los estudiantes menores de edad necesitan la autorización del acudiente.", "notMinor");

  const parsed = guardianConsentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Revisa los datos de la autorización.",
      parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "camera", message: issue.message })),
    );
  }
  const { guardianName, relationship, camera, microphone, evidence } = parsed.data;
  const policy = await prisma.policy.findUnique({ where: { institutionId: actor.institutionId }, select: { consentTextVersion: true } });
  const textVersion = policy?.consentTextVersion ?? DEFAULT_CONSENT_TEXT_VERSION;
  const previous = await prisma.guardianConsent.findUnique({ where: { studentId }, select: { revokedAt: true } });

  const data = { guardianName, relationship, camera, microphone, textVersion, evidence: evidence || null, recordedById: actor.id, recordedAt: now, revokedAt: null };
  await prisma.guardianConsent.upsert({ where: { studentId }, create: { studentId, ...data }, update: data });

  // En la auditoría, qué se autorizó y quién lo registró; los datos del acudiente quedan solo en el registro.
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "GUARDIAN_CONSENT_RECORDED",
    entityType: "GuardianConsent",
    entityId: studentId,
    metadata: { camera, microphone, textVersion, replaced: Boolean(previous && !previous.revokedAt), withEvidence: Boolean(evidence) },
  });
  return { camera, microphone };
}

/** Deja sin efecto la autorización: desde el próximo examen, sin cámara ni micrófono. */
export async function revokeGuardianConsent(actor: CurrentUser, studentId: string, now = new Date()) {
  await findMinorStudent(actor, studentId);
  const revoked = await prisma.guardianConsent.updateMany({ where: { studentId, revokedAt: null }, data: { revokedAt: now } });
  if (revoked.count === 0) throw new ConflictError("No hay una autorización vigente para revocar.", "noConsent");
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "GUARDIAN_CONSENT_REVOKED",
    entityType: "GuardianConsent",
    entityId: studentId,
  });
}
