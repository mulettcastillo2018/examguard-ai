import type { DomainFinding } from "./domain-agents";
import type { Finding, RiskSignalDraft, Rule, RuleThresholds } from "./types";

// Motor de reglas: convierte hallazgos en señales con los umbrales de la institución.
// Las explicaciones solo dicen hechos observables (cuántos, cuánto tiempo, entre qué
// horas). Nunca afirman intenciones: una señal solo recomienda que una persona revise.

/** "45 s", "2 min", "2 min 10 s". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

const percent = (value: number) => `${Math.round(value * 100)} %`;
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function find(findings: Finding[], kind: string) {
  return findings.find((finding) => finding.kind === kind) as DomainFinding | undefined;
}

/** Ventana de la señal: del primer al último evento que la sustentan. */
function windowOf(times: Date[]) {
  const values = times.map((time) => time.getTime());
  return { windowStart: new Date(Math.min(...values)), windowEnd: new Date(Math.max(...values)) };
}

function between(formatTime: (date: Date) => string, start: Date, end: Date) {
  const from = formatTime(start);
  const to = formatTime(end);
  return from === to ? `a las ${from}` : `entre las ${from} y las ${to}`;
}

/** Aclara cuando todo lo que sustenta la señal viene del simulador de la demostración. */
const simulatedNote = (finding: DomainFinding | undefined, used: number) =>
  finding && finding.simulated > 0 && finding.simulated >= used ? " Eventos simulados (modo demostración)." : "";

export const RULES: Rule[] = [
  {
    id: "low-activity",
    appliesTo: ["ACTIVITY"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "LOW_ACTIVITY");
      if (!finding || finding.totalSeconds < thresholds.lowActivitySeconds) return null;
      const window = windowOf(finding.times);
      return {
        ruleId: "low-activity",
        type: "LOW_ACTIVITY",
        category: "ACTIVITY",
        severity: "LOW",
        confidence: 1,
        explanation: `Se registraron ${finding.count} ${plural(finding.count, "periodo", "periodos")} sin actividad en la página, que suman ${formatDuration(finding.totalSeconds)}, ${between(formatTime, window.windowStart, window.windowEnd)}.${simulatedNote(finding, finding.count)}`,
        eventIds: finding.eventIds,
        ...window,
      };
    },
  },
  {
    id: "focus-changes",
    appliesTo: ["FOCUS"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "FOCUS_CHANGES");
      if (!finding) return null;
      // Ventana deslizante: la mayor cantidad de cambios dentro de N minutos.
      const span = thresholds.focusChanges.windowMinutes * 60_000;
      const order = finding.times.map((time, index) => ({ time: time.getTime(), id: finding.eventIds[index]! })).sort((a, b) => a.time - b.time);
      let best: typeof order = [];
      for (let start = 0; start < order.length; start++) {
        const inWindow = order.filter((item) => item.time >= order[start]!.time && item.time - order[start]!.time <= span);
        if (inWindow.length > best.length) best = inWindow;
      }
      if (best.length < thresholds.focusChanges.count) return null;
      const windowStart = new Date(best[0]!.time);
      const windowEnd = new Date(best.at(-1)!.time);
      return {
        ruleId: "focus-changes",
        type: "FOCUS_CHANGES",
        category: "FOCUS",
        severity: "MEDIUM",
        confidence: 1,
        explanation: `Se registraron ${best.length} salidas de la pestaña o pérdidas de foco de la ventana en menos de ${thresholds.focusChanges.windowMinutes} minutos, ${between(formatTime, windowStart, windowEnd)}.${simulatedNote(finding, best.length)}`,
        eventIds: best.map((item) => item.id),
        windowStart,
        windowEnd,
      };
    },
  },
  {
    id: "fullscreen-exits",
    appliesTo: ["FOCUS"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "FULLSCREEN_EXITS");
      if (!finding || finding.count < thresholds.fullscreenExits) return null;
      const window = windowOf(finding.times);
      return {
        ruleId: "fullscreen-exits",
        type: "FULLSCREEN_EXITS",
        category: "FOCUS",
        severity: "MEDIUM",
        confidence: 1,
        explanation: `Salió de pantalla completa ${finding.count} veces, ${between(formatTime, window.windowStart, window.windowEnd)}.${simulatedNote(finding, finding.count)}`,
        eventIds: finding.eventIds,
        ...window,
      };
    },
  },
  {
    id: "face-unavailable",
    appliesTo: ["VISION"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "FACE_NOT_VISIBLE");
      if (!finding || finding.totalSeconds < thresholds.faceUnavailableSeconds) return null;
      const window = windowOf(finding.times);
      return {
        ruleId: "face-unavailable",
        type: "FACE_UNAVAILABLE",
        category: "VISION",
        severity: "MEDIUM",
        confidence: finding.averageConfidence ?? 1,
        explanation: `La cámara no detectó un rostro visible durante ${formatDuration(finding.totalSeconds)} en total (${finding.count} ${plural(finding.count, "periodo", "periodos")}), ${between(formatTime, window.windowStart, window.windowEnd)}.${simulatedNote(finding, finding.count)}`,
        eventIds: finding.eventIds,
        ...window,
      };
    },
  },
  {
    id: "multiple-faces",
    appliesTo: ["VISION"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "MULTIPLE_FACES");
      if (!finding || finding.maxConfidence === null || finding.maxConfidence < thresholds.multipleFacesConfidence) return null;
      const window = windowOf(finding.times);
      return {
        ruleId: "multiple-faces",
        type: "MULTIPLE_FACES",
        category: "VISION",
        severity: "HIGH",
        confidence: finding.maxConfidence,
        explanation: `La cámara detectó más de un rostro ${finding.count} ${plural(finding.count, "vez", "veces")} (confianza de hasta ${percent(finding.maxConfidence)}), ${between(formatTime, window.windowStart, window.windowEnd)}.${simulatedNote(finding, finding.count)}`,
        eventIds: finding.eventIds,
        ...window,
      };
    },
  },
  {
    id: "audio-activity",
    appliesTo: ["AUDIO"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "AUDIO_ACTIVITY");
      if (!finding || finding.totalSeconds < thresholds.audioActivitySeconds) return null;
      const window = windowOf(finding.times);
      return {
        ruleId: "audio-activity",
        type: "AUDIO_ACTIVITY",
        category: "AUDIO",
        severity: "LOW",
        confidence: finding.averageConfidence ?? 1,
        explanation: `El micrófono registró sonido durante ${formatDuration(finding.totalSeconds)} en total, ${between(formatTime, window.windowStart, window.windowEnd)}.${simulatedNote(finding, finding.count)}`,
        eventIds: finding.eventIds,
        ...window,
      };
    },
  },
  {
    id: "connection-gaps",
    appliesTo: ["CONNECTION"],
    evaluate(findings, thresholds, formatTime) {
      const finding = find(findings, "CONNECTION_GAPS");
      if (!finding || finding.maxSeconds <= thresholds.connectionGapSeconds) return null;
      const window = windowOf(finding.times);
      return {
        ruleId: "connection-gaps",
        type: "CONNECTION_GAPS",
        category: "CONNECTION",
        severity: "LOW",
        confidence: 1,
        explanation: `Se perdió la conexión ${finding.count} ${plural(finding.count, "vez", "veces")}; la desconexión más larga duró ${formatDuration(finding.maxSeconds)}, ${between(formatTime, window.windowStart, window.windowEnd)}.${simulatedNote(finding, finding.count)}`,
        eventIds: finding.eventIds,
        ...window,
      };
    },
  },
];

/** Aplica todas las reglas a los hallazgos de todos los agentes. */
export function evaluateRules(findings: Finding[], thresholds: RuleThresholds, formatTime: (date: Date) => string): RiskSignalDraft[] {
  return RULES.map((rule) => rule.evaluate(findings, thresholds, formatTime)).filter((draft): draft is RiskSignalDraft => draft !== null);
}
