import { z } from "zod";
import type { RuleThresholds } from "./types";

// Umbrales de las reglas (docs/ANALISIS.md, sección 10). Cada institución puede
// ajustarlos en su política (Policy.ruleThresholds); lo que falte o sea inválido toma
// estos valores, que son conservadores a propósito: una señal solo recomienda revisar.

export const DEFAULT_THRESHOLDS: RuleThresholds = {
  lowActivitySeconds: 300,
  focusChanges: { count: 3, windowMinutes: 10 },
  fullscreenExits: 2,
  faceUnavailableSeconds: 30,
  multipleFacesConfidence: 0.8,
  audioActivitySeconds: 20,
  connectionGapSeconds: 60,
  combinationWindowMinutes: 15,
};

const positive = z.number().positive();
const thresholdsSchema = z
  .object({
    lowActivitySeconds: positive,
    focusChanges: z.object({ count: z.number().int().min(2), windowMinutes: positive }).partial(),
    fullscreenExits: z.number().int().min(1),
    faceUnavailableSeconds: positive,
    multipleFacesConfidence: z.number().min(0.5).max(1),
    audioActivitySeconds: positive,
    connectionGapSeconds: positive,
    combinationWindowMinutes: positive,
  })
  .partial();

/** Umbrales de la institución sobre los valores por defecto (campo por campo). */
export function readThresholds(value: unknown): RuleThresholds {
  const parsed = thresholdsSchema.safeParse(value ?? {});
  if (!parsed.success) return DEFAULT_THRESHOLDS;
  const custom = parsed.data;
  return {
    ...DEFAULT_THRESHOLDS,
    ...Object.fromEntries(Object.entries(custom).filter(([key]) => key !== "focusChanges")),
    focusChanges: { ...DEFAULT_THRESHOLDS.focusChanges, ...custom.focusChanges },
  } as RuleThresholds;
}
