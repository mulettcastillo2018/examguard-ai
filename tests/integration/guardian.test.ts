import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Autorización del acudiente (Fase 7) contra la base real: registro, uso al presentar,
// reemplazo, revocación, auditoría y aislamiento entre instituciones.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("autorización del acudiente", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;
  const at = (minutes: number) => new Date(Date.UTC(2035, 1, 12, 13, 0) + minutes * 60_000);

  let db: typeof import("@/lib/db").prisma;
  let attempts: typeof import("@/modules/attempts/attempts");
  let guardian: typeof import("@/modules/guardian/guardian");
  const ids: Record<string, string> = {};
  let admin: CurrentUser;
  let teacher: CurrentUser;
  let otherAdmin: CurrentUser; // de otra institución
  let sofia: CurrentUser; // menor
  let tomas: CurrentUser; // mayor de edad

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string; isMinor?: boolean }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: Boolean(user.isMinor),
    mustChangePassword: false,
  });
  const valid = { guardianName: "Marta Díaz", relationship: "Madre", camera: true, microphone: false, evidence: "Formato firmado, secretaría" };
  let minute = 1;
  /** Presenta y entrega un intento; devuelve qué quedó autorizado. */
  async function present(consent: { camera: boolean; microphone: boolean }) {
    const attemptId = await attempts.startAttempt(sofia, ids.exam!, { clientId: "pc-sofia", consent }, at(minute));
    await attempts.submitAttempt(sofia, attemptId, "pc-sofia", at(minute + 1));
    minute += 2;
    return db.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { consent: { select: { camera: true, microphone: true, grantedBy: true } }, proctoring: { select: { cameraEnabled: true, microphoneEnabled: true } } },
    });
  }

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    attempts = await import("@/modules/attempts/attempts");
    guardian = await import("@/modules/guardian/guardian");
    const exams = await import("@/modules/exams/exams");
    const bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const institution = await db.institution.create({
      data: { name: "Acudientes (pruebas)", slug: `acu-${suffix}`, policy: { create: { consentTextVersion: "2035-01-01" } } },
    });
    const other = await db.institution.create({ data: { name: "Otra (pruebas)", slug: `acu-otra-${suffix}` } });
    ids.institution = institution.id;
    ids.other = other.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    admin = actorOf(await createCredentialUser({ ...base, name: "Rectoría", email: email("admin"), role: "ADMIN" }));
    teacher = actorOf(await createCredentialUser({ ...base, name: "Docente", email: email("docente"), role: "TEACHER" }));
    sofia = actorOf({ ...(await createCredentialUser({ ...base, name: "Sofía", email: email("sofia"), role: "STUDENT", isMinor: true })), isMinor: true });
    tomas = actorOf(await createCredentialUser({ ...base, name: "Tomás", email: email("tomas"), role: "STUDENT" }));
    otherAdmin = actorOf(
      await createCredentialUser({ institutionId: other.id, password: "Prueba-integracion-2026", mustChangePassword: false, name: "Otra rectoría", email: email("otra"), role: "ADMIN" }),
    );
    const course = await db.course.create({
      data: {
        institutionId: institution.id,
        code: `A-${suffix}`,
        name: "Curso",
        period: "2035-1",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: [{ studentId: sofia.id }, { studentId: tomas.id }] },
      },
    });
    const question = await bank.createQuestion(teacher, { type: "TRUE_FALSE", prompt: "¿Sí?", points: 1, answerKey: { value: true }, tags: [] });
    const exam = await exams.createExam(teacher, {
      title: "Con cámara y micrófono",
      courseId: course.id,
      startsAt: at(0),
      endsAt: at(240),
      durationMinutes: 30,
      maxAttempts: 5,
      proctoring: { camera: "requested", microphone: "requested" },
    });
    await exams.addQuestionsFromBank(teacher, exam.id, [question.id]);
    await exams.publishExam(teacher, exam.id, at(-10));
    ids.exam = exam.id;
  });

  afterAll(async () => {
    if (!db || !ids.institution) return;
    for (const institutionId of [ids.institution, ids.other]) {
      await db.auditLog.deleteMany({ where: { institutionId } });
      await db.exam.deleteMany({ where: { institutionId } });
      await db.question.deleteMany({ where: { institutionId } });
      await db.course.deleteMany({ where: { institutionId } });
      await db.guardianConsent.deleteMany({ where: { student: { institutionId } } });
      await db.user.deleteMany({ where: { institutionId } });
      await db.institution.delete({ where: { id: institutionId } });
    }
    await db.$disconnect();
  });

  it("sin autorización registrada, el menor presenta sin cámara ni micrófono aunque los acepte", async () => {
    expect((await attempts.getExamLobby(sofia, ids.exam!, at(1))).guardian).toBeNull();
    const result = await present({ camera: true, microphone: true });
    expect(result.consent).toEqual({ camera: false, microphone: false, grantedBy: null });
    expect(result.proctoring).toEqual({ cameraEnabled: false, microphoneEnabled: false });
  });

  it("solo la administración la registra, solo para menores y con datos válidos", async () => {
    await expect(guardian.recordGuardianConsent(teacher, sofia.id, valid)).rejects.toMatchObject({ status: 403 });
    await expect(guardian.recordGuardianConsent(admin, tomas.id, valid)).rejects.toMatchObject({ status: 409, code: "notMinor" });
    await expect(guardian.recordGuardianConsent(otherAdmin, sofia.id, valid)).rejects.toMatchObject({ status: 404 });
    await expect(guardian.recordGuardianConsent(admin, sofia.id, { ...valid, camera: false, microphone: false })).rejects.toMatchObject({
      status: 400,
      issues: [{ path: "camera", message: "nothingAuthorized" }],
    });
    await expect(guardian.recordGuardianConsent(admin, sofia.id, { ...valid, guardianName: "M", relationship: "" })).rejects.toMatchObject({
      issues: [
        { path: "guardianName", message: "guardianName" },
        { path: "relationship", message: "relationship" },
      ],
    });
    expect(await db.guardianConsent.count({ where: { studentId: sofia.id } })).toBe(0);

    await guardian.recordGuardianConsent(admin, sofia.id, valid, at(20));
    const view = await guardian.getGuardianConsent(admin, sofia.id);
    expect(view.consent).toMatchObject({ guardianName: "Marta Díaz", relationship: "Madre", camera: true, microphone: false, textVersion: "2035-01-01", revokedAt: null });
    expect(view.textVersion).toBe("2035-01-01");
    const { listInstitutionUsers } = await import("@/modules/users/users");
    const row = (await listInstitutionUsers(admin)).find((user) => user.id === sofia.id);
    expect(row?.guardianConsent).toBe(true);

    // En la auditoría, qué se autorizó; el nombre del acudiente no.
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "GUARDIAN_CONSENT_RECORDED", entityId: sofia.id } });
    expect(audit.metadata).toEqual({ camera: true, microphone: false, textVersion: "2035-01-01", replaced: false, withEvidence: true });
    expect(JSON.stringify(audit)).not.toContain("Marta");
  });

  it("el menor solo activa lo que el acudiente autorizó, y decide si lo usa", async () => {
    expect((await attempts.getExamLobby(sofia, ids.exam!, at(minute))).guardian).toEqual({ camera: true, microphone: false });
    // Acepta todo: queda la cámara (autorizada) y no el micrófono (no autorizado).
    let result = await present({ camera: true, microphone: true });
    expect(result.consent).toEqual({ camera: true, microphone: false, grantedBy: "GUARDIAN" });
    expect(result.proctoring).toEqual({ cameraEnabled: true, microphoneEnabled: false });
    // Con la autorización vigente, igual puede no activarla.
    result = await present({ camera: false, microphone: false });
    expect(result.consent).toEqual({ camera: false, microphone: false, grantedBy: null });
  });

  it("una nueva autorización reemplaza la anterior y revocarla la deja sin efecto", async () => {
    await guardian.recordGuardianConsent(admin, sofia.id, { ...valid, microphone: true, evidence: "" }, at(60));
    expect(await db.guardianConsent.count({ where: { studentId: sofia.id } })).toBe(1);
    expect((await attempts.getExamLobby(sofia, ids.exam!, at(minute))).guardian).toEqual({ camera: true, microphone: true });

    await guardian.revokeGuardianConsent(admin, sofia.id, at(70));
    expect((await attempts.getExamLobby(sofia, ids.exam!, at(minute))).guardian).toBeNull();
    expect((await present({ camera: true, microphone: true })).consent).toEqual({ camera: false, microphone: false, grantedBy: null });
    await expect(guardian.revokeGuardianConsent(admin, sofia.id)).rejects.toMatchObject({ status: 409, code: "noConsent" });

    const view = await guardian.getGuardianConsent(admin, sofia.id);
    expect(view.consent?.revokedAt).toEqual(at(70));
    expect(view.history.map((entry) => [entry.action, entry.metadata])).toEqual([
      ["GUARDIAN_CONSENT_REVOKED", null],
      ["GUARDIAN_CONSENT_RECORDED", { camera: true, microphone: true, textVersion: "2035-01-01", replaced: true, withEvidence: false }],
      ["GUARDIAN_CONSENT_RECORDED", { camera: true, microphone: false, textVersion: "2035-01-01", replaced: false, withEvidence: true }],
    ]);
    const row = (await (await import("@/modules/users/users")).listInstitutionUsers(admin)).find((user) => user.id === sofia.id);
    expect(row?.guardianConsent).toBe(false);
  });

  it("la administración de otra institución no la ve", async () => {
    await expect(guardian.getGuardianConsent(otherAdmin, sofia.id)).rejects.toMatchObject({ status: 404 });
    await expect(guardian.revokeGuardianConsent(otherAdmin, sofia.id)).rejects.toMatchObject({ status: 404 });
  });
});
