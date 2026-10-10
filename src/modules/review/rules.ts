import { z } from "zod";
import type { EventCategory, EventSource, Severity } from "@/modules/proctoring/catalog";

// Reglas puras de la revisión humana: filtros que llegan por la URL y validación de la
// decisión. Sin base de datos, para usarlas en el servidor, en el formulario y en pruebas.

export const REVIEW_OUTCOMES = ["NO_IRREGULARITY", "NEEDS_INVESTIGATION"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

const CATEGORIES = ["EXAM", "ACTIVITY", "FOCUS", "VISION", "AUDIO", "CONNECTION"] as const satisfies readonly EventCategory[];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const satisfies readonly Severity[];
const SOURCES = ["BROWSER", "SIMULATION", "SERVER"] as const satisfies readonly EventSource[];

// ---------- Cola ----------

export const QUEUE_FILTERS = ["RECOMMENDED", "REVIEWED", "ALL"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

/** Filtro de la cola desde la URL; por defecto, lo que está por revisar. */
export function parseQueueFilter(value: unknown): QueueFilter {
  return QUEUE_FILTERS.includes(value as QueueFilter) ? (value as QueueFilter) : "RECOMMENDED";
}

/** La severidad más alta entre las señales de una sesión, o null si no tiene. */
export function highestSeverity(severities: readonly Severity[]): Severity | null {
  return SEVERITIES.slice().reverse().find((severity) => severities.includes(severity)) ?? null;
}

// ---------- Línea de tiempo ----------

export interface TimelineFilters {
  category?: EventCategory;
  severity?: Severity;
  source?: EventSource;
}

/** Filtros de la línea de tiempo desde la URL; lo que no es válido se ignora. */
export function parseTimelineFilters(params: Record<string, string | string[] | undefined>): TimelineFilters {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
  return {
    category: pick(params.category, CATEGORIES),
    severity: pick(params.severity, SEVERITIES),
    source: pick(params.source, SOURCES),
  };
}

// ---------- Decisión ----------

export const NOTES_MAX = 2000;
export const NOTES_MIN_FOR_INVESTIGATION = 10;

export const reviewSchema = z
  .object({
    outcome: z.enum(REVIEW_OUTCOMES, { message: "outcome" }),
    notes: z.string().trim().max(NOTES_MAX, "notesTooLong").default(""),
  })
  // Pedir una investigación sin decir por qué no le sirve a nadie: las observaciones son obligatorias.
  .refine((value) => value.outcome !== "NEEDS_INVESTIGATION" || value.notes.length >= NOTES_MIN_FOR_INVESTIGATION, {
    path: ["notes"],
    message: "notesRequired",
  });

export type ReviewInput = z.input<typeof reviewSchema>;
