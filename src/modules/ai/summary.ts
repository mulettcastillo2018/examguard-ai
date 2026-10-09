import "server-only";
import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { NotFoundError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import { labelSignals } from "@/modules/agents/labels";
import { findManageableExam } from "@/modules/exams/exams";
import { createAnthropicProvider, describeAnthropicError } from "./anthropic";
import { buildSummaryPrompt, SUMMARY_SYSTEM, templateSummary, validateSummary, type SummarySignal } from "./guardrails";
import type { AIProvider } from "./provider";

// Resumen para quien revisa una sesión. Se genera al abrirla (no en cada evento, para no
// gastar en sesiones que nadie revisa) y queda guardado hasta que las señales cambien.

export function getAIProvider(): AIProvider | null {
  const env = getServerEnv();
  return env.ANTHROPIC_API_KEY ? createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }) : null;
}

/** Señales en orden estable: S1, S2... coinciden entre el texto y la pantalla. */
export async function labeledSignals(sessionId: string) {
  return labelSignals(await prisma.riskSignal.findMany({ where: { sessionId } }));
}

export async function generateSessionSummary(sessionId: string, options: { provider?: AIProvider | null; now?: Date } = {}) {
  const provider = options.provider === undefined ? getAIProvider() : options.provider;
  const now = options.now ?? new Date();
  const session = await prisma.proctoringSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError("La sesión no existe.");
  const signals = await labeledSignals(sessionId);
  const forModel: SummarySignal[] = signals.map((signal) => ({
    label: signal.label,
    severity: signal.severity,
    category: signal.category,
    explanation: signal.explanation,
  }));
  const fallback = templateSummary(forModel);

  let text = fallback;
  let source = "template";
  const run = { agent: "risk-summary", sessionId, latencyMs: 0 } as const;

  if (signals.length === 0 || !provider) {
    await prisma.agentRun.create({
      data: { ...run, status: "SKIPPED", provider: "template", output: { reason: signals.length === 0 ? "sin señales" : "sin proveedor de IA" } },
    });
  } else {
    const durationMinutes = Math.max(1, Math.round(((session.endedAt ?? now).getTime() - session.startedAt.getTime()) / 60_000));
    try {
      // Al modelo solo van señales y conteos: ni nombres, ni correos, ni identificadores.
      const result = await provider.generate({
        system: SUMMARY_SYSTEM,
        prompt: buildSummaryPrompt({ durationMinutes, cameraEnabled: session.cameraEnabled, microphoneEnabled: session.microphoneEnabled }, forModel),
      });
      const check = validateSummary(result.text, forModel.map((signal) => signal.label));
      const accepted = !result.refused && check.ok;
      if (accepted) {
        text = result.text;
        source = `${result.provider}:${result.model}`;
      }
      await prisma.agentRun.create({
        data: {
          ...run,
          status: "SUCCESS",
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          output: { accepted, refused: Boolean(result.refused), reasons: check.reasons },
        },
      });
    } catch (error) {
      await prisma.agentRun.create({
        data: { ...run, status: "ERROR", provider: provider.name, error: provider.name === "anthropic" ? describeAnthropicError(error) : String(error) },
      });
    }
  }

  await prisma.proctoringSession.update({ where: { id: sessionId }, data: { riskSummary: text, riskSummaryProvider: source, riskSummaryAt: now } });
  return { text, source, signals };
}

/** Para el docente: el resumen guardado, o uno nuevo si no hay (o si pide rehacerlo). */
export async function getAttemptSummary(actor: CurrentUser, examId: string, attemptId: string, { regenerate = false } = {}) {
  await findManageableExam(actor, examId);
  const session = await prisma.proctoringSession.findFirst({ where: { attemptId, attempt: { examId } } });
  if (!session) throw new NotFoundError("El intento no tiene sesión de supervisión.");
  if (session.riskSummary && !regenerate) {
    return { text: session.riskSummary, source: session.riskSummaryProvider ?? "template", signals: await labeledSignals(session.id) };
  }
  return generateSessionSummary(session.id);
}
