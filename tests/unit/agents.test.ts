import { describe, expect, it } from "vitest";
import { DOMAIN_AGENTS } from "@/modules/agents/domain-agents";
import { analyzeEvents } from "@/modules/agents/pipeline";
import { assessRisk } from "@/modules/agents/risk";
import { formatDuration } from "@/modules/agents/rules";
import { DEFAULT_THRESHOLDS, readThresholds } from "@/modules/agents/thresholds";
import type { AgentContext, AnalyzedEvent, RiskSignalDraft } from "@/modules/agents/types";
import { EVENT_CATALOG, type EventType } from "@/modules/proctoring/catalog";

// 13:00 UTC = 08:00 en Bogotá.
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 13, 0) + minutes * 60_000);
let counter = 0;
function event(type: EventType, minute: number, extra: Partial<AnalyzedEvent> = {}): AnalyzedEvent {
  return {
    id: `e${++counter}`,
    type,
    category: EVENT_CATALOG[type].category,
    severity: EVENT_CATALOG[type].severity,
    occurredAt: at(minute),
    durationSec: null,
    confidence: null,
    source: "BROWSER",
    ...extra,
  };
}
function context(events: AnalyzedEvent[], thresholds = DEFAULT_THRESHOLDS): AgentContext {
  return {
    session: { id: "s1", startedAt: at(0), endedAt: null, cameraEnabled: true, microphoneEnabled: true },
    events,
    thresholds,
    now: at(120),
    timeZone: "America/Bogota",
  };
}
const signal = (events: AnalyzedEvent[], thresholds = DEFAULT_THRESHOLDS) => analyzeEvents(context(events, thresholds)).signals;

// Palabras que una explicación jamás debe contener: intención, culpa, emociones.
const FORBIDDEN = /trampa|copi[óo]|intent[óo]|deshonest|fraude|cheat|culpa|sospech|nervios|ansios|enga[ñn]/i;

describe("agentes de dominio", () => {
  it("cada agente resume solo su categoría, con conteos, duraciones y confianza", () => {
    const events = [
      event("TAB_SWITCH", 1, { durationSec: 10 }),
      event("WINDOW_BLUR", 2, { durationSec: 4 }),
      event("LOW_ACTIVITY", 3, { durationSec: 120 }),
      event("MULTIPLE_FACES", 4, { confidence: 0.7 }),
      event("MULTIPLE_FACES", 5, { confidence: 0.9, source: "SIMULATION" }),
    ];
    const byAgent = Object.fromEntries(DOMAIN_AGENTS.map((agent) => [agent.name, agent.analyze(context(events)).findings]));
    expect(byAgent.focus).toEqual([expect.objectContaining({ kind: "FOCUS_CHANGES", count: 2, totalSeconds: 14, maxSeconds: 10 })]);
    expect(byAgent.activity).toEqual([expect.objectContaining({ kind: "LOW_ACTIVITY", count: 1, totalSeconds: 120 })]);
    expect(byAgent.vision?.[0]).toMatchObject({ kind: "MULTIPLE_FACES", count: 2, maxConfidence: 0.9, simulated: 1 });
    expect(byAgent.vision?.[0]?.averageConfidence).toBeCloseTo(0.8);
    expect(byAgent.audio).toEqual([]);
    expect(byAgent.connection).toEqual([]);
  });
});

describe("reglas", () => {
  it("inactividad: desde 300 s acumulados", () => {
    expect(signal([event("LOW_ACTIVITY", 5, { durationSec: 200 })])).toEqual([]);
    const [low] = signal([event("LOW_ACTIVITY", 5, { durationSec: 200 }), event("LOW_ACTIVITY", 30, { durationSec: 150 })]);
    expect(low).toMatchObject({ type: "LOW_ACTIVITY", severity: "LOW" });
    expect(low?.explanation).toBe("Se registraron 2 periodos sin actividad en la página, que suman 5 min 50 s, entre las 08:05 y las 08:30.");
  });

  it("foco: 3 cambios dentro de 10 minutos (ventana deslizante)", () => {
    // Separados: 0, 12 y 24 minutos → nunca 3 en 10 minutos.
    expect(signal([event("TAB_SWITCH", 0), event("TAB_SWITCH", 12), event("WINDOW_BLUR", 24)])).toEqual([]);
    const events = [event("TAB_SWITCH", 0), event("TAB_SWITCH", 20), event("WINDOW_BLUR", 23), event("TAB_SWITCH", 28), event("TAB_SWITCH", 45)];
    const [focus] = signal(events);
    expect(focus).toMatchObject({ type: "FOCUS_CHANGES", severity: "MEDIUM", eventIds: [events[1]!.id, events[2]!.id, events[3]!.id] });
    expect(focus?.explanation).toBe("Se registraron 3 salidas de la pestaña o pérdidas de foco de la ventana en menos de 10 minutos, entre las 08:20 y las 08:28.");
  });

  it("pantalla completa: desde 2 salidas", () => {
    expect(signal([event("FULLSCREEN_EXIT", 1)])).toEqual([]);
    expect(signal([event("FULLSCREEN_EXIT", 1), event("FULLSCREEN_EXIT", 9)])[0]?.explanation).toBe("Salió de pantalla completa 2 veces, entre las 08:01 y las 08:09.");
  });

  it("rostro no visible: desde 30 s acumulados", () => {
    expect(signal([event("FACE_NOT_VISIBLE", 1, { durationSec: 20, confidence: 0.9 })])).toEqual([]);
    const [face] = signal([event("FACE_NOT_VISIBLE", 1, { durationSec: 20, confidence: 0.9 }), event("FACE_NOT_VISIBLE", 2, { durationSec: 15, confidence: 0.7 })]);
    expect(face).toMatchObject({ type: "FACE_UNAVAILABLE", severity: "MEDIUM" });
    expect(face?.confidence).toBeCloseTo(0.8);
  });

  it("varios rostros: alta, solo con confianza de al menos 0,8", () => {
    expect(signal([event("MULTIPLE_FACES", 1, { confidence: 0.75 })])).toEqual([]);
    const [faces] = signal([event("MULTIPLE_FACES", 1, { confidence: 0.92 })]);
    expect(faces).toMatchObject({ type: "MULTIPLE_FACES", severity: "HIGH", confidence: 0.92 });
    expect(faces?.explanation).toBe("La cámara detectó más de un rostro 1 vez (confianza de hasta 92 %), a las 08:01.");
  });

  it("audio: desde 20 s acumulados", () => {
    expect(signal([event("AUDIO_ACTIVITY", 3, { durationSec: 25, confidence: 0.85 })])[0]).toMatchObject({ type: "AUDIO_ACTIVITY", severity: "LOW" });
  });

  it("conexión: una desconexión de más de 60 s", () => {
    expect(signal([event("CONNECTION_LOST", 3, { durationSec: 60 })])).toEqual([]);
    expect(signal([event("CONNECTION_LOST", 3, { durationSec: 20 }), event("CONNECTION_LOST", 9, { durationSec: 75 })])[0]?.explanation).toBe(
      "Se perdió la conexión 2 veces; la desconexión más larga duró 1 min 15 s, entre las 08:03 y las 08:09.",
    );
  });

  it("aclara cuando la señal sale solo de eventos simulados", () => {
    const [faces] = signal([event("MULTIPLE_FACES", 1, { confidence: 0.92, source: "SIMULATION" })]);
    expect(faces?.explanation).toMatch(/Eventos simulados \(modo demostración\)\.$/);
  });

  it("los umbrales de la institución cambian el resultado", () => {
    const stricter = readThresholds({ fullscreenExits: 1 });
    expect(signal([event("FULLSCREEN_EXIT", 1)], stricter)).toHaveLength(1);
    expect(readThresholds({ focusChanges: { count: 5 } }).focusChanges).toEqual({ count: 5, windowMinutes: 10 });
    expect(readThresholds({ fullscreenExits: -1 })).toEqual(DEFAULT_THRESHOLDS);
    expect(readThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
  });

  it("ninguna explicación afirma intenciones, culpa ni emociones", () => {
    const everything = [
      event("LOW_ACTIVITY", 1, { durationSec: 400 }),
      event("TAB_SWITCH", 2),
      event("TAB_SWITCH", 3),
      event("WINDOW_BLUR", 4),
      event("FULLSCREEN_EXIT", 5),
      event("FULLSCREEN_EXIT", 6),
      event("FACE_NOT_VISIBLE", 7, { durationSec: 40, confidence: 0.9 }),
      event("MULTIPLE_FACES", 8, { confidence: 0.95 }),
      event("AUDIO_ACTIVITY", 9, { durationSec: 30, confidence: 0.8 }),
      event("CONNECTION_LOST", 10, { durationSec: 90 }),
    ];
    const signals = signal(everything);
    expect(signals).toHaveLength(7);
    for (const draft of signals) expect(draft.explanation).not.toMatch(FORBIDDEN);
  });
});

describe("agente de riesgo", () => {
  const draft = (category: RiskSignalDraft["category"], severity: RiskSignalDraft["severity"], start: number, end = start): RiskSignalDraft => ({
    ruleId: `${category}-${start}`,
    type: category,
    category,
    severity,
    confidence: 1,
    explanation: "",
    eventIds: [],
    windowStart: at(start),
    windowEnd: at(end),
  });

  it("una señal alta recomienda revisar", () => {
    expect(assessRisk([draft("VISION", "HIGH", 1)], DEFAULT_THRESHOLDS)).toMatchObject({ recommended: true, reason: "highSignal" });
  });

  it("dos señales de categorías distintas a menos de 15 minutos también", () => {
    expect(assessRisk([draft("FOCUS", "MEDIUM", 0, 5), draft("CONNECTION", "LOW", 18)], DEFAULT_THRESHOLDS)).toMatchObject({
      recommended: true,
      reason: "combinedSignals",
    });
  });

  it("no recomienda con una sola señal media, ni con dos de la misma categoría o muy separadas", () => {
    expect(assessRisk([draft("FOCUS", "MEDIUM", 0)], DEFAULT_THRESHOLDS).recommended).toBe(false);
    expect(assessRisk([draft("FOCUS", "MEDIUM", 0), draft("FOCUS", "MEDIUM", 2)], DEFAULT_THRESHOLDS).recommended).toBe(false);
    expect(assessRisk([draft("FOCUS", "MEDIUM", 0, 5), draft("AUDIO", "LOW", 30)], DEFAULT_THRESHOLDS).recommended).toBe(false);
  });

  it("el análisis completo marca revisión recomendada con foco y conexión juntos", () => {
    const result = analyzeEvents(
      context([event("TAB_SWITCH", 10), event("TAB_SWITCH", 12), event("WINDOW_BLUR", 14), event("CONNECTION_LOST", 20, { durationSec: 90 })]),
    );
    expect(result.signals.map((s) => s.type).sort()).toEqual(["CONNECTION_GAPS", "FOCUS_CHANGES"]);
    expect(result.risk).toMatchObject({ recommended: true, reason: "combinedSignals" });
    expect(result.timings.map((timing) => timing.agent)).toEqual(["activity", "focus", "vision", "audio", "connection"]);
  });
});

describe("duraciones", () => {
  it("se leen en segundos y minutos", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(120)).toBe("2 min");
    expect(formatDuration(130)).toBe("2 min 10 s");
  });
});
