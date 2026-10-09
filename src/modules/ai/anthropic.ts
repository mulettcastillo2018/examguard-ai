import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AIInput, AIProvider, AIResult } from "./provider";

// Claude como redactor del resumen para quien revisa. Esfuerzo bajo: es un texto corto a
// partir de hechos ya establecidos por las reglas. Con el respaldo del servidor
// ("fallbacks: default"), si el modelo declina, la API reintenta con otro modelo; si aun
// así declina, quien llama usa la plantilla factual.

export function createAnthropicProvider({
  apiKey,
  model,
  timeoutMs = 20_000,
  fetch,
}: {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Solo para pruebas: reemplaza la red por una respuesta armada. */
  fetch?: typeof globalThis.fetch;
}): AIProvider {
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1, ...(fetch ? { fetch } : {}) });
  return {
    name: "anthropic",
    async generate({ system, prompt, maxTokens = 4_000 }: AIInput): Promise<AIResult> {
      const started = performance.now();
      const response = await client.beta.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      return {
        text,
        provider: "anthropic",
        model: response.model,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        refused: response.stop_reason === "refusal",
      };
    },
  };
}

/** Errores de la API que conviene contar distinto en AgentRun (sin cadenas mágicas). */
export function describeAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "authentication";
  if (error instanceof Anthropic.RateLimitError) return "rate_limit";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "connection";
  if (error instanceof Anthropic.APIError) return `api_${error.status ?? "unknown"}`;
  return error instanceof Error ? error.message.slice(0, 200) : "unknown";
}
