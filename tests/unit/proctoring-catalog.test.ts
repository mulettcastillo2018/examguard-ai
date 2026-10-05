import { describe, expect, it } from "vitest";
import messages from "../../messages/es.json";
import { CLIENT_EVENT_TYPES, EVENT_CATALOG, EVENT_TYPES, eventBatchSchema, SIMULATED_EVENTS } from "@/modules/proctoring/catalog";
import { parseUserAgent } from "@/modules/proctoring/proctoring";

const event = (overrides: Record<string, unknown> = {}) => ({
  clientEventId: "evt-00000001",
  type: "TAB_SWITCH",
  occurredAt: "2026-10-06T13:00:00.000Z",
  durationSec: 12,
  ...overrides,
});
const batch = (events: unknown[]) => ({ clientId: "pestana", sentAt: "2026-10-06T13:00:05.000Z", events });

describe("catálogo de eventos", () => {
  it("cada tipo tiene descripción en la interfaz", () => {
    const types = (messages as { proctoring: { types: Record<string, string> } }).proctoring.types;
    for (const type of EVENT_TYPES) expect(typeof types[type], type).toBe("string");
  });

  it("el navegador no puede inventar eventos del servidor", () => {
    expect(CLIENT_EVENT_TYPES).not.toContain("EXAM_STARTED");
    expect(eventBatchSchema.safeParse(batch([event({ type: "EXAM_SUBMITTED" })])).success).toBe(false);
    expect(eventBatchSchema.safeParse(batch([event({ type: "INVENTADO" })])).success).toBe(false);
  });

  it("acepta un lote válido y rechaza lotes grandes o metadatos con contenido", () => {
    expect(eventBatchSchema.safeParse(batch([event()])).success).toBe(true);
    expect(eventBatchSchema.safeParse(batch(Array.from({ length: 51 }, (_, i) => event({ clientEventId: `evt-${i}-xxxxxx` })))).success).toBe(false);
    expect(eventBatchSchema.safeParse(batch([event({ metadata: { texto: "x".repeat(121) } })])).success).toBe(false);
    expect(eventBatchSchema.safeParse(batch([event({ metadata: { anidado: { a: 1 } } })])).success).toBe(false);
    expect(eventBatchSchema.safeParse(batch([event({ confidence: 1.5 })])).success).toBe(false);
  });

  it("el simulador solo usa eventos del navegador, con cámara y micrófono marcados", () => {
    for (const simulated of SIMULATED_EVENTS) expect(CLIENT_EVENT_TYPES).toContain(simulated.type);
    expect(EVENT_CATALOG.MULTIPLE_FACES).toMatchObject({ category: "VISION", severity: "HIGH", requires: "camera" });
    expect(EVENT_CATALOG.AUDIO_ACTIVITY).toMatchObject({ requires: "microphone" });
  });
});

describe("equipo a partir del user agent", () => {
  it("reconoce navegador, sistema y tipo de equipo", () => {
    expect(
      parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0"),
    ).toEqual({ browser: "Edge", os: "Windows", device: "desktop" });
    expect(
      parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    ).toEqual({ browser: "Safari", os: "iOS", device: "mobile" });
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toEqual({
      browser: "Firefox",
      os: "Linux",
      device: "desktop",
    });
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null, device: null });
  });
});
