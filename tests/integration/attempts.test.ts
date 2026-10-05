import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Presentar un examen y publicar notas, contra la base real. Requiere DATABASE_URL.
// Las horas son simuladas (parámetro `now`) para recorrer la ventana sin esperar.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("examen del estudiante y resultados", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;
  const at = (minutes: number) => new Date(Date.UTC(2031, 2, 10, 13, 0) + minutes * 60_000);
  const T0 = at(0); // apertura; el cierre es a los 120 minutos

  let db: typeof import("@/lib/db").prisma;
  let attempts: typeof import("@/modules/attempts/attempts");
  let results: typeof import("@/modules/attempts/results");
  let exams: typeof import("@/modules/exams/exams");
  const ids: Record<string, string> = {};
  const q: Record<string, string> = {};
  let teacher: CurrentUser;
  let otherTeacher: CurrentUser;
  let ana: CurrentUser; // adulta, con 10 minutos extra
  let beto: CurrentUser; // menor de edad
  let outsider: CurrentUser; // estudiante de otro curso

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string; isMinor?: boolean }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: user.isMinor ?? false,
    mustChangePassword: false,
  });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    attempts = await import("@/modules/attempts/attempts");
    results = await import("@/modules/attempts/results");
    exams = await import("@/modules/exams/exams");
    const bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const institution = await db.institution.create({ data: { name: "Intentos (pruebas)", slug: `att-${suffix}` } });
    ids.institution = institution.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    teacher = actorOf(await createCredentialUser({ ...base, name: "Docente", email: email("docente"), role: "TEACHER" }));
    otherTeacher = actorOf(await createCredentialUser({ ...base, name: "Otro docente", email: email("otro"), role: "TEACHER" }));
    ana = actorOf(await createCredentialUser({ ...base, name: "Ana", email: email("ana"), role: "STUDENT" }));
    beto = actorOf({ ...(await createCredentialUser({ ...base, name: "Beto", email: email("beto"), role: "STUDENT", isMinor: true })), isMinor: true });
    outsider = actorOf(await createCredentialUser({ ...base, name: "Ajena", email: email("ajena"), role: "STUDENT" }));

    const course = await db.course.create({
      data: {
        institutionId: institution.id,
        code: `C-${suffix}`,
        name: "Curso",
        period: "2031-1",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: [{ studentId: ana.id }, { studentId: beto.id }] },
      },
    });
    await db.course.create({
      data: {
        institutionId: institution.id,
        code: `O-${suffix}`,
        name: "Otro curso",
        period: "2031-1",
        teachers: { create: [{ teacherId: otherTeacher.id }] },
        enrollments: { create: [{ studentId: outsider.id }] },
      },
    });

    const created = await Promise.all([
      bank.createQuestion(teacher, {
        type: "SINGLE_CHOICE",
        prompt: "Única",
        points: 2,
        options: [
          { id: "opta0001", label: "A" },
          { id: "optb0002", label: "B" },
        ],
        answerKey: { correctOptionIds: ["optb0002"] },
        tags: [],
      }),
      bank.createQuestion(teacher, {
        type: "MULTIPLE_CHOICE",
        prompt: "Múltiple",
        points: 1,
        options: [
          { id: "opta0001", label: "A" },
          { id: "optb0002", label: "B" },
          { id: "optc0003", label: "C" },
        ],
        answerKey: { correctOptionIds: ["opta0001", "optc0003"] },
        tags: [],
      }),
      bank.createQuestion(teacher, { type: "SHORT_ANSWER", prompt: "Capital", points: 1, answerKey: { accepted: ["Bogotá"] }, tags: [] }),
      bank.createQuestion(teacher, { type: "LONG_ANSWER", prompt: "Ensayo", points: 3, answerKey: { rubric: "Ideas claras" }, tags: [] }),
    ]);
    const exam = await exams.createExam(teacher, {
      title: "Parcial",
      courseId: course.id,
      startsAt: T0,
      endsAt: at(120),
      durationMinutes: 30,
      maxAttempts: 2,
      proctoring: { camera: "requested", microphone: "requested" },
    });
    ids.exam = exam.id;
    await exams.addQuestionsFromBank(teacher, exam.id, created.map((question) => question.id));
    for (const question of await db.examQuestion.findMany({ where: { examId: exam.id } })) q[question.prompt] = question.id;
    await exams.setAccommodation(teacher, exam.id, ana.id, { extraMinutes: 10, cameraExempt: false });
    await exams.publishExam(teacher, exam.id, at(-60));
  });

  afterAll(async () => {
    if (!db) return;
    const institutionId = ids.institution;
    if (!institutionId) return;
    await db.auditLog.deleteMany({ where: { institutionId } });
    await db.exam.deleteMany({ where: { institutionId } });
    await db.question.deleteMany({ where: { institutionId } });
    await db.course.deleteMany({ where: { institutionId } });
    await db.user.deleteMany({ where: { institutionId } });
    await db.institution.delete({ where: { id: institutionId } });
    await db.$disconnect();
  });

  it("antes de la apertura el examen se ve pero no se puede empezar", async () => {
    const lobby = await attempts.getExamLobby(ana, ids.exam as string, at(-5));
    expect(lobby.blocked).toBe("upcoming");
    expect(lobby.extraMinutes).toBe(10);
    expect(lobby.requests).toEqual({ camera: true, microphone: true, fullscreen: true });
    await expect(attempts.startAttempt(ana, ids.exam as string, { clientId: "pc-ana", consent: { camera: true, microphone: false } }, at(-5))).rejects.toMatchObject({
      status: 409,
      code: "upcoming",
    });
    const list = await attempts.listStudentExams(ana, at(-5));
    expect(list.find((exam) => exam.id === ids.exam)?.state).toBe("upcoming");
  });

  it("el servidor fija la hora límite con el tiempo extra y registra el consentimiento", async () => {
    const attemptId = await attempts.startAttempt(ana, ids.exam as string, { clientId: "pc-ana", consent: { camera: true, microphone: false } }, at(1));
    ids.anaAttempt = attemptId;
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { consent: true } });
    expect(attempt.deadlineAt.toISOString()).toBe(at(1 + 30 + 10).toISOString());
    expect(attempt.maxScore).toBe(7);
    expect(attempt.consent).toMatchObject({ camera: true, microphone: false, grantedBy: "STUDENT" });

    // Volver a entrar retoma el mismo intento; desde otro dispositivo, este pasa a ser el activo.
    expect(await attempts.startAttempt(ana, ids.exam as string, { clientId: "pc-ana", consent: { camera: false, microphone: false } }, at(2))).toBe(attemptId);
    expect(await attempts.startAttempt(ana, ids.exam as string, { clientId: "tablet-ana", consent: { camera: false, microphone: false } }, at(3))).toBe(attemptId);
    expect((await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } })).clientSwitches).toBe(1);
    await attempts.claimAttempt(ana, attemptId, "pc-ana", at(4));
  });

  it("un menor presenta sin cámara ni micrófono aunque los acepte (falta la autorización del acudiente)", async () => {
    const attemptId = await attempts.startAttempt(beto, ids.exam as string, { clientId: "pc-beto", consent: { camera: true, microphone: true } }, at(5));
    ids.betoAttempt = attemptId;
    const consent = await db.consentRecord.findUniqueOrThrow({ where: { attemptId } });
    expect(consent).toMatchObject({ camera: false, microphone: false, grantedBy: null });
  });

  it("la vista del estudiante nunca lleva las respuestas correctas", async () => {
    const view = await attempts.getAttemptForStudent(ana, ids.anaAttempt as string, at(6));
    expect(view.questions.map((question) => question.prompt)).toEqual(["Única", "Múltiple", "Capital", "Ensayo"]);
    const json = JSON.stringify(view);
    expect(json).not.toContain("answerKey");
    expect(json).not.toContain("correctOptionIds");
    expect(json).not.toContain("Ideas claras");
    expect(json).not.toContain("accepted");
  });

  it("guarda con versión: un guardado viejo no pisa uno nuevo", async () => {
    const attemptId = ids.anaAttempt as string;
    const save = (examQuestionId: string, value: unknown, version: number, clientId = "pc-ana") =>
      attempts.saveAnswer(ana, attemptId, { clientId, examQuestionId, value, version }, at(10));
    expect(await save(q.Única!, { optionId: "opta0001" }, 2)).toEqual({ version: 2, stale: false });
    expect(await save(q.Única!, { optionId: "optb0002" }, 1)).toEqual({ version: 2, stale: true });
    expect((await db.answer.findFirstOrThrow({ where: { attemptId, examQuestionId: q.Única! } })).value).toEqual({ optionId: "opta0001" });
    await save(q.Única!, { optionId: "optb0002" }, 3);

    await expect(save(q.Única!, { optionIds: ["x"] }, 4)).rejects.toMatchObject({ status: 400 });
    await expect(save(q.Única!, { optionId: "optb0002" }, 5, "tablet-ana")).rejects.toMatchObject({ status: 409, code: "otherDevice" });
    await expect(save("pregunta-ajena", { optionId: null }, 6)).rejects.toMatchObject({ status: 404 });
  });

  it("al entregar califica lo cerrado y deja lo abierto para el docente", async () => {
    const attemptId = ids.anaAttempt as string;
    const save = (examQuestionId: string, value: unknown) => attempts.saveAnswer(ana, attemptId, { clientId: "pc-ana", examQuestionId, value, version: 10 }, at(12));
    await save(q.Múltiple!, { optionIds: ["optc0003", "opta0001"] });
    await save(q.Capital!, { text: " bogota " });
    await save(q.Ensayo!, { text: "Mi ensayo" });

    const submitted = await attempts.submitAttempt(ana, attemptId, "pc-ana", at(20));
    expect(submitted.status).toBe("SUBMITTED");
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt).toMatchObject({ gradingStatus: "PENDING_MANUAL", score: null });
    const points = Object.fromEntries(
      (await db.answer.findMany({ where: { attemptId }, include: { examQuestion: true } })).map((answer) => [answer.examQuestion.prompt, answer.pointsAwarded]),
    );
    expect(points).toEqual({ Única: 2, Múltiple: 1, Capital: 1, Ensayo: null });

    await expect(save(q.Única!, { optionId: "opta0001" })).rejects.toMatchObject({ status: 409, code: "submitted" });
  });

  it("al vencer el tiempo el intento se entrega solo, con lo guardado hasta entonces", async () => {
    const attemptId = ids.betoAttempt as string;
    await attempts.saveAnswer(beto, attemptId, { clientId: "pc-beto", examQuestionId: q.Única!, value: { optionId: "optb0002" }, version: 1 }, at(20));
    // Beto empezó en el minuto 5 y tiene 30 minutos: a los 36 (más el margen) ya no puede guardar.
    await expect(
      attempts.saveAnswer(beto, attemptId, { clientId: "pc-beto", examQuestionId: q.Capital!, value: { text: "Bogotá" }, version: 1 }, at(36)),
    ).rejects.toMatchObject({ status: 409, code: "timeUp" });
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.status).toBe("AUTO_SUBMITTED");
    expect(attempt.submittedAt?.toISOString()).toBe(at(35).toISOString());
    // Sin responder vale 0: no hay nada para la cola manual y la nota queda lista.
    expect(attempt).toMatchObject({ gradingStatus: "GRADED", score: 2 });
  });

  it("un segundo intento cuenta solo si mejora la nota", async () => {
    const second = await attempts.startAttempt(ana, ids.exam as string, { clientId: "pc-ana", consent: { camera: false, microphone: false } }, at(60));
    const attempt = await db.examAttempt.findUniqueOrThrow({ where: { id: second } });
    expect(attempt.number).toBe(2);
    await attempts.submitAttempt(ana, second, "pc-ana", at(61));
    await expect(attempts.startAttempt(ana, ids.exam as string, { clientId: "pc-ana", consent: { camera: false, microphone: false } }, at(62))).rejects.toMatchObject({
      code: "noAttemptsLeft",
    });
  });

  it("el docente califica a mano y publica cuando la ventana cierra", async () => {
    const examId = ids.exam as string;
    let report = await results.getExamResults(teacher, examId, at(100));
    expect(report.publishProblems).toEqual(["windowOpen", "pendingGrading"]);
    const essay = report.pending.find((answer) => answer.question.prompt === "Ensayo" && answer.attemptNumber === 1)!;
    expect(essay.studentName).toBe("Ana");
    expect(essay.question.answerKey).toEqual({ rubric: "Ideas claras" });

    await expect(results.gradeAnswerManually(teacher, examId, essay.id, { points: 3.5 }, at(101))).rejects.toMatchObject({ status: 400 });
    await expect(results.gradeAnswerManually(teacher, examId, essay.id, { points: 2.3 }, at(101))).rejects.toMatchObject({ status: 400 });
    await results.gradeAnswerManually(teacher, examId, essay.id, { points: 2.5, feedback: "Buen argumento" }, at(101));
    expect(await db.examAttempt.findUniqueOrThrow({ where: { id: ids.anaAttempt as string } })).toMatchObject({ gradingStatus: "GRADED", score: 6.5 });

    await expect(results.publishResults(teacher, examId, at(110))).rejects.toMatchObject({ issues: [expect.objectContaining({ message: "windowOpen" })] });
    // El segundo intento de Ana dejó el ensayo vacío: vale 0 y no espera al docente.
    report = await results.getExamResults(teacher, examId, at(121));
    expect(report.publishProblems).toEqual([]);
    const anaRow = report.rows.find((row) => row.student.name === "Ana")!;
    expect(anaRow.best).toBe(6.5);

    await expect(attempts.getExamLobby(ana, examId, at(121))).resolves.toMatchObject({ blocked: "closed" });
    await expect(results.getStudentResult(ana, examId)).rejects.toMatchObject({ status: 409, code: "notPublished" });
    await results.publishResults(teacher, examId, at(121));
    await expect(results.publishResults(teacher, examId, at(122))).rejects.toMatchObject({ code: "alreadyPublished" });
  });

  it("el estudiante ve su mejor intento, con retroalimentación y sin la clave", async () => {
    const result = await results.getStudentResult(ana, ids.exam as string);
    expect(result.best?.number).toBe(1);
    expect(result.best?.score).toBe(6.5);
    expect(result.attempts).toHaveLength(2);
    const essay = result.answers.find((answer) => answer.question.prompt === "Ensayo");
    expect(essay).toMatchObject({ pointsAwarded: 2.5, feedback: "Buen argumento" });
    expect(JSON.stringify(result)).not.toContain("correctOptionIds");
  });

  it("cerrar el examen antes de hora solo se puede si nadie está presentando", async () => {
    const draft = await exams.duplicateExam(teacher, ids.exam as string);
    await exams.updateExamSettings(teacher, draft.id, {
      title: "Recuperación",
      courseId: draft.courseId,
      startsAt: at(200),
      endsAt: at(400),
      durationMinutes: 30,
      maxAttempts: 1,
      proctoring: {},
    });
    await exams.publishExam(teacher, draft.id, at(150));
    const attemptId = await attempts.startAttempt(beto, draft.id, { clientId: "pc-beto", consent: { camera: false, microphone: false } }, at(210));

    await expect(results.closeExamNow(teacher, draft.id, at(215))).rejects.toMatchObject({ status: 409, code: "attemptsInProgress" });
    await attempts.submitAttempt(beto, attemptId, "pc-beto", at(216));
    await results.closeExamNow(teacher, draft.id, at(217));
    const closed = await db.exam.findUniqueOrThrow({ where: { id: draft.id } });
    expect(closed).toMatchObject({ status: "CLOSED" });
    expect(closed.endsAt?.toISOString()).toBe(at(217).toISOString());
    // Cerrado: nadie más empieza y las notas ya se pueden publicar.
    await expect(attempts.getExamLobby(ana, draft.id, at(218))).resolves.toMatchObject({ blocked: "closed" });
    expect((await results.getExamResults(teacher, draft.id, at(218))).publishProblems).toEqual([]);
    await expect(results.closeExamNow(teacher, draft.id, at(219))).rejects.toMatchObject({ code: "notPublished" });
  });

  it("cada quien ve solo lo suyo", async () => {
    const examId = ids.exam as string;
    await expect(attempts.getExamLobby(outsider, examId, at(10))).rejects.toMatchObject({ status: 404 });
    await expect(attempts.getAttemptForStudent(beto, ids.anaAttempt as string, at(10))).rejects.toMatchObject({ status: 404 });
    await expect(results.getExamResults(otherTeacher, examId, at(10))).rejects.toMatchObject({ status: 404 });
    await expect(results.getExamResults(ana, examId, at(10))).rejects.toMatchObject({ status: 403 });
    await expect(exams.unpublishExam(teacher, examId, at(-10))).rejects.toMatchObject({ status: 409 });
  });
});
