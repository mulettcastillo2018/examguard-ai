import "server-only";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/modules/audit";

// Retención de la evidencia de supervisión (sección 11 del análisis): lo que el aviso de
// consentimiento promete —"se conservan N días y luego se borran"— se cumple aquí. Se
// borran los eventos, las señales, las ejecuciones de los agentes, el resumen y los datos
// del equipo; se conservan la nota, el consentimiento y la decisión de la revisión humana.

export const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
/** Sesiones por institución en cada pasada (la tarea diaria retoma las que falten). */
const BATCH = 500;

/** Hasta cuándo se conserva la evidencia de una sesión terminada. */
export function evidenceExpiresAt(endedAt: Date, retentionDays: number) {
  return new Date(endedAt.getTime() + retentionDays * DAY_MS);
}

/**
 * Borra la evidencia vencida (de todas las instituciones, o de una) y deja una entrada de
 * auditoría por institución.
 */
export async function purgeExpiredEvidence(now = new Date(), scope: { institutionId?: string } = {}) {
  const institutions = await prisma.institution.findMany({
    where: scope.institutionId ? { id: scope.institutionId } : undefined,
    select: { id: true, policy: { select: { evidenceRetentionDays: true } } },
  });
  const results: { institutionId: string; sessions: number; events: number }[] = [];

  for (const institution of institutions) {
    const retentionDays = institution.policy?.evidenceRetentionDays ?? DEFAULT_RETENTION_DAYS;
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    // Solo sesiones de intentos entregados hace más de la retención (las en curso nunca).
    const sessions = await prisma.proctoringSession.findMany({
      where: {
        evidencePurgedAt: null,
        attempt: { status: { not: "IN_PROGRESS" }, submittedAt: { lt: cutoff }, exam: { institutionId: institution.id } },
      },
      select: { id: true },
      take: BATCH,
    });
    if (sessions.length === 0) continue;

    const ids = sessions.map((session) => session.id);
    const [events] = await prisma.$transaction([
      prisma.proctoringEvent.deleteMany({ where: { sessionId: { in: ids } } }),
      prisma.riskSignal.deleteMany({ where: { sessionId: { in: ids } } }),
      prisma.agentRun.deleteMany({ where: { sessionId: { in: ids } } }),
      prisma.proctoringSession.updateMany({
        where: { id: { in: ids } },
        data: { evidencePurgedAt: now, riskSummary: null, riskSummaryProvider: null, browser: null, os: null, device: null },
      }),
    ]);

    await recordAudit({
      institutionId: institution.id,
      actorId: null,
      action: "EVIDENCE_PURGED",
      entityType: "Policy",
      entityId: institution.id,
      metadata: { sessions: ids.length, events: events.count, retentionDays },
    });
    results.push({ institutionId: institution.id, sessions: ids.length, events: events.count });
  }
  return results;
}

/** Los contadores de límites de uso viejos no sirven para nada: se limpian. */
export async function purgeStaleRateLimits(now = new Date()) {
  const { count } = await prisma.rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(now.getTime() - DAY_MS) } } });
  return count;
}
