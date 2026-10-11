import { describe, expect, it } from "vitest";
import { createAudioTracker } from "@/lib/media/audio";
import { createVisionTracker, type FaceBox } from "@/lib/media/vision";
import type { ClientEvent } from "@/modules/proctoring/catalog";

type Emitted = Omit<ClientEvent, "clientEventId">;
const T0 = Date.UTC(2026, 9, 10, 13, 0);

// Rostros de prueba: uno centrado, uno en el borde, y un segundo rostro.
const centered: FaceBox = { score: 0.95, x: 0.35, y: 0.3, width: 0.3, height: 0.4 };
const atEdge: FaceBox = { score: 0.9, x: -0.1, y: 0.3, width: 0.15, height: 0.3 };
const second = (score: number): FaceBox => ({ score, x: 0.7, y: 0.25, width: 0.2, height: 0.3 });

/** Alimenta el seguimiento a dos cuadros por segundo con lo que diga `faces(segundo)`. */
function runVision(seconds: number, faces: (second: number) => FaceBox[], overrides = {}) {
  const events: Emitted[] = [];
  const tracker = createVisionTracker((event) => events.push(event), overrides);
  for (let ms = 0; ms <= seconds * 1000; ms += 500) tracker.frame(T0 + ms, faces(ms / 1000));
  tracker.flush(T0 + seconds * 1000);
  return events;
}

describe("seguimiento de rostros", () => {
  it("un rostro centrado todo el tiempo no registra nada", () => {
    expect(runVision(120, () => [centered])).toEqual([]);
  });

  it("registra el periodo sin rostro con su inicio y duración", () => {
    const events = runVision(60, (s) => (s >= 10 && s < 30 ? [] : [centered]));
    expect(events).toEqual([
      { type: "FACE_NOT_VISIBLE", occurredAt: new Date(T0 + 10_000).toISOString(), durationSec: 20, confidence: 1, metadata: {} },
    ]);
  });

  it("ignora ausencias breves y parpadeos del detector", () => {
    // Tres segundos sin rostro (menos del mínimo) y cuadros sueltos sin detección.
    const events = runVision(60, (s) => (s >= 10 && s < 13 ? [] : s === 40 || s === 41.5 ? [] : [centered]));
    expect(events).toEqual([]);
  });

  it("un parpadeo dentro de una ausencia no la corta, pero baja su confianza", () => {
    const events = runVision(60, (s) => (s >= 10 && s < 30 && s !== 20 ? [] : [centered]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "FACE_NOT_VISIBLE", durationSec: 20 });
    expect(events[0]!.confidence).toBeLessThan(1);
    expect(events[0]!.confidence).toBeGreaterThan(0.9);
  });

  it("varios rostros: registra la confianza del segundo rostro y cuántos hubo", () => {
    const events = runVision(30, (s) => (s >= 5 && s < 9 ? [centered, second(s < 7 ? 0.7 : 0.88)] : [centered]));
    expect(events).toEqual([
      { type: "MULTIPLE_FACES", occurredAt: new Date(T0 + 5_000).toISOString(), durationSec: 4, confidence: 0.88, metadata: { maxFaces: 2 } },
    ]);
  });

  it("un segundo rostro con poca confianza no cuenta", () => {
    expect(runVision(30, (s) => (s >= 5 && s < 15 ? [centered, second(0.3)] : [centered]))).toEqual([]);
  });

  it("rostro en el borde del cuadro durante un rato", () => {
    const events = runVision(40, (s) => (s >= 10 && s < 20 ? [atEdge] : [centered]));
    expect(events).toEqual([
      { type: "FACE_OUT_OF_FRAME", occurredAt: new Date(T0 + 10_000).toISOString(), durationSec: 10, confidence: 1, metadata: {} },
    ]);
  });

  it("una ausencia larga se registra por tramos y la última se cierra al detener", () => {
    const events = runVision(150, (s) => (s >= 10 ? [] : [centered]));
    expect(events.map((event) => event.durationSec)).toEqual([60, 60, 20]);
    expect(events.every((event) => event.type === "FACE_NOT_VISIBLE")).toBe(true);
  });

  it("si nunca hubo rostro desde el inicio, también cuenta", () => {
    const events = runVision(12, () => []);
    expect(events).toEqual([expect.objectContaining({ type: "FACE_NOT_VISIBLE", occurredAt: new Date(T0).toISOString(), durationSec: 12 })]);
  });
});

/** Alimenta el seguimiento a cuatro mediciones por segundo con el nivel de `level(segundo)`. */
function runAudio(seconds: number, level: (second: number) => number, overrides = {}) {
  const events: Emitted[] = [];
  const tracker = createAudioTracker((event) => events.push(event), overrides);
  for (let ms = 0; ms <= seconds * 1000; ms += 250) tracker.sample(T0 + ms, level(ms / 1000));
  tracker.flush(T0 + seconds * 1000);
  return events;
}

describe("seguimiento del sonido", () => {
  const room = 0.01; // ruido de fondo

  it("el ruido de fondo constante no es actividad", () => {
    expect(runAudio(120, () => room)).toEqual([]);
  });

  it("registra un periodo con sonido y su duración", () => {
    const events = runAudio(60, (s) => (s >= 10 && s < 18 ? 0.2 : room));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "AUDIO_ACTIVITY", occurredAt: new Date(T0 + 10_000).toISOString(), durationSec: 8, confidence: 1 });
  });

  it("las pausas cortas no cortan el episodio; las largas sí", () => {
    // Habla con pausas de 1 s (un solo episodio) y, 10 s después, otro sonido.
    const speaking = (s: number) => s >= 10 && s < 20 && Math.floor(s) % 3 !== 2;
    const events = runAudio(60, (s) => (speaking(s) || (s >= 30 && s < 34) ? 0.15 : room));
    expect(events.map((event) => [event.occurredAt, event.durationSec])).toEqual([
      [new Date(T0 + 10_000).toISOString(), 10],
      [new Date(T0 + 30_000).toISOString(), 4],
    ]);
    expect(events[0]!.confidence).toBeLessThan(1);
  });

  it("un golpe aislado no se registra", () => {
    expect(runAudio(30, (s) => (s === 12 ? 0.6 : room))).toEqual([]);
  });

  it("se adapta a un lugar ruidoso: el umbral sube con el ruido de fondo", () => {
    // Ruido de 0,05 (no es actividad: el umbral queda en 0,15); una voz de 0,4 sí lo es.
    expect(runAudio(60, () => 0.05)).toEqual([]);
    expect(runAudio(60, (s) => (s >= 20 && s < 25 ? 0.4 : 0.05))).toHaveLength(1);
  });

  it("no mide mientras calibra", () => {
    expect(runAudio(10, (s) => (s < 2.5 ? 0.3 : room))).toEqual([]);
  });
});
