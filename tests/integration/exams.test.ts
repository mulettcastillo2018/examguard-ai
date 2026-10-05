import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Constructor de exámenes contra la base real. Requiere DATABASE_URL.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("constructor de exámenes", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;

  let db: typeof import("@/lib/db").prisma;
  let exams: typeof import("@/modules/exams/exams");
  let bank: typeof import("@/modules/question-bank/question-bank");
  const ids: Record<string, string> = {};
  let teacher: CurrentUser;
  let colleague: CurrentUser;
  let outsider: CurrentUser;
  let foreignTeacher: CurrentUser;
  let student: CurrentUser;

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });

  const settings = (overrides: Record<string, unknown> = {}) => ({
    title: "Parcial de prueba",
    courseId: ids.course as string,
    durationMinutes: 60,
    maxAttempts: 1,
    proctoring: {},
    ...overrides,
  });
  const window = { startsAt: new Date("2030-03-10T13:00:00Z"), endsAt: new Date("2030-03-10T15:00:00Z") };
  const positions = async (examId: string) =>
    (await db.examQuestion.findMany({ where: { examId }, orderBy: { position: "asc" }, select: { prompt: true, position: true } })).map(
      (q) => `${q.position}:${q.prompt}`,
    );

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    exams = await import("@/modules/exams/exams");
    bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const [a, b] = await Promise.all([
      db.institution.create({ data: { name: "Exámenes A (pruebas)", slug: `ex-a-${suffix}` } }),
      db.institution.create({ data: { name: "Exámenes B (pruebas)", slug: `ex-b-${suffix}` } }),
    ]);
    ids.a = a.id;
    ids.b = b.id;
    const base = { password: "Prueba-integracion-2026", mustChangePassword: false };
    teacher = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Docente A", email: email("docente"), role: "TEACHER" }));
    colleague = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Colega A", email: email("colega"), role: "TEACHER" }));
    outsider = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Otro docente A", email: email("otro"), role: "TEACHER" }));
    foreignTeacher = actorOf(await createCredentialUser({ ...base, institutionId: b.id, name: "Docente B", email: email("docente-b"), role: "TEACHER" }));
    student = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Estudiante A", email: email("estudiante"), role: "STUDENT" }));
    const otherStudent = await createCredentialUser({ ...base, institutionId: a.id, name: "Estudiante solo de física", email: email("fisica"), role: "STUDENT" });
    ids.student = student.id;
    ids.otherStudent = otherStudent.id;

    const course = await db.course.create({
      data: {
        institutionId: a.id,
        code: `MAT-${suffix}`,
        name: "Matemáticas",
        period: "2030-1",
        teachers: { create: [{ teacherId: teacher.id }, { teacherId: colleague.id }] },
        enrollments: { create: [{ studentId: student.id }] },
      },
    });
    const physics = await db.course.create({
      data: {
        institutionId: a.id,
        code: `FIS-${suffix}`,
        name: "Física",
        period: "2030-1",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: [{ studentId: otherStudent.id }] },
      },
    });
    const outsiderCourse = await db.course.create({
      data: { institutionId: a.id, code: `ART-${suffix}`, name: "Artes", period: "2030-1", teachers: { create: [{ teacherId: outsider.id }] } },
    });
    ids.course = course.id;
    ids.physics = physics.id;
    ids.outsiderCourse = outsiderCourse.id;

    const q1 = await bank.createQuestion(teacher, {
      type: "SINGLE_CHOICE",
      prompt: "Uno",
      points: 1,
      options: [
        { id: "opta0001", label: "Sí" },
        { id: "optb0002", label: "No" },
      ],
      answerKey: { correctOptionIds: ["opta0001"] },
      tags: [],
    });
    const q2 = await bank.createQuestion(teacher, { type: "TRUE_FALSE", prompt: "Dos", points: 2, answerKey: { value: true }, tags: [] });
    const q3 = await bank.createQuestion(teacher, { type: "LONG_ANSWER", prompt: "Tres", points: 3, answerKey: { rubric: "" }, tags: [] });
    ids.q1 = q1.id;
    ids.q2 = q2.id;
    ids.q3 = q3.id;
  });

  afterAll(async () => {
    if (!db) return;
    const institutionIds = [ids.a, ids.b].filter((id): id is string => Boolean(id));
    await db.auditLog.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.exam.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.question.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.course.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.user.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.institution.deleteMany({ where: { id: { in: institutionIds } } });
    await db.$disconnect();
  });

  it("crea un borrador solo en un curso que dicta el docente", async () => {
    const exam = await exams.createExam(teacher, settings({ proctoring: { camera: "off" } }));
    ids.exam = exam.id;
    expect(exam.status).toBe("DRAFT");
    expect(exam.proctoringConfig).toEqual({ camera: "off", microphone: "off", fullscreen: "requested" });
    expect(await db.auditLog.count({ where: { action: "EXAM_CREATED", entityId: exam.id } })).toBe(1);

    await expect(exams.createExam(teacher, settings({ courseId: ids.outsiderCourse }))).rejects.toMatchObject({
      status: 400,
      issues: [expect.objectContaining({ message: "course" })],
    });
    await expect(exams.createExam(student, settings())).rejects.toMatchObject({ status: 403 });
  });

  it("copia preguntas del banco al final y editar el banco no cambia el examen", async () => {
    const examId = ids.exam as string;
    await exams.addQuestionsFromBank(teacher, examId, [ids.q2 as string, ids.q1 as string]);
    await exams.addQuestionsFromBank(teacher, examId, [ids.q3 as string]);
    expect(await positions(examId)).toEqual(["1:Dos", "2:Uno", "3:Tres"]);

    await bank.updateQuestion(teacher, ids.q1 as string, {
      type: "TRUE_FALSE",
      prompt: "Uno, editada en el banco",
      points: 1,
      answerKey: { value: false },
      tags: [],
    });
    expect(await positions(examId)).toContain("2:Uno");

    // Preguntas archivadas o de otro docente no se pueden agregar.
    await bank.setQuestionArchived(teacher, ids.q3 as string, true);
    await expect(exams.addQuestionsFromBank(teacher, examId, [ids.q3 as string])).rejects.toMatchObject({ status: 404 });
    await expect(exams.addQuestionsFromBank(colleague, examId, [ids.q2 as string])).rejects.toMatchObject({ status: 404 });
    await expect(exams.addQuestionsFromBank(teacher, examId, [])).rejects.toMatchObject({ status: 400 });
  });

  it("crea preguntas dentro del examen, con o sin copia en el banco", async () => {
    const examId = ids.exam as string;
    const withBank = await exams.createExamQuestion(
      teacher,
      examId,
      { type: "SHORT_ANSWER", prompt: "Cuatro", points: 1, answerKey: { accepted: ["4"] }, category: "Nueva", tags: [] },
      { saveToBank: true },
    );
    const onlyExam = await exams.createExamQuestion(
      teacher,
      examId,
      { type: "TRUE_FALSE", prompt: "Cinco", points: 1, answerKey: { value: true }, tags: [] },
      { saveToBank: false },
    );
    expect(withBank.sourceQuestionId).toBeTruthy();
    expect(onlyExam.sourceQuestionId).toBeNull();
    expect((await bank.listQuestions(teacher, { q: "Cuatro" })).questions).toHaveLength(1);
    expect((await bank.listQuestions(teacher, { q: "Cinco" })).questions).toHaveLength(0);
    expect(await positions(examId)).toEqual(["1:Dos", "2:Uno", "3:Tres", "4:Cuatro", "5:Cinco"]);
    ids.five = onlyExam.id;
  });

  it("duplica, reordena y quita manteniendo posiciones seguidas", async () => {
    const examId = ids.exam as string;
    const all = await db.examQuestion.findMany({ where: { examId }, orderBy: { position: "asc" } });
    const two = all[1]!;
    await exams.duplicateExamQuestion(teacher, examId, two.id);
    expect(await positions(examId)).toEqual(["1:Dos", "2:Uno", "3:Uno", "4:Tres", "5:Cuatro", "6:Cinco"]);

    await exams.moveExamQuestion(teacher, examId, two.id, "up");
    expect((await positions(examId)).slice(0, 2)).toEqual(["1:Uno", "2:Dos"]);
    await exams.moveExamQuestion(teacher, examId, two.id, "up"); // Ya es la primera: no cambia nada.
    expect((await positions(examId))[0]).toBe("1:Uno");

    await exams.removeExamQuestion(teacher, examId, ids.five as string);
    await exams.removeExamQuestion(teacher, examId, two.id);
    expect(await positions(examId)).toEqual(["1:Dos", "2:Uno", "3:Tres", "4:Cuatro"]);

    const updated = await exams.updateExamQuestion(teacher, examId, all[0]!.id, {
      type: "TRUE_FALSE",
      prompt: "Dos, editada en el examen",
      points: 2.5,
      answerKey: { value: false },
      tags: [],
    });
    expect(updated.points).toBe(2.5);
    // La copia del examen cambió; la del banco no.
    expect((await bank.getQuestion(teacher, ids.q2 as string)).prompt).toBe("Dos");
  });

  it("explica qué falta para publicar y después congela el examen", async () => {
    const examId = ids.exam as string;
    const now = new Date("2030-03-01T12:00:00Z");
    await expect(exams.publishExam(teacher, examId, now)).rejects.toMatchObject({
      status: 400,
      issues: [expect.objectContaining({ message: "noWindow" })],
    });
    await exams.updateExamSettings(teacher, examId, settings({ ...window, durationMinutes: 180 }));
    await expect(exams.publishExam(teacher, examId, now)).rejects.toMatchObject({
      issues: [expect.objectContaining({ message: "durationExceedsWindow" })],
    });
    await exams.updateExamSettings(teacher, examId, settings({ ...window, durationMinutes: 90 }));

    const published = await exams.publishExam(teacher, examId, now);
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt?.toISOString()).toBe(now.toISOString());

    const firstQuestion = (await db.examQuestion.findFirstOrThrow({ where: { examId, position: 1 } })).id;
    await expect(exams.updateExamSettings(teacher, examId, settings({ ...window, title: "Otro" }))).rejects.toMatchObject({ status: 409 });
    await expect(exams.addQuestionsFromBank(teacher, examId, [ids.q2 as string])).rejects.toMatchObject({ status: 409 });
    await expect(exams.removeExamQuestion(teacher, examId, firstQuestion)).rejects.toMatchObject({ status: 409 });
    await expect(exams.deleteDraftExam(teacher, examId)).rejects.toMatchObject({ status: 409 });
    await expect(exams.publishExam(teacher, examId, now)).rejects.toMatchObject({ status: 409 });
  });

  it("vuelve a borrador solo antes de que empiece", async () => {
    const examId = ids.exam as string;
    await expect(exams.unpublishExam(teacher, examId, new Date("2030-03-10T13:30:00Z"))).rejects.toMatchObject({ status: 409 });
    const draft = await exams.unpublishExam(teacher, examId, new Date("2030-03-09T12:00:00Z"));
    expect(draft.status).toBe("DRAFT");
    await exams.publishExam(teacher, examId, new Date("2030-03-09T12:00:00Z"));
    const actions = (await db.auditLog.findMany({ where: { entityId: examId }, select: { action: true } })).map((a) => a.action);
    expect(actions.filter((a) => a === "EXAM_PUBLISHED")).toHaveLength(2);
    expect(actions).toContain("EXAM_UNPUBLISHED");
  });

  it("guarda ajustes por estudiante también con el examen publicado", async () => {
    const examId = ids.exam as string;
    await exams.setAccommodation(teacher, examId, ids.student as string, { extraMinutes: 20, cameraExempt: true, note: "Acordado con orientación" });
    let saved = await db.accommodation.findUnique({ where: { examId_studentId: { examId, studentId: ids.student as string } } });
    expect(saved).toMatchObject({ extraMinutes: 20, cameraExempt: true, note: "Acordado con orientación" });

    // Sin tiempo extra, sin exención y sin nota es lo mismo que no tener ajuste.
    await exams.setAccommodation(teacher, examId, ids.student as string, { extraMinutes: 0, cameraExempt: false, note: "" });
    saved = await db.accommodation.findUnique({ where: { examId_studentId: { examId, studentId: ids.student as string } } });
    expect(saved).toBeNull();

    await expect(exams.setAccommodation(teacher, examId, ids.otherStudent as string, { extraMinutes: 10, cameraExempt: false })).rejects.toMatchObject({
      status: 404,
    });
    await expect(exams.setAccommodation(teacher, examId, ids.student as string, { extraMinutes: -1, cameraExempt: false })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("al cambiar de curso se quitan los ajustes de quienes no están en el nuevo", async () => {
    const draft = await exams.createExam(teacher, settings({ title: "Borrador para mover" }));
    await exams.setAccommodation(teacher, draft.id, ids.student as string, { extraMinutes: 10, cameraExempt: false });
    await exams.updateExamSettings(teacher, draft.id, settings({ title: "Borrador para mover", courseId: ids.physics }));
    expect(await db.accommodation.count({ where: { examId: draft.id } })).toBe(0);
    await exams.deleteDraftExam(teacher, draft.id);
    expect(await db.exam.count({ where: { id: draft.id } })).toBe(0);
  });

  it("duplica un examen como borrador sin ventana y con sus preguntas", async () => {
    const examId = ids.exam as string;
    const copy = await exams.duplicateExam(teacher, examId);
    expect(copy.status).toBe("DRAFT");
    expect(copy.startsAt).toBeNull();
    expect(copy.title).toBe("Parcial de prueba (copia)");
    expect(await positions(copy.id)).toEqual(await positions(examId));

    const list = await exams.listTeacherExams(teacher);
    const original = list.find((exam) => exam.id === examId);
    expect(original).toMatchObject({ status: "PUBLISHED", questionCount: 4 });
    expect(original?.totalPoints).toBe(2.5 + 1 + 3 + 1);
  });

  it("solo los docentes del curso ven y editan el examen", async () => {
    const examId = ids.exam as string;
    // Una colega del mismo curso sí.
    expect((await exams.getExamForTeacher(colleague, examId)).questions).toHaveLength(4);
    for (const actor of [outsider, foreignTeacher]) {
      await expect(exams.getExamForTeacher(actor, examId)).rejects.toMatchObject({ status: 404 });
      await expect(exams.unpublishExam(actor, examId, new Date("2030-03-01T00:00:00Z"))).rejects.toMatchObject({ status: 404 });
      await expect(exams.setAccommodation(actor, examId, ids.student as string, { extraMinutes: 5, cameraExempt: false })).rejects.toMatchObject({
        status: 404,
      });
    }
    expect((await exams.listTeacherExams(outsider)).some((exam) => exam.id === examId)).toBe(false);
    await expect(exams.listTeacherExams(student)).rejects.toMatchObject({ status: 403 });
  });
});
