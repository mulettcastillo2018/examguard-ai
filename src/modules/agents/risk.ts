import type { RiskSignalDraft, RuleThresholds } from "./types";

// Agente de riesgo: combina señales. Una señal alta, o dos de categorías distintas cerca
// en el tiempo, recomiendan revisar la sesión. Nunca concluye nada sobre la persona: la
// decisión es siempre de quien revisa.

export type RiskReason = "highSignal" | "combinedSignals";

export interface RiskAssessment {
  recommended: boolean;
  reason: RiskReason | null;
  /** Reglas que llevaron a la recomendación. */
  ruleIds: string[];
}

export function assessRisk(signals: RiskSignalDraft[], thresholds: RuleThresholds): RiskAssessment {
  const high = signals.filter((signal) => signal.severity === "HIGH");
  if (high.length) return { recommended: true, reason: "highSignal", ruleIds: high.map((signal) => signal.ruleId) };

  // Dos señales de categorías distintas cuyas ventanas quedan a menos de N minutos.
  const gap = thresholds.combinationWindowMinutes * 60_000;
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const a = signals[i]!;
      const b = signals[j]!;
      if (a.category === b.category) continue;
      const distance = Math.max(0, Math.max(a.windowStart.getTime(), b.windowStart.getTime()) - Math.min(a.windowEnd.getTime(), b.windowEnd.getTime()));
      if (distance <= gap) return { recommended: true, reason: "combinedSignals", ruleIds: [a.ruleId, b.ruleId] };
    }
  }
  return { recommended: false, reason: null, ruleIds: [] };
}
