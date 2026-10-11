import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Modo demostración (Fase 8): las cuentas de ejemplo no se pueden modificar desde la demo,
// las demás sí. Se activa aquí con las variables de entorno, antes de cargar los módulos.
const hasDatabase = Boolean(process.env.DATABASE_URL);
process.env.DEMO_MODE = "1";
process.env.DEMO_PASSWORD = "Demo-publica-de-prueba";

describe.skipIf(!hasDatabase)("modo demostración", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let db: typeof import("@/lib/db").prisma;
  let users: typeof import("@/modules/users/users");
  const ids: Record<string, string> = {};
  let admin: CurrentUser;

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    users = await import("@/modules/users/users");
    const { createCredentialUser } = await import("@/modules/auth/credentials");
    const institution = await db.institution.create({ data: { name: "Demo (pruebas)", slug: `demo-${suffix}` } });
    ids.institution = institution.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    const created = await createCredentialUser({ ...base, name: "Rectoría", email: `admin.${suffix}@pruebas.test`, role: "ADMIN" });
    admin = { id: created.id, name: created.name, email: created.email, role: "ADMIN", institutionId: institution.id, isMinor: false, mustChangePassword: false };
    // Una cuenta "de ejemplo" (dominio de la demo) y una creada por quien visita.
    ids.example = (await createCredentialUser({ ...base, name: "Docente de ejemplo", email: `docente-${suffix}@losandes.test`, role: "TEACHER" })).id;
    ids.own = (await createCredentialUser({ ...base, name: "Docente propio", email: `propio.${suffix}@pruebas.test`, role: "TEACHER" })).id;
  });

  afterAll(async () => {
    if (!db || !ids.institution) return;
    await db.auditLog.deleteMany({ where: { institutionId: ids.institution } });
    await db.user.deleteMany({ where: { institutionId: ids.institution } });
    await db.institution.delete({ where: { id: ids.institution } });
    await db.$disconnect();
  });

  it("la demo ofrece las cuentas de ejemplo con la contraseña pública", async () => {
    const { demoSettings, DEMO_ACCOUNTS, isDemoAccount } = await import("@/modules/demo/demo");
    expect(demoSettings()).toEqual({ password: "Demo-publica-de-prueba" });
    expect(DEMO_ACCOUNTS.map((account) => account.key)).toEqual(["admin", "teacher", "student", "minor"]);
    expect(isDemoAccount("cmejia@losandes.test")).toBe(true);
    expect(isDemoAccount("CMEJIA@LOSANDES.TEST")).toBe(true);
    expect(isDemoAccount("alguien@colegio.edu.co")).toBe(false);
  });

  it("las cuentas de ejemplo no se editan ni se les restablece la contraseña; las propias sí", async () => {
    const update = { name: "Otro nombre", role: "TEACHER" as const, isMinor: false, active: false };
    await expect(users.updateUser(admin, ids.example!, update)).rejects.toMatchObject({ status: 403 });
    await expect(users.resetUserPassword(admin, ids.example!)).rejects.toMatchObject({ status: 403 });
    expect(await db.user.findUniqueOrThrow({ where: { id: ids.example! }, select: { active: true } })).toEqual({ active: true });

    await users.updateUser(admin, ids.own!, update);
    expect(await db.user.findUniqueOrThrow({ where: { id: ids.own! }, select: { name: true, active: true } })).toEqual({ name: "Otro nombre", active: false });
    const reset = await users.resetUserPassword(admin, ids.own!);
    expect(reset.temporaryPassword).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
  });
});
