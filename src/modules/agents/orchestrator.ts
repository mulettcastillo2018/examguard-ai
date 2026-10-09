import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { APP_TIME_ZONE } from "@/lib/time";
import { analyzeEvents } from "./pipeline";
import { readThresholds } from "./thresholds";

// Orquestador: cuando llegan eventos nuevos (y al entregar), analiza la sesión, guarda las
// señales (una por regla, actualizada en cada análisis), marca "revisión recomendada" si
// corresponde y registra cada agente en AgentRun. Una revisión hecha por una persona
// nunca se pisa.

export async function analyzeSession(sessionId: string, now = new Date()) {
  const session = await prisma.proctoringSession.findUnique({
    where: { id: sessionId },
    include: { attempt: { select: { exam: { select: { institutionId: true } } } }, signals: { select: { ruleId: true, explanation: true } } },
  });
  if (!session) return null;
  const [events, policy] = await Promise.all([
    prisma.proctoringEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: "asc" },
      select: { id: true, type: true, category: true, severity: true, occurredAt: true, durationSec: true, confidence: true, source: true },
    }),
    prisma.policy.findUnique({ where: { institutionId: session.attempt.exam.institutionId }, select: { ruleThresholds: true } }),
  ]);

  const result = analyzeEvents({
    session: {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      cameraEnabled: session.cameraEnabled,
      microphoneEnabled: session.microphoneEnabled,
    },
    events,
    thresholds: readThresholds(policy?.ruleThresholds),
    now,
    timeZone: APP_TIME_ZONE,
  });

  // Si las señales cambiaron, el resumen guardado ya no las describe: se rehace al abrir la revisión.
  const fingerprint = (items: { ruleId: string; explanation: string }[]) =>
    items
      .map((item) => `${item.ruleId}:${item.explanation}`)
      .sort()
      .join("|");
  const signalsChanged = fingerprint(session.signals) !== fingerprint(result.signals);
  const reviewStatus = session.reviewStatus === "REVIEWED" ? "REVIEWED" : result.risk.recommended ? "RECOMMENDED" : "NOT_REQUIRED";

  await prisma.$transaction(async (tx) => {
    await tx.riskSignal.deleteMany({ where: { sessionId, ruleId: { notIn: result.signals.map((signal) => signal.ruleId) } } });
    for (const signal of result.signals) {
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
    await tx.proctoringSession.update({
      where: { id: sessionId },
      data: { reviewStatus, analyzedAt: now, ...(signalsChanged ? { riskSummary: null, riskSummaryProvider: null, riskSummaryAt: null } : {}) },
    });
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
  });
  return { signals: result.signals, risk: result.risk, reviewStatus };
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
