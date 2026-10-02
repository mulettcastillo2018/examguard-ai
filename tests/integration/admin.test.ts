import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Administración de usuarios y cursos contra la base real. Requiere DATABASE_URL.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("administración de usuarios y cursos", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;

  let db: typeof import("@/lib/db").prisma;
  let users: typeof import("@/modules/users/users");
  let courses: typeof import("@/modules/courses/courses");
  let auth: ReturnType<typeof import("@/modules/auth/auth").getAuth>;
  const ids: Record<string, string> = {};
  let admin: CurrentUser;
  let otherAdmin: CurrentUser;
  let teacher: CurrentUser;

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    users = await import("@/modules/users/users");
    courses = await import("@/modules/courses/courses");
    auth = (await import("@/modules/auth/auth")).getAuth();
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const [a, b] = await Promise.all([
      db.institution.create({ data: { name: "Admin A (pruebas)", slug: `adm-a-${suffix}` } }),
      db.institution.create({ data: { name: "Admin B (pruebas)", slug: `adm-b-${suffix}` } }),
    ]);
    ids.a = a.id;
    ids.b = b.id;
    const password = "Prueba-integracion-2026";
    admin = actorOf(await createCredentialUser({ institutionId: a.id, name: "Admin A", email: email("admin-a"), role: "ADMIN", password, mustChangePassword: false }));
    teacher = actorOf(await createCredentialUser({ institutionId: a.id, name: "Docente A", email: email("docente-a"), role: "TEACHER", password, mustChangePassword: false }));
    otherAdmin = actorOf(await createCredentialUser({ institutionId: b.id, name: "Admin B", email: email("admin-b"), role: "ADMIN", password, mustChangePassword: false }));
    ids.studentB = (await createCredentialUser({ institutionId: b.id, name: "Estudiante B", email: email("estudiante-b"), role: "STUDENT", password })).id;
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

  it("crea un usuario con contraseña temporal que sirve para entrar y obliga a cambiarla", async () => {
    const { user, temporaryPassword } = await users.createUser(admin, { name: "Nueva Estudiante", email: email("nueva"), role: "STUDENT", isMinor: true });
    ids.student = user.id;
    expect(user.mustChangePassword).toBe(true);
    expect(user.isMinor).toBe(true);
    const login = await auth.api.signInEmail({ body: { email: email("nueva"), password: temporaryPassword }, asResponse: true });
    expect(login.status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "USER_CREATED", entityId: user.id } })).toBe(1);
  });

  it("rechaza correos repetidos, datos inválidos y menores que no son estudiantes", async () => {
    await expect(users.createUser(admin, { name: "Repetida", email: email("nueva"), role: "STUDENT" })).rejects.toMatchObject({ status: 409 });
    await expect(users.createUser(admin, { name: "X", email: "no-es-correo", role: "STUDENT" })).rejects.toMatchObject({ status: 400 });
    await expect(users.createUser(admin, { name: "Docente menor", email: email("dm"), role: "TEACHER", isMinor: true })).rejects.toMatchObject({ status: 400 });
  });

  it("un docente no puede administrar usuarios", async () => {
    await expect(users.createUser(teacher, { name: "Intruso", email: email("intruso"), role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
  });

  it("no permite desactivarse a sí mismo ni dejar la institución sin administración", async () => {
    await expect(users.updateUser(admin, admin.id, { name: "Admin A", role: "ADMIN", active: false })).rejects.toMatchObject({ status: 403 });
    await expect(users.updateUser(admin, admin.id, { name: "Admin A", role: "TEACHER", active: true })).rejects.toMatchObject({ status: 403 });
  });

  it("desactivar cierra las sesiones abiertas y lo deja en la auditoría", async () => {
    await auth.api.signInEmail({ body: { email: email("docente-a"), password: "Prueba-integracion-2026" } });
    expect(await db.session.count({ where: { userId: teacher.id } })).toBeGreaterThan(0);
    await users.updateUser(admin, teacher.id, { name: "Docente A", role: "TEACHER", active: false });
    expect(await db.session.count({ where: { userId: teacher.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "USER_DEACTIVATED", entityId: teacher.id } })).toBe(1);
    await users.updateUser(admin, teacher.id, { name: "Docente A", role: "TEACHER", active: true });
  });

  it("no puede tocar usuarios de otra institución", async () => {
    await expect(users.updateUser(admin, ids.studentB!, { name: "Ajeno", role: "STUDENT", active: false })).rejects.toMatchObject({ status: 404 });
    await expect(users.resetUserPassword(admin, ids.studentB!)).rejects.toMatchObject({ status: 404 });
  });

  it("restablecer la contraseña invalida la anterior y exige cambiarla", async () => {
    const { temporaryPassword } = await users.resetUserPassword(admin, ids.student!);
    const user = await db.user.findUniqueOrThrow({ where: { id: ids.student } });
    expect(user.mustChangePassword).toBe(true);
    const login = await auth.api.signInEmail({ body: { email: email("nueva"), password: temporaryPassword }, asResponse: true });
    expect(login.status).toBe(200);
  });

  it("crea cursos, rechaza duplicados y asigna solo personas de la institución con el rol correcto", async () => {
    const course = await courses.createCourse(admin, { code: "mat-11a", name: "Matemáticas 11A", period: "2026-2" });
    ids.course = course.id;
    expect(course.code).toBe("MAT-11A");
    await expect(courses.createCourse(admin, { code: "MAT-11A", name: "Otro", period: "2026-2" })).rejects.toMatchObject({ status: 409 });
    await expect(courses.createCourse(admin, { code: "MAT 11", name: "Mal código", period: "2026" })).rejects.toMatchObject({ status: 400 });

    await courses.setCourseMembers(admin, course.id, "teachers", [teacher.id]);
    await courses.setCourseMembers(admin, course.id, "students", [ids.student!]);
    await expect(courses.setCourseMembers(admin, course.id, "students", [ids.studentB!])).rejects.toMatchObject({ status: 400 });
    await expect(courses.setCourseMembers(admin, course.id, "students", [teacher.id])).rejects.toMatchObject({ status: 400 });
    await expect(courses.setCourseMembers(otherAdmin, course.id, "students", [])).rejects.toMatchObject({ status: 404 });

    const detail = await courses.getCourseForAdmin(admin, course.id);
    expect(detail.teacherIds).toEqual([teacher.id]);
    expect(detail.studentIds).toEqual([ids.student]);
  });

  it("importa una planilla: crea, reporta repetidos y errores, y matricula en los cursos existentes", async () => {
    const csv = [
      "nombre;correo;rol;menor_de_edad;cursos",
      `Importada Uno;${email("imp-1")};estudiante;sí;MAT-11A|NO-EXISTE`,
      `Importado Dos;${email("imp-2")};docente;no;MAT-11A`,
      `Repetida;${email("nueva")};estudiante;no;`,
      `Sin correo;no-es-correo;estudiante;no;`,
    ].join("\n");
    const result = await users.importUsers(admin, csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toEqual({ created: 2, exists: 1, invalid: 1 });
    const first = result.results.find((r) => r.status === "created" && r.email === email("imp-1"));
    expect(first?.status === "created" && first.unknownCourses).toEqual(["NO-EXISTE"]);

    const imported = await db.user.findUniqueOrThrow({ where: { email: email("imp-1") }, include: { enrollments: true } });
    expect(imported.isMinor).toBe(true);
    expect(imported.mustChangePassword).toBe(true);
    expect(imported.enrollments.map((e) => e.courseId)).toEqual([ids.course]);
    const importedTeacher = await db.user.findUniqueOrThrow({ where: { email: email("imp-2") }, include: { teaching: true } });
    expect(importedTeacher.teaching.map((t) => t.courseId)).toEqual([ids.course]);
    expect(await db.auditLog.count({ where: { action: "USERS_IMPORTED", institutionId: ids.a } })).toBe(1);
  });
});
