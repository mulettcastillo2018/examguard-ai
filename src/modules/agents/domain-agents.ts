import type { EventCategory } from "@/modules/proctoring/catalog";
import type { Agent, AgentContext, AnalyzedEvent, Finding } from "./types";

// Agentes de dominio: cada uno resume, de forma determinista, los eventos de su categoría
// en hallazgos (conteos, duraciones, horas). No interpretan ni deciden nada.

export interface DomainFinding extends Finding {
  /** Cuántos de esos eventos vienen del simulador de la demostración. */
  simulated: number;
}

function summarize(kind: string, category: EventCategory, events: AnalyzedEvent[]): DomainFinding {
  const confidences = events.map((event) => event.confidence).filter((value): value is number => value !== null);
  const durations = events.map((event) => event.durationSec ?? 0);
  return {
    kind,
    category,
    count: events.length,
    totalSeconds: durations.reduce((sum, value) => sum + value, 0),
    maxSeconds: durations.length ? Math.max(...durations) : 0,
    eventIds: events.map((event) => event.id),
    times: events.map((event) => event.occurredAt),
    averageConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    maxConfidence: confidences.length ? Math.max(...confidences) : null,
    simulated: events.filter((event) => event.source === "SIMULATION").length,
  };
}

function agent(name: string, category: EventCategory, kinds: Record<string, string[]>): Agent {
  return {
    name,
    categories: [category],
    analyze(context: AgentContext) {
      const own = context.events.filter((event) => event.category === category);
      const findings = Object.entries(kinds)
        .map(([kind, types]) => summarize(kind, category, own.filter((event) => types.includes(event.type))))
        .filter((finding) => finding.count > 0);
      return { agent: name, findings };
    },
  };
}

export const DOMAIN_AGENTS: Agent[] = [
  agent("activity", "ACTIVITY", { LOW_ACTIVITY: ["LOW_ACTIVITY"], PASTE: ["PASTE"] }),
  agent("focus", "FOCUS", { FOCUS_CHANGES: ["TAB_SWITCH", "WINDOW_BLUR"], FULLSCREEN_EXITS: ["FULLSCREEN_EXIT"] }),
  agent("vision", "VISION", {
    FACE_NOT_VISIBLE: ["FACE_NOT_VISIBLE"],
    FACE_OUT_OF_FRAME: ["FACE_OUT_OF_FRAME"],
    MULTIPLE_FACES: ["MULTIPLE_FACES"],
    CAMERA_DISCONNECTED: ["CAMERA_DISCONNECTED"],
  }),
  agent("audio", "AUDIO", { AUDIO_ACTIVITY: ["AUDIO_ACTIVITY"], MICROPHONE_DISCONNECTED: ["MICROPHONE_DISCONNECTED"] }),
  agent("connection", "CONNECTION", { CONNECTION_GAPS: ["CONNECTION_LOST"] }),
];
