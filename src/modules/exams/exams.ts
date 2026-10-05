import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { questionContentSchema, questionInputSchema, type QuestionInput } from "@/modules/question-bank/content";
import { createQuestion } from "@/modules/question-bank/question-bank";
import { assertCan } from "@/modules/rbac";
import {
  accommodationSchema,
  examSettingsSchema,
  getPublishProblems,
  isEmptyAccommodation,
  readProctoringConfig,
  type AccommodationInput,
  type ExamSettingsInput,
} from "./settings";

// Exámenes del docente. Alcance: cualquier docente que dicte el curso del examen lo
// puede ver y editar. Las preguntas del examen son copias (ExamQuestion): agregarlas
// del banco las copia, y al publicar quedan congeladas.

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

function invalid(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new ValidationError(
    "Revisa los campos marcados.",
    issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
  );
}

function parseSettings(input: ExamSettingsInput) {
  const parsed = examSettingsSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error.issues);
  return parsed.data;
}

async function assertTeachesCourse(actor: CurrentUser, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, institutionId: actor.institutionId, teachers: { some: { teacherId: actor.id } } },
    select: { id: true },
  });
  if (!course) invalid([{ path: ["courseId"], message: "course" }]);
}

/** Examen de un curso que dicta el docente; si no, 404 (no revela que exista). */
export async function findManageableExam(actor: CurrentUser, examId: string) {
  assertCan(actor, "exams:manage");
  const exam = await prisma.exam.findFirst({
    where: { id: examId, institutionId: actor.institutionId, course: { teachers: { some: { teacherId: actor.id } } } },
  });
  if (!exam) throw new NotFoundError("El examen no existe o no es de tus cursos.");
  return exam;
}

async function findDraftExam(actor: CurrentUser, examId: string) {
  const exam = await findManageableExam(actor, examId);
  if (exam.status !== "DRAFT") throw new ConflictError("El examen está publicado: vuelve a borrador para editarlo.");
  return exam;
}

const audit = (actor: CurrentUser, action: Parameters<typeof recordAudit>[0]["action"], examId: string, metadata?: Prisma.InputJsonValue) =>
  recordAudit({ institutionId: actor.institutionId, actorId: actor.id, action, entityType: "Exam", entityId: examId, metadata });

// ---------- Lectura ----------

export async function listTeacherExams(actor: CurrentUser) {
  assertCan(actor, "exams:manage");
  const exams = await prisma.exam.findMany({
    where: { institutionId: actor.institutionId, course: { teachers: { some: { teacherId: actor.id } } } },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      durationMinutes: true,
      updatedAt: true,
      course: { select: { id: true, code: true, name: true } },
      questions: { select: { points: true } },
    },
  });
  return exams.map(({ questions, ...exam }) => ({
    ...exam,
    questionCount: questions.length,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
  }));
}

export async function countTeacherExams(actor: CurrentUser) {
  assertCan(actor, "exams:manage");
  return prisma.exam.count({
    where: { institutionId: actor.institutionId, course: { teachers: { some: { teacherId: actor.id } } } },
  });
}

/** Todo lo que necesita el constructor. Incluye las claves: es solo para docentes del curso. */
export async function getExamForTeacher(actor: CurrentUser, examId: string, now = new Date()) {
  const exam = await findManageableExam(actor, examId);
  const [course, questions, accommodations] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id: exam.courseId },
      select: {
        id: true,
        code: true,
        name: true,
        enrollments: {
          select: { student: { select: { id: true, name: true, email: true, isMinor: true } } },
          orderBy: { student: { name: "asc" } },
        },
      },
    }),
    prisma.examQuestion.findMany({ where: { examId }, orderBy: { position: "asc" } }),
    prisma.accommodation.findMany({ where: { examId } }),
  ]);
  const checked = questions.map((question) => ({
    ...question,
    valid: questionContentSchema.safeParse({
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      options: question.options,
      answerKey: question.answerKey,
    }).success,
  }));
  return {
    exam: { ...exam, proctoring: readProctoringConfig(exam.proctoringConfig) },
    course: { id: course.id, code: course.code, name: course.name },
    students: course.enrollments.map((enrollment) => enrollment.student),
    questions: checked,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    accommodations,
    publishProblems: exam.status === "DRAFT" ? getPublishProblems(exam, checked, now) : [],
    // Se puede volver a borrador mientras no haya empezado (nadie lo ha podido presentar).
    canUnpublish: exam.status === "PUBLISHED" && Boolean(exam.startsAt && now < exam.startsAt),
  };
}

// ---------- Configuración ----------

export async function createExam(actor: CurrentUser, input: ExamSettingsInput) {
  assertCan(actor, "exams:manage");
  const settings = parseSettings(input);
  await assertTeachesCourse(actor, settings.courseId);
  const exam = await prisma.exam.create({
    data: {
      institutionId: actor.institutionId,
      courseId: settings.courseId,
      createdById: actor.id,
      title: settings.title,
      description: settings.description,
      instructions: settings.instructions,
      startsAt: settings.startsAt,
      endsAt: settings.endsAt,
      durationMinutes: settings.durationMinutes,
      maxAttempts: settings.maxAttempts,
      shuffleQuestions: settings.shuffleQuestions,
      proctoringConfig: toJson(settings.proctoring),
      simulationEnabled: settings.simulationEnabled,
    },
  });
  await audit(actor, "EXAM_CREATED", exam.id);
  return exam;
}

export async function updateExamSettings(actor: CurrentUser, examId: string, input: ExamSettingsInput) {
  const current = await findDraftExam(actor, examId);
  const settings = parseSettings(input);
  if (settings.courseId !== current.courseId) await assertTeachesCourse(actor, settings.courseId);

  const exam = await prisma.$transaction(async (tx) => {
    // Al cambiar de curso, los ajustes de estudiantes que no están en el nuevo curso sobran.
    if (settings.courseId !== current.courseId) {
      await tx.accommodation.deleteMany({
        where: { examId, student: { enrollments: { none: { courseId: settings.courseId } } } },
      });
    }
    return tx.exam.update({
      where: { id: examId },
      data: {
        courseId: settings.courseId,
        title: settings.title,
        description: settings.description,
        instructions: settings.instructions,
        startsAt: settings.startsAt,
        endsAt: settings.endsAt,
        durationMinutes: settings.durationMinutes,
        maxAttempts: settings.maxAttempts,
        shuffleQuestions: settings.shuffleQuestions,
        proctoringConfig: toJson(settings.proctoring),
        simulationEnabled: settings.simulationEnabled,
      },
    });
  });
  await audit(actor, "EXAM_UPDATED", examId);
  return exam;
}

export async function deleteDraftExam(actor: CurrentUser, examId: string) {
  await findDraftExam(actor, examId);
  // Preguntas y ajustes caen en cascada.
  await prisma.exam.delete({ where: { id: examId } });
  await audit(actor, "EXAM_DELETED", examId);
}

/** Copia como borrador nuevo, sin ventana (la anterior suele estar vencida). */
export async function duplicateExam(actor: CurrentUser, examId: string) {
  const source = await findManageableExam(actor, examId);
  const questions = await prisma.examQuestion.findMany({ where: { examId }, orderBy: { position: "asc" } });
  const copy = await prisma.exam.create({
    data: {
      institutionId: source.institutionId,
      courseId: source.courseId,
      createdById: actor.id,
      title: `${source.title} (copia)`.slice(0, 200),
      description: source.description,
      instructions: source.instructions,
      durationMinutes: source.durationMinutes,
      maxAttempts: source.maxAttempts,
      shuffleQuestions: source.shuffleQuestions,
      proctoringConfig: toJson(source.proctoringConfig),
      simulationEnabled: source.simulationEnabled,
      questions: {
        create: questions.map((question) => ({
          sourceQuestionId: question.sourceQuestionId,
          position: question.position,
          type: question.type,
          prompt: question.prompt,
          options: toJson(question.options),
          answerKey: toJson(question.answerKey),
          points: question.points,
        })),
      },
    },
  });
  await audit(actor, "EXAM_CREATED", copy.id, { duplicatedFrom: source.id });
  return copy;
}

// ---------- Preguntas del examen ----------

async function nextPosition(tx: Prisma.TransactionClient, examId: string) {
  const last = await tx.examQuestion.aggregate({ where: { examId }, _max: { position: true } });
  return (last._max.position ?? 0) + 1;
}

/** Copia preguntas del banco del docente al final del examen, en el orden recibido. */
export async function addQuestionsFromBank(actor: CurrentUser, examId: string, questionIds: string[]) {
  await findDraftExam(actor, examId);
  const ids = [...new Set(questionIds)];
  if (ids.length === 0) invalid([{ path: ["questionIds"], message: "noneSelected" }]);
  const found = await prisma.question.findMany({
    where: { id: { in: ids }, ownerId: actor.id, institutionId: actor.institutionId, archivedAt: null },
  });
  if (found.length !== ids.length) throw new NotFoundError("Alguna pregunta ya no está en tu banco.");
  const byId = new Map(found.map((question) => [question.id, question]));

  await prisma.$transaction(async (tx) => {
    let position = await nextPosition(tx, examId);
    for (const id of ids) {
      const question = byId.get(id)!;
      await tx.examQuestion.create({
        data: {
          examId,
          sourceQuestionId: question.id,
          position: position++,
          type: question.type,
          prompt: question.prompt,
          options: toJson(question.options),
          answerKey: toJson(question.answerKey),
          points: question.points,
        },
      });
    }
  });
  await audit(actor, "EXAM_QUESTIONS_CHANGED", examId, { added: ids.length });
}

/** Pregunta nueva escrita dentro del examen; opcionalmente queda también en el banco. */
export async function createExamQuestion(actor: CurrentUser, examId: string, input: QuestionInput, { saveToBank }: { saveToBank: boolean }) {
  await findDraftExam(actor, examId);
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error.issues);
  const content = parsed.data;
  const source = saveToBank ? await createQuestion(actor, input) : null;

  const created = await prisma.$transaction(async (tx) =>
    tx.examQuestion.create({
      data: {
        examId,
        sourceQuestionId: source?.id ?? null,
        position: await nextPosition(tx, examId),
        type: content.type,
        prompt: content.prompt,
        options: toJson(content.options),
        answerKey: toJson(content.answerKey),
        points: content.points,
      },
    }),
  );
  await audit(actor, "EXAM_QUESTIONS_CHANGED", examId, { created: 1, savedToBank: saveToBank });
  return created;
}

async function findExamQuestion(examId: string, examQuestionId: string) {
  const question = await prisma.examQuestion.findFirst({ where: { id: examQuestionId, examId } });
  if (!question) throw new NotFoundError("La pregunta no está en este examen.");
  return question;
}

export async function getExamQuestion(actor: CurrentUser, examId: string, examQuestionId: string) {
  const exam = await findManageableExam(actor, examId);
  return { exam, question: await findExamQuestion(examId, examQuestionId) };
}

/** Edita la copia del examen; la pregunta del banco no cambia. */
export async function updateExamQuestion(actor: CurrentUser, examId: string, examQuestionId: string, input: QuestionInput) {
  await findDraftExam(actor, examId);
  await findExamQuestion(examId, examQuestionId);
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error.issues);
  const content = parsed.data;
  const question = await prisma.examQuestion.update({
    where: { id: examQuestionId },
    data: {
      type: content.type,
      prompt: content.prompt,
      options: toJson(content.options),
      answerKey: toJson(content.answerKey),
      points: content.points,
    },
  });
  await audit(actor, "EXAM_QUESTIONS_CHANGED", examId, { updated: examQuestionId });
  return question;
}

/** Inserta la copia justo después de la original. */
export async function duplicateExamQuestion(actor: CurrentUser, examId: string, examQuestionId: string) {
  await findDraftExam(actor, examId);
  const source = await findExamQuestion(examId, examQuestionId);
  const copy = await prisma.$transaction(async (tx) => {
    await tx.examQuestion.updateMany({ where: { examId, position: { gt: source.position } }, data: { position: { increment: 1 } } });
    return tx.examQuestion.create({
      data: {
        examId,
        sourceQuestionId: source.sourceQuestionId,
        position: source.position + 1,
        type: source.type,
        prompt: source.prompt,
        options: toJson(source.options),
        answerKey: toJson(source.answerKey),
        points: source.points,
      },
    });
  });
  await audit(actor, "EXAM_QUESTIONS_CHANGED", examId, { duplicated: examQuestionId });
  return copy;
}

export async function removeExamQuestion(actor: CurrentUser, examId: string, examQuestionId: string) {
  await findDraftExam(actor, examId);
  const question = await findExamQuestion(examId, examQuestionId);
  await prisma.$transaction(async (tx) => {
    await tx.examQuestion.delete({ where: { id: examQuestionId } });
    // Posiciones seguidas (1, 2, 3...) para que "pregunta 3 de 10" siempre sea cierto.
    await tx.examQuestion.updateMany({ where: { examId, position: { gt: question.position } }, data: { position: { decrement: 1 } } });
  });
  await audit(actor, "EXAM_QUESTIONS_CHANGED", examId, { removed: examQuestionId });
}

export async function moveExamQuestion(actor: CurrentUser, examId: string, examQuestionId: string, direction: "up" | "down") {
  await findDraftExam(actor, examId);
  const question = await findExamQuestion(examId, examQuestionId);
  const neighbor = await prisma.examQuestion.findFirst({
    where: { examId, position: direction === "up" ? question.position - 1 : question.position + 1 },
  });
  if (!neighbor) return; // Ya está en el extremo.
  await prisma.$transaction([
    prisma.examQuestion.update({ where: { id: question.id }, data: { position: neighbor.position } }),
    prisma.examQuestion.update({ where: { id: neighbor.id }, data: { position: question.position } }),
  ]);
}

// ---------- Publicación ----------

export async function publishExam(actor: CurrentUser, examId: string, now = new Date()) {
  const { exam, publishProblems } = await getExamForTeacher(actor, examId, now);
  if (exam.status !== "DRAFT") throw new ConflictError("El examen ya está publicado.");
  if (publishProblems.length) invalid(publishProblems.map((problem) => ({ path: ["publish"], message: problem })));
  const published = await prisma.exam.update({ where: { id: examId }, data: { status: "PUBLISHED", publishedAt: now } });
  await audit(actor, "EXAM_PUBLISHED", examId);
  return published;
}

export async function unpublishExam(actor: CurrentUser, examId: string, now = new Date()) {
  const exam = await findManageableExam(actor, examId);
  if (exam.status !== "PUBLISHED") throw new ConflictError("El examen no está publicado.");
  if (!exam.startsAt || now >= exam.startsAt) throw new ConflictError("El examen ya empezó: no puede volver a borrador.");
  // Defensa adicional: con intentos no se puede (no debería haberlos antes de startsAt).
  if (await prisma.examAttempt.count({ where: { examId } })) throw new ConflictError("El examen ya tiene intentos: no puede volver a borrador.");
  const draft = await prisma.exam.update({ where: { id: examId }, data: { status: "DRAFT", publishedAt: null } });
  await audit(actor, "EXAM_UNPUBLISHED", examId);
  return draft;
}

// ---------- Ajustes por estudiante ----------

/** Tiempo extra, exención de cámara y nota. Se pueden cambiar también con el examen publicado. */
export async function setAccommodation(actor: CurrentUser, examId: string, studentId: string, input: AccommodationInput) {
  const exam = await findManageableExam(actor, examId);
  if (exam.status !== "DRAFT" && exam.status !== "PUBLISHED") throw new ConflictError("El examen ya cerró.");
  const parsed = accommodationSchema.safeParse(input);
  if (!parsed.success) invalid(parsed.error.issues);
  const enrolled = await prisma.enrollment.findFirst({ where: { courseId: exam.courseId, studentId }, select: { studentId: true } });
  if (!enrolled) throw new NotFoundError("El estudiante no está en el curso del examen.");

  const value = parsed.data;
  if (isEmptyAccommodation(value)) {
    await prisma.accommodation.deleteMany({ where: { examId, studentId } });
  } else {
    const data = { extraMinutes: value.extraMinutes, cameraExempt: value.cameraExempt, note: value.note || null };
    await prisma.accommodation.upsert({
      where: { examId_studentId: { examId, studentId } },
      create: { examId, studentId, ...data },
      update: data,
    });
  }
  await audit(actor, "ACCOMMODATION_UPDATED", examId, { studentId });
}
