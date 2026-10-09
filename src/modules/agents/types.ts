import type { EventCategory, Severity } from "@/modules/proctoring/catalog";

// Interfaces del pipeline de supervisión (docs/ANALISIS.md, sección 7):
// eventos → agentes de dominio (hallazgos) → reglas (señales) → agente de riesgo.

export interface AnalyzedEvent {
  id: string;
  type: string;
  category: EventCategory;
  severity: Severity;
  occurredAt: Date;
  durationSec: number | null;
  confidence: number | null;
  source: "BROWSER" | "SIMULATION" | "SERVER";
}

export interface AgentContext {
  session: { id: string; startedAt: Date; endedAt: Date | null; cameraEnabled: boolean; microphoneEnabled: boolean };
  /** Ordenados por hora. */
  events: AnalyzedEvent[];
  thresholds: RuleThresholds;
  now: Date;
  timeZone: string;
}

/** Resumen factual de un agente: qué pasó, cuánto y cuándo. Nunca interpreta. */
export interface Finding {
  kind: string;
  category: EventCategory;
  /** Conteo de eventos y suma de sus duraciones. */
  count: number;
  totalSeconds: number;
  /** El mayor valor puntual (por ejemplo, la desconexión más larga). */
  maxSeconds: number;
  eventIds: string[];
  /** Instantes de cada evento, para buscar ventanas de tiempo. */
  times: Date[];
  /** Confianza promedio (detectores estadísticos: cámara y audio). */
  averageConfidence: number | null;
  maxConfidence: number | null;
}

export interface AgentResult {
  agent: string;
  findings: Finding[];
}

export interface Agent {
  name: string;
  categories: EventCategory[];
  analyze(context: AgentContext): AgentResult;
}

export interface RiskSignalDraft {
  ruleId: string;
  type: string;
  category: EventCategory;
  severity: Severity;
  confidence: number;
  /** Hechos observables con cifras y horas; sin intenciones ni juicios. */
  explanation: string;
  eventIds: string[];
  windowStart: Date;
  windowEnd: Date;
}

export interface Rule {
  id: string;
  appliesTo: EventCategory[];
  evaluate(findings: Finding[], thresholds: RuleThresholds, formatTime: (date: Date) => string): RiskSignalDraft | null;
}

export interface RuleThresholds {
  lowActivitySeconds: number;
  focusChanges: { count: number; windowMinutes: number };
  fullscreenExits: number;
  faceUnavailableSeconds: number;
  multipleFacesConfidence: number;
  audioActivitySeconds: number;
  connectionGapSeconds: number;
  combinationWindowMinutes: number;
}
