import "server-only";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { APP_TIME_ZONE } from "@/lib/time";
import { analyzeEvents } from "./pipeline";
import { readThresholds } from "./thresholds";
import type { RiskSignalDraft } from "./types";

// Orquestador: cuando llegan eventos nuevos (y al entregar), analiza la sesión, guarda las
// señales (una por regla, actualizada en cada análisis), marca "revisión recomendada" si
// corresponde y registra cada agente en AgentRun. Una revisión hecha por una persona
// nunca se pisa.

const SIGNAL_FIELDS = {
  ruleId: true,
  type: true,
  category: true,
  severity: true,
  confidence: true,
  explanation: true,
  eventIds: true,
  windowStart: true,
  windowEnd: true,
} as const;

type StoredSignal = Prisma.RiskSignalGetPayload<{ select: typeof SIGNAL_FIELDS }>;

function sameSignal(stored: StoredSignal | undefined, signal: RiskSignalDraft) {
  return (
    stored !== undefined &&
    stored.type === signal.type &&
    stored.category === signal.category &&
    stored.severity === signal.severity &&
    stored.confidence === signal.confidence &&
    stored.explanation === signal.explanation &&
    stored.windowStart.getTime() === signal.windowStart.getTime() &&
    stored.windowEnd.getTime() === signal.windowEnd.getTime() &&
    stored.eventIds.join() === signal.eventIds.join()
  );
}

export async function analyzeSession(sessionId: string, now = new Date()) {
  const [session, events] = await Promise.all([
    prisma.proctoringSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        cameraEnabled: true,
        microphoneEnabled: true,
        reviewStatus: true,
        attempt: { select: { exam: { select: { institution: { select: { policy: { select: { ruleThresholds: true } } } } } } } },
      },
    }),
    prisma.proctoringEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: "asc" },
      select: { id: true, type: true, category: true, severity: true, occurredAt: true, durationSec: true, confidence: true, source: true },
    }),
  ]);
  if (!session) return null;

  const result = analyzeEvents({
    session: {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      cameraEnabled: session.cameraEnabled,
      microphoneEnabled: session.microphoneEnabled,
    },
    events,
    thresholds: readThresholds(session.attempt.exam.institution.policy?.ruleThresholds),
    now,
    timeZone: APP_TIME_ZONE,
  });
  const reviewStatus = session.reviewStatus === "REVIEWED" ? "REVIEWED" : result.risk.recommended ? "RECOMMENDED" : "NOT_REQUIRED";

  const applied = await prisma.$transaction(
    async (tx) => {
      // Esta escritura bloquea la sesión hasta el final: dos análisis de la misma sesión no se
      // mezclan, y uno más viejo que el ya guardado (lotes que se cruzan) se descarta.
      const claimed = await tx.proctoringSession.updateMany({
        where: { id: sessionId, OR: [{ analyzedAt: null }, { analyzedAt: { lte: now } }] },
        data: { reviewStatus, analyzedAt: now },
      });
      if (claimed.count === 0) return false;

      // Solo se escribe lo que cambió: casi siempre, nada.
      const stored = await tx.riskSignal.findMany({ where: { sessionId }, select: SIGNAL_FIELDS });
      const byRule = new Map(stored.map((signal) => [signal.ruleId, signal]));
      const kept = new Set(result.signals.map((signal) => signal.ruleId));
      const stale = stored.filter((signal) => !kept.has(signal.ruleId)).map((signal) => signal.ruleId);
      const changed = result.signals.filter((signal) => !sameSignal(byRule.get(signal.ruleId), signal));

      if (stale.length) await tx.riskSignal.deleteMany({ where: { sessionId, ruleId: { in: stale } } });
      for (const signal of changed) {
        const data = {
          type: signal.type,
          category: signal.category,
          severity: signal.severity,
          confidence: signal.confidence,
          explanation: signal.explanation,
          eventIds: signal.eventIds,
          windowStart: signal.windowStart,
          windowEnd: signal.windowEnd,
        };
        await tx.riskSignal.upsert({
          where: { sessionId_ruleId: { sessionId, ruleId: signal.ruleId } },
          create: { sessionId, ruleId: signal.ruleId, ...data },
          update: data,
        });
      }
      // Si las señales cambiaron, el resumen guardado ya no las describe: se rehace al abrir la revisión.
      if (stale.length || changed.length) {
        await tx.proctoringSession.update({ where: { id: sessionId }, data: { riskSummary: null, riskSummaryProvider: null, riskSummaryAt: null } });
      }

      const runs: Prisma.AgentRunCreateManyInput[] = [
        ...result.timings.map((timing) => ({
          sessionId,
          agent: timing.agent,
          status: timing.error ? ("ERROR" as const) : ("SUCCESS" as const),
          latencyMs: timing.latencyMs,
          error: timing.error ?? null,
          output: { findings: timing.findings },
        })),
        { sessionId, agent: "rule-engine", status: "SUCCESS", latencyMs: result.rulesMs, output: { signals: result.signals.map((signal) => signal.ruleId) } },
        { sessionId, agent: "risk", status: "SUCCESS", latencyMs: 0, output: { ...result.risk } },
      ];
      await tx.agentRun.createMany({ data: runs });
      return true;
    },
    // Con la base lejos (o despertando), los 5 s por defecto de Prisma se quedan cortos.
    { maxWait: 10_000, timeout: 20_000 },
  );
  return { applied, signals: result.signals, risk: result.risk, reviewStatus };
}

/** Analiza sin interrumpir a quien llama: un fallo del análisis no debe perder eventos ni entregas. */
export async function analyzeSessionSafely(where: { sessionId?: string; attemptId?: string }, now = new Date()) {
  try {
    const sessionId =
      where.sessionId ?? (await prisma.proctoringSession.findUnique({ where: { attemptId: where.attemptId }, select: { id: true } }))?.id;
    if (sessionId) await analyzeSession(sessionId, now);
  } catch (error) {
    logger.error("No se pudo analizar la sesión de supervisión", { ...where, error });
  }
}

/**
 * Pide el análisis de una sesión. Dentro de una petición corre después de responder (el
 * estudiante no espera a la base para enviar su siguiente lote); fuera de una petición
 * (pruebas, scripts) `after` no está disponible y corre en línea.
 */
export async function requestSessionAnalysis(where: { sessionId?: string; attemptId?: string }, now = new Date()) {
  try {
    after(() => analyzeSessionSafely(where, now));
  } catch {
    await analyzeSessionSafely(where, now);
  }
}
