import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Revisión humana (Fase 6) contra la base real: alcance, decisión, auditoría y lo que ve el estudiante.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("revisión humana", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;
  const at = (minutes: number) => new Date(Date.UTC(2034, 6, 10, 13, 0) + minutes * 60_000);

  let db: typeof import("@/lib/db").prisma;
  let attempts: typeof import("@/modules/attempts/attempts");
  let review: typeof import("@/modules/review/review");
  const ids: Record<string, string> = {};
  let teacher: CurrentUser;
  let otherTeacher: CurrentUser; // de otro curso
  let admin: CurrentUser;
  let ana: CurrentUser; // su sesión queda con revisión recomendada
  let beto: CurrentUser; // sin señales

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });
  const session = () => db.proctoringSession.findUniqueOrThrow({ where: { id: ids.session! }, include: { review: true } });
  const audits = () =>
    db.auditLog.findMany({ where: { action: "SESSION_REVIEWED", entityId: ids.session! }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    attempts = await import("@/modules/attempts/attempts");
    review = await import("@/modules/review/review");
    const proctoring = await import("@/modules/proctoring/proctoring");
    const exams = await import("@/modules/exams/exams");
    const bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const institution = await db.institution.create({
      data: { name: "Revisión (pruebas)", slug: `rev-${suffix}`, policy: { create: { evidenceRetentionDays: 45 } } },
    });
    ids.institution = institution.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    teacher = actorOf(await createCredentialUser({ ...base, name: "Docente", email: email("docente"), role: "TEACHER" }));
    otherTeacher = actorOf(await createCredentialUser({ ...base, name: "Otra docente", email: email("otra"), role: "TEACHER" }));
    admin = actorOf(await createCredentialUser({ ...base, name: "Administración", email: email("admin"), role: "ADMIN" }));
    ana = actorOf(await createCredentialUser({ ...base, name: "Ana", email: email("ana"), role: "STUDENT" }));
    beto = actorOf(await createCredentialUser({ ...base, name: "Beto", email: email("beto"), role: "STUDENT" }));
    const course = await db.course.create({
      data: {
        institutionId: institution.id,
        code: `R-${suffix}`,
        name: "Curso",
        period: "2034-2",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: [{ studentId: ana.id }, { studentId: beto.id }] },
      },
    });
    await db.course.create({
      data: { institutionId: institution.id, code: `O-${suffix}`, name: "Otro curso", period: "2034-2", teachers: { create: [{ teacherId: otherTeacher.id }] } },
    });
    const question = await bank.createQuestion(teacher, { type: "TRUE_FALSE", prompt: "¿Sí?", points: 1, answerKey: { value: true }, tags: [] });
    const exam = await exams.createExam(teacher, {
      title: "Con revisión",
      courseId: course.id,
      startsAt: at(0),
      endsAt: at(240),
      durationMinutes: 120,
      maxAttempts: 1,
      proctoring: { camera: "requested" },
      simulationEnabled: true,
    });
    await exams.addQuestionsFromBank(teacher, exam.id, [question.id]);
    await exams.publishExam(teacher, exam.id, at(-10));

    ids.ana = await attempts.startAttempt(ana, exam.id, { clientId: "pc-ana", consent: { camera: true, microphone: false } }, at(1));
    ids.beto = await attempts.startAttempt(beto, exam.id, { clientId: "pc-beto", consent: { camera: false, microphone: false } }, at(1));
    // Una señal alta (varios rostros, simulada) basta para recomendar la revisión.
    await proctoring.ingestEvents(
      ana,
      ids.ana,
      {
        clientId: "pc-ana",
        sentAt: at(11).toISOString(),
        events: [
          { clientEventId: `faces-${suffix}`, type: "MULTIPLE_FACES", occurredAt: at(10).toISOString(), durationSec: 6, confidence: 0.93, simulated: true },
          { clientEventId: `tab-${suffix}`, type: "TAB_SWITCH", occurredAt: at(10.5).toISOString(), durationSec: 4 },
        ],
      },
      at(11),
    );
    ids.session = (await db.proctoringSession.findUniqueOrThrow({ where: { attemptId: ids.ana } })).id;
    ids.betoSession = (await db.proctoringSession.findUniqueOrThrow({ where: { attemptId: ids.beto } })).id;
  });

  afterAll(async () => {
    if (!db || !ids.institution) return;
    await db.auditLog.deleteMany({ where: { institutionId: ids.institution } });
    await db.exam.deleteMany({ where: { institutionId: ids.institution } });
    await db.question.deleteMany({ where: { institutionId: ids.institution } });
    await db.course.deleteMany({ where: { institutionId: ids.institution } });
    await db.user.deleteMany({ where: { institutionId: ids.institution } });
    await db.institution.delete({ where: { id: ids.institution } });
    await db.$disconnect();
  });

  it("la cola muestra la sesión recomendada solo a quien puede revisarla", async () => {
    const queue = await review.listReviewQueue(teacher);
    expect(queue.rows.map((row) => row.sessionId)).toEqual([ids.session]);
    expect(queue.rows[0]).toMatchObject({ reviewStatus: "RECOMMENDED", highestSeverity: "HIGH", review: null, attempt: { student: { name: "Ana" } } });
    expect(queue.counts).toEqual({ recommended: 1, reviewed: 0 });
    expect(await review.countPendingReviews(teacher)).toBe(1);

    // Las sesiones sin señales no entran ni con el filtro "todas".
    expect((await review.listReviewQueue(teacher, "ALL")).rows.map((row) => row.sessionId)).not.toContain(ids.betoSession);
    // La administración ve toda la institución; otra docente, solo sus cursos.
    expect((await review.listReviewQueue(admin)).rows.map((row) => row.sessionId)).toEqual([ids.session]);
    expect((await review.listReviewQueue(otherTeacher)).rows).toEqual([]);
    await expect(review.listReviewQueue(ana)).rejects.toMatchObject({ status: 403 });
  });

  it("la revisión trae señales etiquetadas, la línea de tiempo con citas y filtros", async () => {
    const detail = await review.getSessionReview(teacher, ids.session!, {}, at(20));
    expect(detail.signals.map((signal) => signal.label)).toEqual(["S1"]);
    expect(detail.signals[0]).toMatchObject({ severity: "HIGH" });
    const faces = detail.timeline.find((event) => event.type === "MULTIPLE_FACES");
    expect(faces?.citedBy).toEqual(["S1"]);
    expect(detail.timeline.find((event) => event.type === "TAB_SWITCH")?.citedBy).toEqual([]);
    expect(detail.totals).toMatchObject({ VISION: 1, FOCUS: 1 });
    expect(detail.attempt.consent).toMatchObject({ camera: true, microphone: false });
    expect(detail.canReview).toBe(false);
    expect(detail.session.durationSec).toBe(19 * 60);

    // Filtrar acota la línea de tiempo, pero no los totales.
    const onlyVision = await review.getSessionReview(teacher, ids.session!, { category: "VISION" }, at(20));
    expect(onlyVision.timeline.map((event) => event.type)).toEqual(["MULTIPLE_FACES"]);
    expect(onlyVision.totals).toEqual(detail.totals);
    expect((await review.getSessionReview(teacher, ids.session!, { source: "SERVER", category: "VISION" })).timeline).toEqual([]);

    await expect(review.getSessionReview(otherTeacher, ids.session!)).rejects.toMatchObject({ status: 404 });
    await expect(review.getSessionReview(ana, ids.session!)).rejects.toMatchObject({ status: 403 });
  });

  it("no se decide mientras el estudiante presenta", async () => {
    await expect(review.saveReview(teacher, ids.session!, { outcome: "NO_IRREGULARITY" }, at(25))).rejects.toMatchObject({
      status: 409,
      code: "inProgress",
    });
    expect((await session()).review).toBeNull();
  });

  it("pedir una investigación exige observaciones", async () => {
    await attempts.submitAttempt(ana, ids.ana!, "pc-ana", at(30));
    expect((await review.getSessionReview(teacher, ids.session!)).canReview).toBe(true);

    for (const notes of [undefined, "", "   corto  "]) {
      await expect(review.saveReview(teacher, ids.session!, { outcome: "NEEDS_INVESTIGATION", notes }, at(31))).rejects.toMatchObject({
        status: 400,
        issues: [{ path: "notes", message: "notesRequired" }],
      });
    }
    await expect(review.saveReview(teacher, ids.session!, { outcome: "NO_IRREGULARITY", notes: "x".repeat(2001) })).rejects.toMatchObject({
      issues: [{ path: "notes", message: "notesTooLong" }],
    });
    await expect(review.saveReview(teacher, ids.session!, { outcome: "CHEATED" as never })).rejects.toMatchObject({
      issues: [{ path: "outcome", message: "outcome" }],
    });
    expect(await audits()).toEqual([]);
  });

  it("guardar marca la sesión como revisada y una corrección queda auditada", async () => {
    await review.saveReview(teacher, ids.session!, { outcome: "NO_IRREGULARITY" }, at(35));
    let current = await session();
    expect(current.reviewStatus).toBe("REVIEWED");
    expect(current.review).toMatchObject({ reviewerId: teacher.id, outcome: "NO_IRREGULARITY", notes: null });
    expect(await review.countPendingReviews(teacher)).toBe(0);
    expect((await review.listReviewQueue(teacher, "REVIEWED")).rows[0]?.review).toMatchObject({
      outcome: "NO_IRREGULARITY",
      reviewer: { name: "Docente" },
    });

    const notes = "Revisar con el estudiante la grabación del minuto 10.";
    await review.saveReview(admin, ids.session!, { outcome: "NEEDS_INVESTIGATION", notes: `  ${notes}  ` }, at(40));
    current = await session();
    expect(current.review).toMatchObject({ reviewerId: admin.id, outcome: "NEEDS_INVESTIGATION", notes });
    expect(await db.review.count({ where: { sessionId: ids.session! } })).toBe(1);

    const log = await audits();
    expect(log.map((entry) => [entry.actorId, entry.metadata])).toEqual([
      [teacher.id, { outcome: "NO_IRREGULARITY", previousOutcome: null, attemptId: ids.ana, examId: expect.any(String), withNotes: false }],
      [admin.id, { outcome: "NEEDS_INVESTIGATION", previousOutcome: "NO_IRREGULARITY", attemptId: ids.ana, examId: expect.any(String), withNotes: true }],
    ]);
    // Las observaciones viven solo en la revisión, no en la bitácora.
    expect(JSON.stringify(log)).not.toContain("grabación");

    const detail = await review.getSessionReview(teacher, ids.session!);
    expect(detail.review).toMatchObject({ outcome: "NEEDS_INVESTIGATION", reviewer: { name: "Administración" } });
    expect(detail.history.map((entry) => entry.actor?.name)).toEqual(["Administración", "Docente"]);
  });

  it("un análisis posterior no deshace la revisión humana", async () => {
    const { analyzeSession } = await import("@/modules/agents/orchestrator");
    expect((await analyzeSession(ids.session!, at(50)))?.applied).toBe(true);
    expect((await session()).reviewStatus).toBe("REVIEWED");
  });

  it("el estudiante ve sus hechos registrados y si hubo revisión, sin el resultado", async () => {
    const mine = await review.listMySupervision(ana);
    expect(mine.retentionDays).toBe(45);
    expect(mine.rows).toHaveLength(1);
    // Inicio, varios rostros, cambio de pestaña y entrega.
    expect(mine.rows[0]).toMatchObject({ attemptId: ids.ana, eventCount: 4, reviewState: "DONE", consent: { camera: true, microphone: false } });
    expect((await review.listMySupervision(beto)).rows[0]).toMatchObject({ attemptId: ids.beto, reviewState: "NONE" });

    const detail = await review.getMySupervisionSession(ana, ids.ana!);
    expect(detail.events.map((event) => event.type)).toEqual(["EXAM_STARTED", "MULTIPLE_FACES", "TAB_SWITCH", "EXAM_SUBMITTED"]);
    expect(detail.reviewState).toBe("DONE");
    // Ni señales, ni resultado, ni observaciones de quien revisó.
    const visible = JSON.stringify(detail);
    for (const hidden of ["NEEDS_INVESTIGATION", "grabación", "signals", "riskSummary"]) expect(visible).not.toContain(hidden);

    await expect(review.getMySupervisionSession(beto, ids.ana!)).rejects.toMatchObject({ status: 404 });
    await expect(review.listMySupervision(teacher)).rejects.toMatchObject({ status: 403 });
  });
});
