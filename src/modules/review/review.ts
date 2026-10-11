import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { labelSignals } from "@/modules/agents/labels";
import { recordAudit } from "@/modules/audit";
import { DEFAULT_RETENTION_DAYS, evidenceExpiresAt } from "@/modules/maintenance/retention";
import type { CurrentUser } from "@/modules/auth/session";
import type { EventCategory } from "@/modules/proctoring/catalog";
import { assertCan, assertRole } from "@/modules/rbac";
import { highestSeverity, type QueueFilter, type ReviewInput, reviewSchema, type TimelineFilters } from "./rules";

// Revisión humana (Fase 6): quien revisa ve la sesión completa —información, línea de
// tiempo, señales y resumen— y deja su decisión. El sistema recomienda; la persona decide.
// El estudiante, por su parte, ve los hechos registrados de sus propias sesiones.

export {
  NOTES_MAX,
  NOTES_MIN_FOR_INVESTIGATION,
  parseQueueFilter,
  parseTimelineFilters,
  QUEUE_FILTERS,
  REVIEW_OUTCOMES,
  type QueueFilter,
  type ReviewInput,
  type ReviewOutcome,
  type TimelineFilters,
} from "./rules";

// ---------- Alcance ----------

/** Sesiones que puede revisar: el docente, las de sus cursos; el administrador, las de su institución. */
function reviewScope(actor: CurrentUser): Prisma.ProctoringSessionWhereInput {
  assertCan(actor, "sessions:review");
  const exam: Prisma.ExamWhereInput =
    actor.role === "ADMIN"
      ? { institutionId: actor.institutionId }
      : { institutionId: actor.institutionId, course: { teachers: { some: { teacherId: actor.id } } } };
  return { attempt: { exam } };
}

// ---------- Cola de revisión ----------

/** Sesiones por revisar (o ya revisadas) del alcance de quien pregunta, las más recientes primero. */
export async function listReviewQueue(actor: CurrentUser, filter: QueueFilter = "RECOMMENDED", now = new Date()) {
  const where: Prisma.ProctoringSessionWhereInput = {
    ...reviewScope(actor),
    ...(filter === "ALL" ? { reviewStatus: { in: ["RECOMMENDED", "REVIEWED"] } } : { reviewStatus: filter }),
  };
  const [sessions, counts, policy] = await Promise.all([
    prisma.proctoringSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 200,
      select: {
        id: true,
        reviewStatus: true,
        startedAt: true,
        eventCount: true,
        evidencePurgedAt: true,
        signals: { select: { severity: true } },
        review: { select: { outcome: true, reviewedAt: true, reviewer: { select: { name: true } } } },
        attempt: {
          select: {
            id: true,
            number: true,
            status: true,
            submittedAt: true,
            student: { select: { name: true } },
            exam: { select: { id: true, title: true, course: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.proctoringSession.groupBy({ by: ["reviewStatus"], where: reviewScope(actor), _count: { _all: true } }),
    prisma.policy.findUnique({ where: { institutionId: actor.institutionId }, select: { evidenceRetentionDays: true } }),
  ]);
  const retentionDays = policy?.evidenceRetentionDays ?? DEFAULT_RETENTION_DAYS;

  const count = (status: "RECOMMENDED" | "REVIEWED") => counts.find((row) => row.reviewStatus === status)?._count._all ?? 0;
  return {
    filter,
    counts: { recommended: count("RECOMMENDED"), reviewed: count("REVIEWED") },
    rows: sessions.map((session) => {
      const expiresAt = session.attempt.submittedAt ? evidenceExpiresAt(session.attempt.submittedAt, retentionDays) : null;
      return {
        sessionId: session.id,
        reviewStatus: session.reviewStatus,
        startedAt: session.startedAt,
        eventCount: session.eventCount,
        signalCount: session.signals.length,
        highestSeverity: highestSeverity(session.signals.map((signal) => signal.severity)),
        review: session.review,
        attempt: session.attempt,
        // Hasta cuándo hay evidencia para revisar (luego la retención la borra); urgente si
        // quedan menos de 7 días y nadie ha revisado.
        evidencePurgedAt: session.evidencePurgedAt,
        evidenceExpiresAt: session.evidencePurgedAt ? null : expiresAt,
        evidenceUrgent: Boolean(!session.evidencePurgedAt && !session.review && expiresAt && expiresAt.getTime() - now.getTime() < 7 * 86_400_000),
      };
    }),
  };
}

/** Sesiones con revisión recomendada que todavía nadie revisó (para el panel). */
export async function countPendingReviews(actor: CurrentUser) {
  return prisma.proctoringSession.count({ where: { ...reviewScope(actor), reviewStatus: "RECOMMENDED" } });
}

// ---------- Una sesión ----------

const eventSelect = {
  id: true,
  type: true,
  category: true,
  severity: true,
  occurredAt: true,
  durationSec: true,
  confidence: true,
  source: true,
  metadata: true,
} satisfies Prisma.ProctoringEventSelect;

async function findReviewableSession(actor: CurrentUser, sessionId: string) {
  const session = await prisma.proctoringSession.findFirst({
    where: { id: sessionId, ...reviewScope(actor) },
    include: {
      signals: true,
      review: { include: { reviewer: { select: { name: true } } } },
      attempt: {
        include: {
          consent: true,
          student: { select: { name: true, isMinor: true } },
          exam: { select: { id: true, title: true, institutionId: true, course: { select: { name: true } } } },
        },
      },
    },
  });
  if (!session) throw new NotFoundError("La sesión no existe o no es de tus cursos.");
  return session;
}

/** Todo lo que quien revisa necesita para decidir, con la línea de tiempo filtrada. */
export async function getSessionReview(actor: CurrentUser, sessionId: string, filters: TimelineFilters = {}, now = new Date()) {
  const session = await findReviewableSession(actor, sessionId);
  const [events, byCategory, history, policy] = await Promise.all([
    prisma.proctoringEvent.findMany({
      where: { sessionId, category: filters.category, severity: filters.severity, source: filters.source },
      orderBy: { occurredAt: "asc" },
      select: eventSelect,
    }),
    prisma.proctoringEvent.groupBy({ by: ["category"], where: { sessionId }, _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { action: "SESSION_REVIEWED", entityType: "ProctoringSession", entityId: sessionId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, metadata: true, actor: { select: { name: true } } },
    }),
    prisma.policy.findUnique({ where: { institutionId: actor.institutionId }, select: { evidenceRetentionDays: true } }),
  ]);
  const retentionDays = policy?.evidenceRetentionDays ?? DEFAULT_RETENTION_DAYS;

  const signals = labelSignals(session.signals);
  // Qué señales citan cada evento, para marcarlo en la línea de tiempo.
  const citedBy = new Map<string, string[]>();
  for (const signal of signals) {
    for (const eventId of signal.eventIds) citedBy.set(eventId, [...(citedBy.get(eventId) ?? []), signal.label]);
  }

  const { attempt } = session;
  const endedAt = attempt.submittedAt ?? session.endedAt;
  return {
    session: {
      id: session.id,
      reviewStatus: session.reviewStatus,
      browser: session.browser,
      os: session.os,
      device: session.device,
      cameraEnabled: session.cameraEnabled,
      microphoneEnabled: session.microphoneEnabled,
      startedAt: session.startedAt,
      endedAt,
      durationSec: Math.max(0, Math.round(((endedAt ?? now).getTime() - session.startedAt.getTime()) / 1000)),
      eventCount: session.eventCount,
      riskSummary: session.riskSummary,
      riskSummaryProvider: session.riskSummaryProvider,
      // Retención: cuándo se borró la evidencia, o hasta cuándo se conserva.
      retentionDays,
      evidencePurgedAt: session.evidencePurgedAt,
      evidenceExpiresAt: endedAt && !session.evidencePurgedAt ? evidenceExpiresAt(endedAt, retentionDays) : null,
    },
    attempt: {
      id: attempt.id,
      number: attempt.number,
      status: attempt.status,
      clientSwitches: attempt.clientSwitches,
      student: attempt.student,
      exam: attempt.exam,
      consent: attempt.consent,
    },
    signals: signals.map(({ id, label, severity, explanation, eventIds }) => ({ id, label, severity, explanation, eventIds })),
    timeline: events.map((event) => ({ ...event, citedBy: citedBy.get(event.id) ?? [] })),
    totals: Object.fromEntries(byCategory.map((row) => [row.category, row._count._all])) as Partial<Record<EventCategory, number>>,
    filters,
    review: session.review,
    history,
    canReview: attempt.status !== "IN_PROGRESS",
  };
}

export type SessionReview = Awaited<ReturnType<typeof getSessionReview>>;

// ---------- Guardar la decisión ----------

/** Registra (o corrige) la revisión de una sesión terminada y la marca como revisada. */
export async function saveReview(actor: CurrentUser, sessionId: string, input: ReviewInput, now = new Date()) {
  const session = await findReviewableSession(actor, sessionId);
  if (session.attempt.status === "IN_PROGRESS") throw new ConflictError("El estudiante todavía está presentando.", "inProgress");

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Revisa los datos de la revisión.",
      parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "outcome", message: issue.message })),
    );
  }
  const { outcome, notes } = parsed.data;
  const previousOutcome = session.review?.outcome ?? null;

  await prisma.$transaction([
    prisma.review.upsert({
      where: { sessionId },
      create: { sessionId, reviewerId: actor.id, outcome, notes: notes || null, reviewedAt: now },
      update: { reviewerId: actor.id, outcome, notes: notes || null, reviewedAt: now },
    }),
    prisma.proctoringSession.update({ where: { id: sessionId }, data: { reviewStatus: "REVIEWED" } }),
  ]);

  // La auditoría guarda quién decidió qué y cuándo; las observaciones quedan solo en la revisión.
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "SESSION_REVIEWED",
    entityType: "ProctoringSession",
    entityId: sessionId,
    metadata: { outcome, previousOutcome, attemptId: session.attemptId, examId: session.attempt.exam.id, withNotes: Boolean(notes) },
  });
  return { outcome };
}

// ---------- Mis datos de supervisión (estudiante) ----------

/** Estado de la revisión que ve el estudiante: si hubo o habrá revisión humana, sin el resultado. */
export type StudentReviewState = "NONE" | "PENDING" | "DONE";
const studentState = (status: "NOT_REQUIRED" | "RECOMMENDED" | "REVIEWED"): StudentReviewState =>
  status === "REVIEWED" ? "DONE" : status === "RECOMMENDED" ? "PENDING" : "NONE";

/** Sesiones de supervisión del estudiante, con lo que autorizó y cuántos eventos hubo. */
export async function listMySupervision(actor: CurrentUser) {
  assertRole(actor, "STUDENT");
  const [attempts, policy] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { studentId: actor.id, proctoring: { isNot: null } },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        number: true,
        startedAt: true,
        consent: { select: { camera: true, microphone: true } },
        exam: { select: { title: true, course: { select: { name: true } } } },
        proctoring: { select: { eventCount: true, reviewStatus: true, evidencePurgedAt: true } },
      },
    }),
    prisma.policy.findUnique({ where: { institutionId: actor.institutionId }, select: { evidenceRetentionDays: true } }),
  ]);
  return {
    retentionDays: policy?.evidenceRetentionDays ?? null,
    rows: attempts.map((attempt) => ({
      attemptId: attempt.id,
      number: attempt.number,
      startedAt: attempt.startedAt,
      exam: attempt.exam,
      consent: attempt.consent,
      eventCount: attempt.proctoring?.eventCount ?? 0,
      evidencePurgedAt: attempt.proctoring?.evidencePurgedAt ?? null,
      reviewState: studentState(attempt.proctoring?.reviewStatus ?? "NOT_REQUIRED"),
    })),
  };
}

/** Los hechos registrados en una sesión propia: eventos, dispositivo y consentimiento. */
export async function getMySupervisionSession(actor: CurrentUser, attemptId: string) {
  assertRole(actor, "STUDENT");
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, studentId: actor.id },
    select: {
      id: true,
      number: true,
      submittedAt: true,
      consent: true,
      exam: { select: { title: true, course: { select: { name: true } } } },
      proctoring: {
        select: {
          browser: true,
          os: true,
          startedAt: true,
          endedAt: true,
          cameraEnabled: true,
          microphoneEnabled: true,
          reviewStatus: true,
          evidencePurgedAt: true,
          events: { orderBy: { occurredAt: "asc" }, select: eventSelect },
        },
      },
    },
  });
  if (!attempt?.proctoring) throw new NotFoundError("No encontramos esa sesión de supervisión.");
  const policy = await prisma.policy.findUnique({ where: { institutionId: actor.institutionId }, select: { evidenceRetentionDays: true } });
  const { events, reviewStatus, ...session } = attempt.proctoring;
  return {
    attempt: { id: attempt.id, number: attempt.number, submittedAt: attempt.submittedAt, exam: attempt.exam, consent: attempt.consent },
    session: { ...session, endedAt: attempt.submittedAt ?? session.endedAt },
    events,
    reviewState: studentState(reviewStatus),
    retentionDays: policy?.evidenceRetentionDays ?? null,
  };
}
