import { describe, expect, it } from "vitest";
import { createAnthropicProvider, describeAnthropicError } from "@/modules/ai/anthropic";
import { buildSummaryPrompt, SUMMARY_SYSTEM, templateSummary, validateSummary, type SummarySignal } from "@/modules/ai/guardrails";

const signals: SummarySignal[] = [
  { label: "S1", severity: "HIGH", category: "VISION", explanation: "La cámara detectó más de un rostro 1 vez (confianza de hasta 92 %), a las 08:01." },
  { label: "S2", severity: "MEDIUM", category: "FOCUS", explanation: "Se registraron 3 salidas de la pestaña en menos de 10 minutos, entre las 08:10 y las 08:14." },
];
const labels = signals.map((signal) => signal.label);

describe("barreras del resumen", () => {
  it("acepta un resumen factual que cita las señales", () => {
    const text = "Durante el intento 1 la cámara detectó más de un rostro [S1] y hubo 3 salidas de la pestaña en pocos minutos [S2]. Puede haber explicaciones que no están en los datos; la decisión es de quien revisa.";
    expect(validateSummary(text, labels)).toEqual({ ok: true, reasons: [] });
  });

  it("exige citar señales existentes", () => {
    expect(validateSummary("La sesión tuvo varias señales.", labels).reasons).toContain("no cita señales");
    expect(validateSummary("Hubo una señal [S7].", labels).reasons).toContain("cita señales que no existen: S7");
    expect(validateSummary("   ", labels).ok).toBe(false);
  });

  it("rechaza intenciones, culpa y emociones, también con tildes", () => {
    for (const text of [
      "El estudiante copió durante el examen [S1].",
      "Intentó ocultar a otra persona [S1].",
      "Es probable que hiciera trampa [S2].",
      "La conducta es sospechosa [S1].",
      "Se le notaba nervioso [S2].",
      "Mintió sobre su entorno [S1].",
    ]) {
      expect(validateSummary(text, labels).ok, text).toBe(false);
    }
  });

  it("no confunde palabras parecidas permitidas", () => {
    expect(validateSummary("En el intento 2 se registraron salidas de la pestaña [S2].", labels).ok).toBe(true);
    expect(validateSummary("Se mantiene la decisión de quien revisa [S1].", labels).ok).toBe(true);
  });
});

describe("plantilla y prompt", () => {
  it("la plantilla repite las señales sin redacción libre", () => {
    expect(templateSummary([])).toBe("No se generaron señales en esta sesión.");
    const text = templateSummary(signals);
    expect(text).toContain("La sesión tiene 2 señales para revisar.");
    expect(text).toContain("[S1] La cámara detectó");
    expect(validateSummary(text, labels).ok).toBe(true);
  });

  it("el prompt lleva solo señales y datos de la sesión", () => {
    const prompt = buildSummaryPrompt({ durationMinutes: 42, cameraEnabled: true, microphoneEnabled: false }, signals);
    expect(prompt).toContain("duró 42 minutos; cámara autorizada; micrófono no autorizado");
    expect(prompt).toContain("[S2] (severidad media, foco) Se registraron 3 salidas");
    expect(SUMMARY_SYSTEM).toContain("Nunca afirmes ni sugieras intenciones");
  });
});

describe("proveedor de Anthropic (sin red)", () => {
  function fakeFetch(status: number, body: unknown, seen: { url?: string; headers?: Headers; body?: Record<string, unknown> }) {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.url = String(input instanceof Request ? input.url : input);
      seen.headers = new Headers(init?.headers);
      seen.body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
    }) as typeof fetch;
  }

  it("pide Claude Opus 5.5 con esfuerzo bajo y respaldo ante rechazos, y lee el texto y el uso", async () => {
    const seen: { url?: string; headers?: Headers; body?: Record<string, unknown> } = {};
    const provider = createAnthropicProvider({
      apiKey: "clave-de-prueba",
      model: "claude-opus-5-5",
      fetch: fakeFetch(
        200,
        {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: "Resumen [S1]." }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 321, output_tokens: 45 },
        },
        seen,
      ),
    });
    const result = await provider.generate({ system: "sistema", prompt: "señales" });
    expect(seen.url).toMatch(/\/v1\/messages/);
    expect(seen.headers?.get("x-api-key")).toBe("clave-de-prueba");
    expect(seen.headers?.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(seen.body).toMatchObject({
      model: "claude-opus-5-5",
      system: "sistema",
      output_config: { effort: "low" },
      fallbacks: "default",
      messages: [{ role: "user", content: "señales" }],
    });
    expect(result).toMatchObject({ text: "Resumen [S1].", provider: "anthropic", model: "claude-opus-5-5", inputTokens: 321, outputTokens: 45, refused: false });
  });

  it("marca los rechazos y clasifica los errores de la API", async () => {
    const refused = createAnthropicProvider({
      apiKey: "k",
      model: "claude-opus-5-5",
      fetch: fakeFetch(
        200,
        {
          id: "msg_2",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [],
          stop_reason: "refusal",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
        {},
      ),
    });
    expect((await refused.generate({ system: "s", prompt: "p" })).refused).toBe(true);

    const unauthorized = createAnthropicProvider({
      apiKey: "k",
      model: "claude-opus-5-5",
      fetch: fakeFetch(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, {}),
    });
    const error = await unauthorized.generate({ system: "s", prompt: "p" }).catch((caught: unknown) => caught);
    expect(describeAnthropicError(error)).toBe("authentication");
  });
});
