import { DOMAIN_AGENTS } from "./domain-agents";
import { assessRisk } from "./risk";
import { evaluateRules } from "./rules";
import type { AgentContext, AgentResult, Finding } from "./types";

// El análisis completo de una sesión, sin base de datos: agentes de dominio → reglas →
// agente de riesgo. El orquestador lo ejecuta y guarda el resultado; las pruebas lo
// ejercitan con eventos armados a mano.

export interface AgentTiming {
  agent: string;
  latencyMs: number;
  findings: number;
  error?: string;
}

export function analyzeEvents(context: AgentContext) {
  const timings: AgentTiming[] = [];
  const results: AgentResult[] = [];
  for (const agent of DOMAIN_AGENTS) {
    const started = performance.now();
    try {
      const result = agent.analyze(context);
      results.push(result);
      timings.push({ agent: agent.name, latencyMs: Math.round(performance.now() - started), findings: result.findings.length });
    } catch (error) {
      // Un agente que falla no detiene a los demás; queda registrado.
      timings.push({ agent: agent.name, latencyMs: Math.round(performance.now() - started), findings: 0, error: String(error) });
    }
  }
  const findings: Finding[] = results.flatMap((result) => result.findings);
  const formatTime = new Intl.DateTimeFormat("es-CO", { timeZone: context.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format;
  const started = performance.now();
  const signals = evaluateRules(findings, context.thresholds, formatTime);
  const rulesMs = Math.round(performance.now() - started);
  const risk = assessRisk(signals, context.thresholds);
  return { findings, signals, risk, timings, rulesMs };
}
