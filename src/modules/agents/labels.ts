import type { Severity } from "@/modules/proctoring/catalog";

// Orden estable de las señales (severidad, hora, regla) y sus etiquetas S1, S2... Las
// mismas en el resumen con IA, el monitoreo y la revisión, para que el texto y la
// pantalla hablen de lo mismo.

const ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function labelSignals<T extends { severity: Severity; windowStart: Date; ruleId: string }>(signals: T[]): (T & { label: string })[] {
  return [...signals]
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.windowStart.getTime() - b.windowStart.getTime() || a.ruleId.localeCompare(b.ruleId))
    .map((signal, index) => ({ ...signal, label: `S${index + 1}` }));
}
