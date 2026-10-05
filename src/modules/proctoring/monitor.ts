import "server-only";
import { prisma } from "@/lib/db";
import { isAnswered } from "@/modules/attempts/answers";
import { finalizeExpiredAttempts } from "@/modules/attempts/attempts";
import type { CurrentUser } from "@/modules/auth/session";
import { findManageableExam } from "@/modules/exams/exams";
import type { EventCategory } from "./catalog";

// Monitoreo en vivo del docente: quién presenta, si sigue conectado, cuánto le falta y
// qué eventos se registraron. Solo hechos; la interpretación llega con las reglas (Fase 5).

/** Sin señal de vida durante este tiempo, la pantalla del estudiante se da por desconectada. */
export const ONLINE_WINDOW_MS = 30_000;
const LAST_EVENTS = 8;

export async function getExamMonitor(actor: CurrentUser, examId: string, now = new Date()) {
  const exam = await findManageableExam(actor, examId);
  await finalizeExpiredAttempts({ examId }, now);

  const [enrollments, attempts, questionCount] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: exam.courseId },
      select: { student: { select: { id: true, name: true, isMinor: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    prisma.examAttempt.findMany({
      where: { examId },
      orderBy: { number: "desc" },
      select: {
        id: true,
        studentId: true,
        number: true,
        status: true,
        startedAt: true,
        deadlineAt: true,
        submittedAt: true,
        answers: { select: { value: true, examQuestion: { select: { type: true } } } },
        proctoring: {
          select: {
            id: true,
            cameraEnabled: true,
            microphoneEnabled: true,
            lastSeenAt: true,
            eventCount: true,
            browser: true,
            os: true,
            events: {
              orderBy: { occurredAt: "desc" },
              take: LAST_EVENTS,
              select: { id: true, type: true, category: true, severity: true, occurredAt: true, durationSec: true, confidence: true, source: true, metadata: true },
            },
          },
        },
      },
    }),
    prisma.examQuestion.count({ where: { examId } }),
  ]);

  const sessionIds = attempts.map((attempt) => attempt.proctoring?.id).filter((id): id is string => Boolean(id));
  const grouped = sessionIds.length
    ? await prisma.proctoringEvent.groupBy({ by: ["sessionId", "category"], where: { sessionId: { in: sessionIds } }, _count: { _all: true } })
    : [];
  const countsBySession = new Map<string, Partial<Record<EventCategory, number>>>();
  for (const row of grouped) {
    const counts = countsBySession.get(row.sessionId) ?? {};
    counts[row.category] = row._count._all;
    countsBySession.set(row.sessionId, counts);
  }

  const rows = enrollments.map(({ student }) => {
    // El intento más reciente es el que interesa en vivo.
    const attempt = attempts.find((item) => item.studentId === student.id);
    if (!attempt) return { student, attempt: null };
    const session = attempt.proctoring;
    return {
      student,
      attempt: {
        id: attempt.id,
        number: attempt.number,
        status: attempt.status,
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        submittedAt: attempt.submittedAt,
        answered: attempt.answers.filter((answer) => isAnswered(answer.examQuestion.type, answer.value)).length,
        session: session
          ? {
              cameraEnabled: session.cameraEnabled,
              microphoneEnabled: session.microphoneEnabled,
              browser: session.browser,
              os: session.os,
              lastSeenAt: session.lastSeenAt,
              online: attempt.status === "IN_PROGRESS" && Boolean(session.lastSeenAt && now.getTime() - session.lastSeenAt.getTime() < ONLINE_WINDOW_MS),
              eventCount: session.eventCount,
              counts: countsBySession.get(session.id) ?? {},
              lastEvents: session.events,
            }
          : null,
      },
    };
  });

  return {
    exam: { id: exam.id, title: exam.title, status: exam.status, endsAt: exam.endsAt },
    questionCount,
    rows,
    summary: {
      inProgress: rows.filter((row) => row.attempt?.status === "IN_PROGRESS").length,
      submitted: rows.filter((row) => row.attempt && row.attempt.status !== "IN_PROGRESS").length,
      notStarted: rows.filter((row) => !row.attempt).length,
    },
    serverNow: now,
  };
}

export type ExamMonitor = Awaited<ReturnType<typeof getExamMonitor>>;
