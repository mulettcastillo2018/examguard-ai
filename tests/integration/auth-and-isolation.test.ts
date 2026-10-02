import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Autenticación (Better Auth + hooks propios) y aislamiento entre instituciones.
// Requiere DATABASE_URL; sin ella la suite se omite.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("autenticación y aislamiento entre instituciones", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const password = "Prueba-integracion-2026";
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;

  let db: typeof import("@/lib/db").prisma;
  let auth: ReturnType<typeof import("@/modules/auth/auth").getAuth>;
  const ids: Record<string, string> = {};
  const actors: Record<string, CurrentUser> = {};

  async function signIn(address: string, pass = password) {
    return auth.api.signInEmail({ body: { email: address, password: pass }, asResponse: true });
  }

  function sessionCookie(response: Response): string {
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((value) => value.includes("session_token="));
    if (!session) throw new Error("La respuesta no trae cookie de sesión");
    return session.split(";")[0] ?? "";
  }

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    auth = (await import("@/modules/auth/auth")).getAuth();
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const [a, b] = await Promise.all([
      db.institution.create({ data: { name: "Institución A (pruebas)", slug: `a-${suffix}` } }),
      db.institution.create({ data: { name: "Institución B (pruebas)", slug: `b-${suffix}` } }),
    ]);
    ids.a = a.id;
    ids.b = b.id;

    const create = async (key: string, data: Parameters<typeof createCredentialUser>[0]) => {
      const user = await createCredentialUser(data);
      ids[key] = user.id;
      actors[key] = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        institutionId: user.institutionId,
        isMinor: user.isMinor,
        mustChangePassword: user.mustChangePassword,
      };
    };

    await create("adminA", { institutionId: a.id, name: "Admin A", email: email("admin-a"), role: "ADMIN", password, mustChangePassword: false });
    await create("teacherA", { institutionId: a.id, name: "Docente A", email: email("docente-a"), role: "TEACHER", password, mustChangePassword: false });
    await create("studentA", { institutionId: a.id, name: "Estudiante A", email: email("estudiante-a"), role: "STUDENT", password, isMinor: true });
    await create("inactiveA", { institutionId: a.id, name: "Inactivo A", email: email("inactivo-a"), role: "STUDENT", password, mustChangePassword: false });
    await create("adminB", { institutionId: b.id, name: "Admin B", email: email("admin-b"), role: "ADMIN", password, mustChangePassword: false });
    await db.user.update({ where: { id: ids.inactiveA }, data: { active: false } });

    const ownCourse = await db.course.create({
      data: { institutionId: a.id, code: `PROPIO-${suffix}`, name: "Curso propio", period: "2026-2", teachers: { create: { teacherId: ids.teacherA! } } },
    });
    await db.course.create({ data: { institutionId: a.id, code: `AJENO-${suffix}`, name: "Curso ajeno", period: "2026-2" } });
    ids.ownCourse = ownCourse.id;
  });

  afterAll(async () => {
    if (!db) return;
    const institutionIds = [ids.a, ids.b].filter((id): id is string => Boolean(id));
    await db.auditLog.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.course.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.user.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.institution.deleteMany({ where: { id: { in: institutionIds } } });
    await db.$disconnect();
  });

  it("inicia sesión con la contraseña correcta y lo registra en la auditoría", async () => {
    const response = await signIn(email("admin-a"));
    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toContain("session_token=");

    const audit = await db.auditLog.findFirst({ where: { actorId: ids.adminA, action: "LOGIN_SUCCEEDED" } });
    expect(audit?.institutionId).toBe(ids.a);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const response = await signIn(email("admin-a"), "Contrasena-equivocada");
    expect(response.status).toBe(401);
  });

  it("bloquea a un usuario desactivado aunque la contraseña sea correcta", async () => {
    const response = await signIn(email("inactivo-a"));
    expect(response.status).not.toBe(200);
    expect(await db.session.count({ where: { userId: ids.inactiveA } })).toBe(0);
    const audit = await db.auditLog.findFirst({ where: { actorId: ids.inactiveA, action: "LOGIN_BLOCKED_INACTIVE" } });
    expect(audit).not.toBeNull();
  });

  it("al cambiar la contraseña temporal se quita la obligación y queda auditado", async () => {
    const login = await signIn(email("estudiante-a"));
    expect(login.status).toBe(200);

    const change = await auth.api.changePassword({
      body: { currentPassword: password, newPassword: "Nueva-clave-de-prueba-2026", revokeOtherSessions: true },
      headers: new Headers({ cookie: sessionCookie(login) }),
      asResponse: true,
    });
    expect(change.status).toBe(200);

    const user = await db.user.findUniqueOrThrow({ where: { id: ids.studentA } });
    expect(user.mustChangePassword).toBe(false);
    expect(await db.auditLog.count({ where: { actorId: ids.studentA, action: "PASSWORD_CHANGED" } })).toBe(1);
    expect((await signIn(email("estudiante-a"), "Nueva-clave-de-prueba-2026")).status).toBe(200);
  });

  it("el administrador solo ve los usuarios de su institución", async () => {
    const { listInstitutionUsers } = await import("@/modules/users/users");
    const users = await listInstitutionUsers(actors.adminA!);
    const emails = users.map((user) => user.email);
    expect(emails).toContain(email("docente-a"));
    expect(emails).not.toContain(email("admin-b"));
    expect(users.every((user) => user.email.endsWith("@pruebas.test"))).toBe(true);
  });

  it("un estudiante o un docente no pueden listar los usuarios de la institución", async () => {
    const { listInstitutionUsers } = await import("@/modules/users/users");
    await expect(listInstitutionUsers(actors.studentA!)).rejects.toMatchObject({ status: 403 });
    await expect(listInstitutionUsers(actors.teacherA!)).rejects.toMatchObject({ status: 403 });
  });

  it("el docente solo ve los cursos que dicta", async () => {
    const { listTeacherCourses } = await import("@/modules/courses/courses");
    const courses = await listTeacherCourses(actors.teacherA!);
    expect(courses.map((course) => course.id)).toEqual([ids.ownCourse]);
  });
});
