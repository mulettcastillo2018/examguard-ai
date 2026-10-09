// Abstracción del proveedor de IA (sección 19 de la especificación): Claude o la plantilla
// factual. El resto del sistema no sabe cuál está en uso.

export interface AIInput {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface AIResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** El modelo declinó responder (stop_reason "refusal"): se usa la plantilla. */
  refused?: boolean;
}

export interface AIProvider {
  name: string;
  generate(input: AIInput): Promise<AIResult>;
}
