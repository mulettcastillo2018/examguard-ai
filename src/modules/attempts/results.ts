import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { findManageableExam } from "@/modules/exams/exams";
import { assertCan } from "@/modules/rbac";
import { finalizeExpiredAttempts } from "./attempts";
import { summarizeGrades } from "./grading";

// Resultados: el docente califica lo que falta y publica; el estudiante ve su nota solo
// después. Con varios intentos cuenta la mejor nota (docs/DECISIONES.md).

export const RESULTS_PROBLEMS = ["windowOpen", "attemptsInProgress", "pendingGrading"] as const;
export type ResultsProblem = (typeof RESULTS_PROBLEMS)[number];

const bestScore = (scores: (number | null)[]) => {
  const graded = scores.filter((score): score is number => score !== null);
  return graded.length ? Math.max(...graded) : null;
};

// ---------- Docente ----------

export async function getExamResults(actor: CurrentUser, examId: string, now = new Date()) {
  const exam = await findManageableExam(actor, examId);
  await finalizeExpiredAttempts({ examId }, now);
  const [enrollments, attempts, pending, questions] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: exam.courseId },
      select: { student: { select: { id: true, name: true, isMinor: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    prisma.examAttempt.findMany({
      where: { examId },
      orderBy: [{ number: "asc" }],
      select: {
        id: true,
        studentId: true,
        number: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        gradingStatus: true,
        clientSwitches: true,
        proctoring: { select: { reviewStatus: true } },
      },
    }),
    // Cola manual: respuestas de intentos entregados que aún no tienen puntos.
    prisma.answer.findMany({
      where: { attempt: { examId, status: { not: "IN_PROGRESS" } }, pointsAwarded: null },
      orderBy: [{ examQuestion: { position: "asc" } }, { attempt: { student: { name: "asc" } } }],
      select: {
        id: true,
        value: true,
        attempt: { select: { id: true, number: true, student: { select: { name: true } } } },
        examQuestion: { select: { id: true, position: true, type: true, prompt: true, points: true, answerKey: true } },
      },
    }),
    prisma.examQuestion.findMany({ where: { examId }, select: { points: true } }),
  ]);

  const rows = enrollments.map(({ student }) => {
    const own = attempts.filter((attempt) => attempt.studentId === student.id);
    return {
      student,
      attempts: own,
      best: bestScore(own.map((attempt) => attempt.score)),
      inProgress: own.some((attempt) => attempt.status === "IN_PROGRESS"),
      pendingManual: own.some((attempt) => attempt.gradingStatus === "PENDING_MANUAL"),
      reviewRecommended: own.some((attempt) => attempt.proctoring?.reviewStatus === "RECOMMENDED"),
    };
  });

  const problems: ResultsProblem[] = [];
  if (!exam.endsAt || now < exam.endsAt) problems.push("windowOpen");
  if (attempts.some((attempt) => attempt.status === "IN_PROGRESS")) problems.push("attemptsInProgress");
  if (pending.length) problems.push("pendingGrading");

  return {
    exam: { id: exam.id, title: exam.title, status: exam.status, endsAt: exam.endsAt, resultsPublishedAt: exam.resultsPublishedAt },
    maxScore: questions.reduce((sum, question) => sum + question.points, 0),
    rows,
    pending: pending.map((answer) => ({
      id: answer.id,
      value: answer.value,
      studentName: answer.attempt.student.name,
      attemptNumber: answer.attempt.number,
      question: answer.examQuestion,
    })),
    publishProblems: exam.resultsPublishedAt ? [] : problems,
  };
}

/** Respuestas de un intento con la clave y la calificación (solo para el docente). */
export async function getAttemptDetail(actor: CurrentUser, examId: string, attemptId: string) {
  await findManageableExam(actor, examId);
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, examId },
    include: { student: { select: { name: true } }, consent: true, proctoring: { include: { signals: true } } },
  });
  if (!attempt) throw new NotFoundError("El intento no es de este examen.");
  const answers = await prisma.answer.findMany({
    where: { attemptId },
    include: { examQuestion: true },
    orderBy: { examQuestion: { position: "asc" } },
  });
  return { attempt, answers };
}

const manualGradeSchema = z.object({
  points: z.number().min(0, "points").refine((value) => Number.isInteger(value * 4), "points"),
  feedback: z.string().trim().max(1000, "feedback").default(""),
});

/** Califica (o corrige) una respuesta y recalcula la nota del intento. */
export async function gradeAnswerManually(
  actor: CurrentUser,
  examId: string,
  answerId: string,
  input: { points: number; feedback?: string },
  now = new Date(),
) {
  await findManageableExam(actor, examId);
  const answer = await prisma.answer.findFirst({
    where: { id: answerId, attempt: { examId } },
    include: { attempt: true, examQuestion: { select: { points: true } } },
  });
  if (!answer) throw new NotFoundError("La respuesta no es de este examen.");
  if (answer.attempt.status === "IN_PROGRESS") throw new ConflictError("El estudiante todavía está presentando.", "inProgress");
  const parsed = manualGradeSchema.safeParse(input);
  if (!parsed.success || parsed.data.points > answer.examQuestion.points) {
    throw new ValidationError("Los puntos no son válidos.", [{ path: "points", message: "points" }]);
  }

  await prisma.answer.update({
    where: { id: answerId },
    data: {
      pointsAwarded: parsed.data.points,
      feedback: parsed.data.feedback || null,
      autoGraded: false,
      gradedById: actor.id,
      gradedAt: now,
    },
  });
  const all = await prisma.answer.findMany({ where: { attemptId: answer.attemptId }, select: { pointsAwarded: true } });
  const summary = summarizeGrades(all.map((entry) => entry.pointsAwarded));
  await prisma.examAttempt.update({
    where: { id: answer.attemptId },
    data: { score: summary.score, gradingStatus: summary.pending > 0 ? "PENDING_MANUAL" : "GRADED" },
  });
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "ANSWER_GRADED",
    entityType: "ExamAttempt",
    entityId: answer.attemptId,
    metadata: { answerId, points: parsed.data.points },
  });
}

/** Publica las notas: con la ventana cerrada, nadie presentando y nada por calificar. */
export async function publishResults(actor: CurrentUser, examId: string, now = new Date()) {
  const results = await getExamResults(actor, examId, now);
  if (results.exam.resultsPublishedAt) throw new ConflictError("Los resultados ya están publicados.", "alreadyPublished");
  if (results.publishProblems.length) {
    throw new ValidationError(
      "Todavía no se pueden publicar los resultados.",
      results.publishProblems.map((problem) => ({ path: "publish", message: problem })),
    );
  }
  await prisma.exam.update({ where: { id: examId }, data: { resultsPublishedAt: now } });
  await recordAudit({ institutionId: actor.institutionId, actorId: actor.id, action: "RESULTS_PUBLISHED", entityType: "Exam", entityId: examId });
}

/**
 * Cierra el examen antes de su hora (por ejemplo, cuando todos ya entregaron) para poder
 * publicar notas. Solo si nadie está presentando: nunca le corta el tiempo a nadie.
 */
export async function closeExamNow(actor: CurrentUser, examId: string, now = new Date()) {
  const exam = await findManageableExam(actor, examId);
  if (exam.status !== "PUBLISHED") throw new ConflictError("Solo se puede cerrar un examen publicado.", "notPublished");
  await finalizeExpiredAttempts({ examId }, now);
  if (await prisma.examAttempt.count({ where: { examId, status: "IN_PROGRESS" } })) {
    throw new ConflictError("Hay estudiantes presentando: espera a que entreguen.", "attemptsInProgress");
  }
  const endsAt = exam.endsAt && exam.endsAt < now ? exam.endsAt : now;
  await prisma.exam.update({ where: { id: examId }, data: { status: "CLOSED", closedAt: now, endsAt } });
  await recordAudit({ institutionId: actor.institutionId, actorId: actor.id, action: "EXAM_CLOSED", entityType: "Exam", entityId: examId });
}

// ---------- Estudiante ----------

/**
 * Resultado del estudiante, solo con las notas publicadas: puntos y retroalimentación de
 * cada pregunta del intento con mejor nota. Sin respuestas correctas, para que el docente
 * pueda reutilizar sus preguntas.
 */
export async function getStudentResult(actor: CurrentUser, examId: string) {
  assertCan(actor, "results:read-own");
  const exam = await prisma.exam.findFirst({
    where: { id: examId, institutionId: actor.institutionId, course: { enrollments: { some: { studentId: actor.id } } } },
    select: { id: true, title: true, resultsPublishedAt: true, course: { select: { code: true, name: true } } },
  });
  if (!exam) throw new NotFoundError("El examen no existe o no es de tus cursos.");
  if (!exam.resultsPublishedAt) throw new ConflictError("Los resultados todavía no están publicados.", "notPublished");

  const attempts = await prisma.examAttempt.findMany({
    where: { examId, studentId: actor.id, status: { not: "IN_PROGRESS" } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, score: true, maxScore: true, submittedAt: true, status: true },
  });
  const best = attempts.reduce<(typeof attempts)[number] | null>(
    (current, attempt) => (attempt.score !== null && (current?.score == null || attempt.score >= current.score) ? attempt : current),
    null,
  );
  const answers = best
    ? await prisma.answer.findMany({
        where: { attemptId: best.id },
        orderBy: { examQuestion: { position: "asc" } },
        select: {
          value: true,
          pointsAwarded: true,
          feedback: true,
          // Sin answerKey.
          examQuestion: { select: { id: true, type: true, prompt: true, points: true, options: true } },
        },
      })
    : [];
  return {
    exam: { id: exam.id, title: exam.title, course: exam.course },
    attempts,
    best,
    answers: answers.map((answer) => ({
      question: {
        ...answer.examQuestion,
        options: ((answer.examQuestion.options as { id: string; label: string }[] | null) ?? []).map(({ id, label }) => ({ id, label })),
      },
      value: answer.value,
      pointsAwarded: answer.pointsAwarded,
      feedback: answer.feedback,
    })),
  };
}
