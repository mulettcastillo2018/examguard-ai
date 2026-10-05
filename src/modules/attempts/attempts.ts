import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type ExamAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { readProctoringConfig } from "@/modules/exams/settings";
import { assertCan } from "@/modules/rbac";
import { parseAnswerValue } from "./answers";
import { gradeAnswer, summarizeGrades } from "./grading";
import { computeDeadline, CONSENT_TEXT_VERSION, isPastDeadline, isWindowOpen } from "./timing";

// El examen visto por el estudiante. Reglas de integridad (docs/ANALISIS.md, sección 9):
// el servidor fija la hora límite; un intento activo por estudiante y examen; un solo
// dispositivo activo; las respuestas correctas nunca salen hacia el navegador.

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

/** Examen publicado de un curso donde está matriculado el estudiante; si no, 404. */
async function findTakeableExam(actor: CurrentUser, examId: string) {
  assertCan(actor, "exams:take");
  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      institutionId: actor.institutionId,
      status: { in: ["PUBLISHED", "CLOSED"] },
      course: { enrollments: { some: { studentId: actor.id } } },
    },
  });
  if (!exam) throw new NotFoundError("El examen no existe o no es de tus cursos.");
  return exam;
}

async function findOwnAttempt(actor: CurrentUser, attemptId: string) {
  assertCan(actor, "exams:take");
  const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId, studentId: actor.id } });
  if (!attempt) throw new NotFoundError("El intento no existe.");
  return attempt;
}

// ---------- Cierre y calificación ----------

/**
 * Cierra un intento y lo califica: lo que se puede calificar solo queda calificado y lo
 * demás pasa a la cola del docente. Idempotente: un intento ya cerrado no cambia.
 */
async function finalizeAttempt(attempt: ExamAttempt, now: Date, auto: boolean, actorId: string | null) {
  const questions = await prisma.examQuestion.findMany({ where: { examId: attempt.examId } });
  const answers = await prisma.answer.findMany({ where: { attemptId: attempt.id } });
  const byQuestion = new Map(answers.map((answer) => [answer.examQuestionId, answer]));
  const points = questions.map((question) => ({ question, points: gradeAnswer(question, byQuestion.get(question.id)?.value) }));
  const summary = summarizeGrades(points.map((entry) => entry.points));

  const closed = await prisma.$transaction(async (tx) => {
    // Solo cierra si sigue abierto (otro proceso pudo cerrarlo primero).
    const updated = await tx.examAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS" },
      data: {
        status: auto ? "AUTO_SUBMITTED" : "SUBMITTED",
        // Un cierre automático cuenta como entregado a la hora límite.
        submittedAt: auto ? attempt.deadlineAt : now,
        score: summary.score,
        gradingStatus: summary.pending > 0 ? "PENDING_MANUAL" : "GRADED",
      },
    });
    if (updated.count === 0) return false;
    for (const { question, points: awarded } of points) {
      const existing = byQuestion.get(question.id);
      if (existing) {
        await tx.answer.update({
          where: { id: existing.id },
          data: { pointsAwarded: awarded, autoGraded: awarded !== null, gradedAt: awarded !== null ? now : null },
        });
      } else {
        // Sin responder: queda registrada con 0 puntos para que la revisión vea todas las preguntas.
        await tx.answer.create({
          data: { attemptId: attempt.id, examQuestionId: question.id, value: toJson({}), version: 0, pointsAwarded: 0, autoGraded: true, gradedAt: now },
        });
      }
    }
    return true;
  });

  if (closed) {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: attempt.examId }, select: { institutionId: true } });
    await recordAudit({
      institutionId: exam.institutionId,
      actorId,
      action: auto ? "ATTEMPT_AUTO_SUBMITTED" : "ATTEMPT_SUBMITTED",
      entityType: "ExamAttempt",
      entityId: attempt.id,
      metadata: { examId: attempt.examId, pendingManual: summary.pending },
    });
  }
  return closed;
}

/** Cierra los intentos vencidos (por tiempo) de un examen o de un estudiante. */
export async function finalizeExpiredAttempts(where: { examId?: string; studentId?: string }, now = new Date()) {
  const expired = await prisma.examAttempt.findMany({ where: { ...where, status: "IN_PROGRESS" } });
  for (const attempt of expired) {
    if (isPastDeadline(attempt.deadlineAt, now)) await finalizeAttempt(attempt, now, true, null);
  }
}

// ---------- Lista y antesala ----------

export type StudentExamState = "upcoming" | "open" | "inProgress" | "finished" | "missed";

export async function listStudentExams(actor: CurrentUser, now = new Date()) {
  assertCan(actor, "exams:take");
  await finalizeExpiredAttempts({ studentId: actor.id }, now);
  const exams = await prisma.exam.findMany({
    where: {
      institutionId: actor.institutionId,
      status: { in: ["PUBLISHED", "CLOSED"] },
      course: { enrollments: { some: { studentId: actor.id } } },
    },
    orderBy: [{ startsAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      durationMinutes: true,
      maxAttempts: true,
      resultsPublishedAt: true,
      course: { select: { code: true, name: true } },
      attempts: { where: { studentId: actor.id }, select: { id: true, status: true } },
    },
  });
  return exams.map(({ attempts, ...exam }) => {
    const inProgress = attempts.find((attempt) => attempt.status === "IN_PROGRESS");
    const used = attempts.length;
    let state: StudentExamState;
    if (inProgress) state = "inProgress";
    else if (exam.startsAt && now < exam.startsAt) state = "upcoming";
    else if (isWindowOpen(exam, now) && used < exam.maxAttempts) state = "open";
    else state = used > 0 ? "finished" : "missed";
    return { ...exam, attemptsUsed: used, state, resultsPublished: Boolean(exam.resultsPublishedAt) };
  });
}

/** Lo que el estudiante ve antes de empezar: instrucciones, tiempo y qué se supervisa. */
export async function getExamLobby(actor: CurrentUser, examId: string, now = new Date()) {
  const exam = await findTakeableExam(actor, examId);
  await finalizeExpiredAttempts({ examId, studentId: actor.id }, now);
  const [attempts, accommodation, questions, course] = await Promise.all([
    prisma.examAttempt.findMany({ where: { examId, studentId: actor.id }, orderBy: { number: "asc" } }),
    prisma.accommodation.findUnique({ where: { examId_studentId: { examId, studentId: actor.id } } }),
    prisma.examQuestion.findMany({ where: { examId }, select: { points: true } }),
    prisma.course.findUniqueOrThrow({ where: { id: exam.courseId }, select: { code: true, name: true } }),
  ]);
  const inProgress = attempts.find((attempt) => attempt.status === "IN_PROGRESS") ?? null;
  const proctoring = readProctoringConfig(exam.proctoringConfig);
  const extraMinutes = accommodation?.extraMinutes ?? 0;

  let blocked: "upcoming" | "closed" | "noAttemptsLeft" | null = null;
  if (!inProgress) {
    if (exam.startsAt && now < exam.startsAt) blocked = "upcoming";
    else if (!isWindowOpen(exam, now)) blocked = "closed";
    else if (attempts.length >= exam.maxAttempts) blocked = "noAttemptsLeft";
  }
  return {
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      questionCount: questions.length,
      totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
      resultsPublished: Boolean(exam.resultsPublishedAt),
    },
    course,
    attemptsUsed: attempts.length,
    inProgressAttemptId: inProgress?.id ?? null,
    blocked,
    extraMinutes,
    // Lo que el examen solicita a este estudiante (con su exención de cámara aplicada).
    requests: {
      camera: proctoring.camera === "requested" && !accommodation?.cameraExempt,
      microphone: proctoring.microphone === "requested",
      fullscreen: proctoring.fullscreen === "requested",
    },
    cameraExempt: Boolean(accommodation?.cameraExempt),
    isMinor: actor.isMinor,
  };
}

// ---------- Iniciar, retomar y reclamar ----------

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export interface StartInput {
  clientId: string;
  consent: { camera: boolean; microphone: boolean };
}

/** Empieza un intento nuevo o retoma el que está en curso. Devuelve el id del intento. */
export async function startAttempt(actor: CurrentUser, examId: string, input: StartInput, now = new Date()) {
  const lobby = await getExamLobby(actor, examId, now);
  if (lobby.inProgressAttemptId) {
    await claimAttempt(actor, lobby.inProgressAttemptId, input.clientId, now);
    return lobby.inProgressAttemptId;
  }
  if (lobby.blocked === "upcoming") throw new ConflictError("El examen todavía no está disponible.", "upcoming");
  if (lobby.blocked === "closed") throw new ConflictError("El examen ya cerró.", "closed");
  if (lobby.blocked === "noAttemptsLeft") throw new ConflictError("Ya usaste todos tus intentos.", "noAttemptsLeft");
  if (!input.clientId || input.clientId.length > 64) throw new ValidationError("Falta el identificador del dispositivo.");

  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
  const questions = await prisma.examQuestion.findMany({ where: { examId }, orderBy: { position: "asc" }, select: { id: true, points: true } });
  const ids = questions.map((question) => question.id);

  // Un menor necesita la autorización de su acudiente, que la institución registra (Fase 7):
  // mientras no exista, presenta sin cámara ni micrófono. Negarse nunca genera alertas.
  const camera = !actor.isMinor && lobby.requests.camera && input.consent.camera;
  const microphone = !actor.isMinor && lobby.requests.microphone && input.consent.microphone;

  try {
    const attempt = await prisma.examAttempt.create({
      data: {
        examId,
        studentId: actor.id,
        number: lobby.attemptsUsed + 1,
        startedAt: now,
        deadlineAt: computeDeadline(now, exam.durationMinutes, lobby.extraMinutes, exam.endsAt!),
        activeClientId: input.clientId,
        questionOrder: exam.shuffleQuestions ? shuffled(ids) : ids,
        maxScore: questions.reduce((sum, question) => sum + question.points, 0),
        consent: {
          create: { textVersion: CONSENT_TEXT_VERSION, camera, microphone, grantedBy: camera || microphone ? "STUDENT" : null, grantedAt: now },
        },
      },
    });
    await recordAudit({
      institutionId: actor.institutionId,
      actorId: actor.id,
      action: "ATTEMPT_STARTED",
      entityType: "ExamAttempt",
      entityId: attempt.id,
      metadata: { examId, number: attempt.number },
    });
    return attempt.id;
  } catch (error) {
    // Dos pestañas empezando a la vez: la segunda retoma el intento que creó la primera.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.examAttempt.findFirst({ where: { examId, studentId: actor.id, status: "IN_PROGRESS" } });
      if (existing) {
        await claimAttempt(actor, existing.id, input.clientId, now);
        return existing.id;
      }
    }
    throw error;
  }
}

/**
 * El dispositivo o pestaña que abre el intento pasa a ser el activo; el anterior deja de
 * poder guardar. Cada cambio se cuenta como evidencia (no como falta).
 */
export async function claimAttempt(actor: CurrentUser, attemptId: string, clientId: string, now = new Date()) {
  const attempt = await findOwnAttempt(actor, attemptId);
  if (attempt.status !== "IN_PROGRESS") return attempt;
  if (isPastDeadline(attempt.deadlineAt, now)) {
    await finalizeAttempt(attempt, now, true, null);
    return prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  }
  if (attempt.activeClientId === clientId) return attempt;
  const switched = attempt.activeClientId !== null;
  const updated = await prisma.examAttempt.update({
    where: { id: attemptId },
    data: { activeClientId: clientId, ...(switched ? { clientSwitches: { increment: 1 } } : {}) },
  });
  if (switched) {
    await recordAudit({
      institutionId: actor.institutionId,
      actorId: actor.id,
      action: "ATTEMPT_DEVICE_CHANGED",
      entityType: "ExamAttempt",
      entityId: attemptId,
    });
  }
  return updated;
}

// ---------- Presentar ----------

/** El intento como lo ve el estudiante: preguntas en su orden y sin respuestas correctas. */
export async function getAttemptForStudent(actor: CurrentUser, attemptId: string, now = new Date()) {
  let attempt = await findOwnAttempt(actor, attemptId);
  if (attempt.status === "IN_PROGRESS" && isPastDeadline(attempt.deadlineAt, now)) {
    await finalizeAttempt(attempt, now, true, null);
    attempt = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  }
  const [exam, questions, answers] = await Promise.all([
    prisma.exam.findUniqueOrThrow({ where: { id: attempt.examId }, select: { id: true, title: true, instructions: true } }),
    // Sin answerKey: la selección explícita hace imposible enviarla por error.
    prisma.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: { id: true, type: true, prompt: true, points: true, options: true },
    }),
    prisma.answer.findMany({ where: { attemptId }, select: { examQuestionId: true, value: true, version: true } }),
  ]);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const ordered = attempt.questionOrder.map((id) => byId.get(id)).filter((question) => question !== undefined);
  return {
    attempt: {
      id: attempt.id,
      number: attempt.number,
      status: attempt.status,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
    },
    exam,
    questions: ordered.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      options: ((question.options as { id: string; label: string }[] | null) ?? []).map(({ id, label }) => ({ id, label })),
    })),
    answers: Object.fromEntries(answers.map((answer) => [answer.examQuestionId, { value: answer.value, version: answer.version }])),
    serverNow: now,
  };
}

async function findWritableAttempt(actor: CurrentUser, attemptId: string, clientId: string, now: Date) {
  const attempt = await findOwnAttempt(actor, attemptId);
  if (attempt.status !== "IN_PROGRESS") throw new ConflictError("El examen ya se entregó.", "submitted");
  if (isPastDeadline(attempt.deadlineAt, now)) {
    await finalizeAttempt(attempt, now, true, null);
    throw new ConflictError("Se acabó el tiempo: el examen se entregó con lo que alcanzaste a guardar.", "timeUp");
  }
  if (attempt.activeClientId !== clientId) {
    throw new ConflictError("El examen se abrió en otra pestaña o dispositivo.", "otherDevice");
  }
  return attempt;
}

export interface SaveAnswerInput {
  clientId: string;
  examQuestionId: string;
  value: unknown;
  /** Lo numera el navegador y solo crece: así un guardado viejo que llega tarde no pisa uno nuevo. */
  version: number;
}

export async function saveAnswer(actor: CurrentUser, attemptId: string, input: SaveAnswerInput, now = new Date()) {
  const attempt = await findWritableAttempt(actor, attemptId, input.clientId, now);
  if (!attempt.questionOrder.includes(input.examQuestionId)) throw new NotFoundError("La pregunta no es de este examen.");
  if (!Number.isInteger(input.version) || input.version < 1) throw new ValidationError("Versión inválida.");
  const question = await prisma.examQuestion.findUniqueOrThrow({ where: { id: input.examQuestionId }, select: { type: true } });
  const parsed = parseAnswerValue(question.type, input.value);
  if (!parsed.success) throw new ValidationError("La respuesta no tiene el formato esperado.");

  const value = toJson(parsed.data);
  const updated = await prisma.answer.updateMany({
    where: { attemptId, examQuestionId: input.examQuestionId, version: { lt: input.version } },
    data: { value, version: input.version },
  });
  if (updated.count === 0) {
    const existing = await prisma.answer.findUnique({ where: { attemptId_examQuestionId: { attemptId, examQuestionId: input.examQuestionId } } });
    if (existing) return { version: existing.version, stale: existing.version > input.version };
    try {
      await prisma.answer.create({ data: { attemptId, examQuestionId: input.examQuestionId, value, version: input.version } });
    } catch (error) {
      // Dos guardados de la misma pregunta a la vez: gana el de mayor versión.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      await prisma.answer.updateMany({
        where: { attemptId, examQuestionId: input.examQuestionId, version: { lt: input.version } },
        data: { value, version: input.version },
      });
    }
  }
  return { version: input.version, stale: false };
}

export async function submitAttempt(actor: CurrentUser, attemptId: string, clientId: string, now = new Date()) {
  const attempt = await findWritableAttempt(actor, attemptId, clientId, now);
  await finalizeAttempt(attempt, now, false, actor.id);
  return prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { id: true, status: true, submittedAt: true } });
}
