import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/modules/auth/session";
import { DEFAULT_RETENTION_DAYS } from "@/modules/maintenance/retention";
import { assertCan } from "@/modules/rbac";

// Métricas de supervisión para la administración: cuánto se usa, qué falta revisar y qué
// requiere atención. Solo conteos de la institución; ningún dato de un estudiante en particular.

const DAY_MS = 86_400_000;
export const METRICS_WINDOW_DAYS = 30;

export async function getSupervisionMetrics(actor: CurrentUser, now = new Date()) {
  assertCan(actor, "institution:manage");
  const institutionId = actor.institutionId;
  const since = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);
  const policy = await prisma.policy.findUnique({ where: { institutionId }, select: { evidenceRetentionDays: true } });
  const retentionDays = policy?.evidenceRetentionDays ?? DEFAULT_RETENTION_DAYS;
  // Una sesión por revisar pierde su evidencia en menos de 7 días si se entregó antes de esto.
  const urgentBefore = new Date(now.getTime() - (retentionDays - 7) * DAY_MS);

  const inInstitution = { exam: { institutionId } };
  const finishedInWindow = { ...inInstitution, status: { not: "IN_PROGRESS" as const }, submittedAt: { gte: since } };

  const [finished, withCamera, withMicrophone, pending, urgent, outcomes, signals, minors] = await Promise.all([
    prisma.examAttempt.count({ where: finishedInWindow }),
    prisma.proctoringSession.count({ where: { cameraEnabled: true, attempt: finishedInWindow } }),
    prisma.proctoringSession.count({ where: { microphoneEnabled: true, attempt: finishedInWindow } }),
    prisma.proctoringSession.count({ where: { reviewStatus: "RECOMMENDED", attempt: inInstitution } }),
    prisma.proctoringSession.count({
      where: { reviewStatus: "RECOMMENDED", evidencePurgedAt: null, attempt: { ...inInstitution, submittedAt: { lt: urgentBefore } } },
    }),
    prisma.review.groupBy({ by: ["outcome"], where: { reviewedAt: { gte: since }, session: { attempt: inInstitution } }, _count: { _all: true } }),
    prisma.riskSignal.groupBy({ by: ["type"], where: { windowStart: { gte: since }, session: { attempt: inInstitution } }, _count: { _all: true } }),
    prisma.user.findMany({
      where: { institutionId, role: "STUDENT", isMinor: true, active: true },
      select: { guardianConsent: { select: { revokedAt: true } } },
    }),
  ]);

  const outcome = (value: "NO_IRREGULARITY" | "NEEDS_INVESTIGATION") => outcomes.find((row) => row.outcome === value)?._count._all ?? 0;
  return {
    windowDays: METRICS_WINDOW_DAYS,
    retentionDays,
    finished,
    withCamera,
    withMicrophone,
    pending,
    urgent,
    reviewed: { noIrregularity: outcome("NO_IRREGULARITY"), needsInvestigation: outcome("NEEDS_INVESTIGATION") },
    signals: signals.map((row) => ({ type: row.type, count: row._count._all })).sort((a, b) => b.count - a.count),
    minorsWithoutConsent: minors.filter((minor) => !minor.guardianConsent || minor.guardianConsent.revokedAt).length,
  };
}

export type SupervisionMetrics = Awaited<ReturnType<typeof getSupervisionMetrics>>;
