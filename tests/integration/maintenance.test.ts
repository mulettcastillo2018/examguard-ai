import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Tareas de producción (Fase 8) contra la base real: entrega de intentos vencidos, borrado de
// la evidencia por la retención, límites de uso y la ruta de la tarea diaria.
const hasDatabase = Boolean(process.env.DATABASE_URL);
process.env.CRON_SECRET = "secreto-de-prueba-de-la-tarea-diaria";

describe.skipIf(!hasDatabase)("mantenimiento de producción", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;
  const DAY = 1440;
  const at = (minutes: number) => new Date(Date.UTC(2036, 2, 2, 13, 0) + minutes * 60_000);
  // "Hoy" para la retención: ocho días después de la primera entrega (la política es de 7).
  const today = at(10 + 8 * DAY);

  let db: typeof import("@/lib/db").prisma;
  let attempts: typeof import("@/modules/attempts/attempts");
  let retention: typeof import("@/modules/maintenance/retention");
  let review: typeof import("@/modules/review/review");
  const ids: Record<string, string> = {};
  let teacher: CurrentUser;
  let ana: CurrentUser;
  let beto: CurrentUser;

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });
  const session = (attemptId: string) =>
    db.proctoringSession.findUniqueOrThrow({
      where: { attemptId },
      include: { _count: { select: { events: true, signals: true, agentRuns: true } }, review: true },
    });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    attempts = await import("@/modules/attempts/attempts");
    retention = await import("@/modules/maintenance/retention");
    review = await import("@/modules/review/review");
    const proctoring = await import("@/modules/proctoring/proctoring");
    const exams = await import("@/modules/exams/exams");
    const bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const institution = await db.institution.create({
      data: { name: "Mantenimiento (pruebas)", slug: `mant-${suffix}`, policy: { create: { evidenceRetentionDays: 7 } } },
    });
    ids.institution = institution.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    teacher = actorOf(await createCredentialUser({ ...base, name: "Docente", email: email("docente"), role: "TEACHER" }));
    ana = actorOf(await createCredentialUser({ ...base, name: "Ana", email: email("ana"), role: "STUDENT" }));
    beto = actorOf(await createCredentialUser({ ...base, name: "Beto", email: email("beto"), role: "STUDENT" }));
    const course = await db.course.create({
      data: {
        institutionId: institution.id,
        code: `M-${suffix}`,
        name: "Curso",
        period: "2036-1",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: [{ studentId: ana.id }, { studentId: beto.id }] },
      },
    });
    const question = await bank.createQuestion(teacher, { type: "TRUE_FALSE", prompt: "¿Sí?", points: 1, answerKey: { value: true }, tags: [] });
    const exam = await exams.createExam(teacher, {
      title: "Con retención",
      courseId: course.id,
      startsAt: at(0),
      endsAt: at(30 * DAY),
      durationMinutes: 30,
      maxAttempts: 2,
      proctoring: { camera: "requested" },
      simulationEnabled: true,
    });
    await exams.addQuestionsFromBank(teacher, exam.id, [question.id]);
    await exams.publishExam(teacher, exam.id, at(-10));
    ids.exam = exam.id;

    // Ana presenta con eventos (señal alta) y entrega; quien revisa decide.
    ids.ana1 = await attempts.startAttempt(ana, exam.id, { clientId: "pc-ana", consent: { camera: true, microphone: false }, device: { browser: "Edge", os: "Windows", device: "Computador" } }, at(1));
    await proctoring.ingestEvents(
      ana,
      ids.ana1,
      {
        clientId: "pc-ana",
        sentAt: at(5).toISOString(),
        events: [{ clientEventId: `faces-${suffix}`, type: "MULTIPLE_FACES", occurredAt: at(4).toISOString(), durationSec: 6, confidence: 0.93, simulated: true }],
      },
      at(5),
    );
    await attempts.submitAttempt(ana, ids.ana1, "pc-ana", at(10));
    await db.proctoringSession.update({ where: { attemptId: ids.ana1 }, data: { riskSummary: "Resumen de prueba", riskSummaryProvider: "template" } });
    ids.session1 = (await session(ids.ana1)).id;
    await review.saveReview(teacher, ids.session1, { outcome: "NEEDS_INVESTIGATION", notes: "Revisar el segundo rostro del minuto 4." }, at(20));

    // Beto empieza y nunca vuelve: su intento vence sin entregarse.
    ids.beto = await attempts.startAttempt(beto, exam.id, { clientId: "pc-beto", consent: { camera: false, microphone: false } }, at(1));

    // Ana presenta otra vez hace dos días: su evidencia todavía se conserva.
    ids.ana2 = await attempts.startAttempt(ana, exam.id, { clientId: "pc-ana", consent: { camera: true, microphone: false } }, at(6 * DAY));
    await attempts.submitAttempt(ana, ids.ana2, "pc-ana", at(6 * DAY + 10));
  });

  afterAll(async () => {
    if (!db || !ids.institution) return;
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `app:prueba-${suffix}` } } });
    await db.auditLog.deleteMany({ where: { institutionId: ids.institution } });
    await db.exam.deleteMany({ where: { institutionId: ids.institution } });
    await db.question.deleteMany({ where: { institutionId: ids.institution } });
    await db.course.deleteMany({ where: { institutionId: ids.institution } });
    await db.user.deleteMany({ where: { institutionId: ids.institution } });
    await db.institution.delete({ where: { id: ids.institution } });
    await db.$disconnect();
  });

  it("entrega los intentos que vencieron sin entregarse, a la hora límite", async () => {
    expect(await attempts.finalizeExpiredAttempts({ examId: ids.exam }, today)).toBe(1);
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: ids.beto! } });
    expect(attempt.status).toBe("AUTO_SUBMITTED");
    expect(attempt.submittedAt).toEqual(attempt.deadlineAt);
    expect(await attempts.finalizeExpiredAttempts({ examId: ids.exam }, today)).toBe(0);
  });

  it("borra la evidencia vencida y conserva la nota, el consentimiento y la revisión", async () => {
    const before = await session(ids.ana1!);
    expect(before._count.events).toBeGreaterThan(1);
    expect(before._count.signals).toBe(1);

    const results = await retention.purgeExpiredEvidence(today, { institutionId: ids.institution });
    // La primera de Ana y la de Beto (entregada a su hora límite); la reciente de Ana no.
    expect(results).toEqual([{ institutionId: ids.institution, sessions: 2, events: expect.any(Number) }]);

    const purged = await session(ids.ana1!);
    expect(purged._count).toEqual({ events: 0, signals: 0, agentRuns: 0 });
    expect(purged).toMatchObject({ evidencePurgedAt: today, riskSummary: null, browser: null, os: null, cameraEnabled: true, reviewStatus: "REVIEWED" });
    expect(purged.review).toMatchObject({ outcome: "NEEDS_INVESTIGATION", notes: "Revisar el segundo rostro del minuto 4." });
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: ids.ana1! }, include: { consent: true } });
    expect(attempt.score).not.toBeNull();
    expect(attempt.consent).toMatchObject({ camera: true });

    const recent = await session(ids.ana2!);
    expect(recent.evidencePurgedAt).toBeNull();
    expect(recent._count.events).toBeGreaterThan(0);

    const audit = await db.auditLog.findMany({ where: { institutionId: ids.institution, action: "EVIDENCE_PURGED" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toEqual({ sessions: 2, events: results[0]?.events, retentionDays: 7 });

    // Una segunda pasada no encuentra nada.
    expect(await retention.purgeExpiredEvidence(today, { institutionId: ids.institution })).toEqual([]);
    expect(await db.auditLog.count({ where: { institutionId: ids.institution, action: "EVIDENCE_PURGED" } })).toBe(1);
  });

  it("las pantallas dicen que la evidencia se borró, o hasta cuándo se conserva", async () => {
    const detail = await review.getSessionReview(teacher, ids.session1!, {}, today);
    expect(detail.session).toMatchObject({ evidencePurgedAt: today, evidenceExpiresAt: null, retentionDays: 7 });
    expect(detail.timeline).toEqual([]);
    expect(detail.signals).toEqual([]);

    const queue = await review.listReviewQueue(teacher, "ALL", today);
    expect(queue.rows.find((row) => row.sessionId === ids.session1)).toMatchObject({ evidencePurgedAt: today, evidenceExpiresAt: null });

    const mine = await review.getMySupervisionSession(ana, ids.ana1!);
    expect(mine.session.evidencePurgedAt).toEqual(today);
    expect(mine.events).toEqual([]);
    const recent = await review.getMySupervisionSession(ana, ids.ana2!);
    expect(recent.session.evidencePurgedAt).toBeNull();
  });

  it("el límite de uso cuenta por ventana y se reinicia al vencer", async () => {
    const { consumeRateLimit } = await import("@/lib/rate-limit");
    const key = `prueba-${suffix}`;
    const limit = { max: 3, windowSec: 60 };
    const t0 = Date.UTC(2036, 2, 2, 13, 0);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(key, limit, t0 + i * 1000));
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.resetsInSec).toBe(57);
    expect(await consumeRateLimit(key, limit, t0 + 61_000)).toMatchObject({ allowed: true, count: 1 });
    expect(await retention.purgeStaleRateLimits(new Date(t0 + 3 * 86_400_000))).toBeGreaterThanOrEqual(1);
    expect(await db.rateLimit.count({ where: { key: `app:${key}` } })).toBe(0);
  });

  it("la ruta de la tarea diaria exige el secreto", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/cron/daily/route");
    const call = (authorization?: string) =>
      GET(new NextRequest("http://localhost/api/cron/daily", { headers: authorization ? { authorization } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer otro-secreto-que-no-es")).status).toBe(401);
    const ok = await call(`Bearer ${process.env.CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ finalized: expect.any(Number), purged: expect.any(Array), rateLimits: expect.any(Number) });
  });
});
