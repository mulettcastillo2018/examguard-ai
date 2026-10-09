// Barreras del resumen con IA (docs/ANALISIS.md, sección 10). El modelo solo recibe
// señales y conteos (nunca nombres ni datos personales), debe citar las señales que usa y
// su texto se rechaza si afirma intenciones, culpa o emociones. Si se rechaza, o el
// proveedor falla, se usa una plantilla factual con las mismas señales.

export interface SummarySignal {
  /** Etiqueta corta para el modelo y la pantalla: S1, S2... */
  label: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  category: string;
  explanation: string;
}

export interface SummarySession {
  durationMinutes: number;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

const SEVERITY = { LOW: "baja", MEDIUM: "media", HIGH: "alta" } as const;
const CATEGORY: Record<string, string> = {
  ACTIVITY: "actividad",
  FOCUS: "foco",
  VISION: "cámara",
  AUDIO: "audio",
  CONNECTION: "conexión",
  EXAM: "examen",
};

export const SUMMARY_SYSTEM = [
  "Redactas resúmenes para docentes que revisan sesiones de exámenes en línea supervisados.",
  "Recibes señales generadas por reglas automáticas a partir de eventos del navegador. Las señales no prueban nada: solo indican qué conviene mirar.",
  "Reglas obligatorias:",
  "- Describe solo hechos presentes en las señales: qué ocurrió, cuántas veces, cuánto tiempo y entre qué horas.",
  "- Cita cada señal que uses con su etiqueta entre corchetes, por ejemplo [S1].",
  "- Nunca afirmes ni sugieras intenciones, culpa, deshonestidad o trampa. Nunca hables de emociones, personalidad ni identidad.",
  "- Recuerda que la decisión es de la persona que revisa y que puede haber explicaciones que no están en los datos (conexión, equipo, entorno).",
  "- Escribe en español, en un solo párrafo de 2 a 4 oraciones, sin títulos ni viñetas.",
].join("\n");

export function buildSummaryPrompt(session: SummarySession, signals: SummarySignal[]): string {
  const lines = signals.map((signal) => `[${signal.label}] (severidad ${SEVERITY[signal.severity]}, ${CATEGORY[signal.category] ?? signal.category}) ${signal.explanation}`);
  return [
    `Datos de la sesión: duró ${minutesText(session.durationMinutes)}; cámara ${session.cameraEnabled ? "autorizada" : "no autorizada"}; micrófono ${session.microphoneEnabled ? "autorizado" : "no autorizado"}.`,
    "Señales:",
    ...lines,
    "",
    "Redacta el resumen para quien revisa.",
  ].join("\n");

  function minutesText(minutes: number) {
    return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  }
}

// Palabras que un resumen nunca puede contener: intención, culpa, juicios, emociones.
// Ojo: sin la bandera u, \b trata las letras con tilde como no-letras ("copió" no
// terminaría en \b); por eso el final de palabra se busca con (?![letra]).
const FORBIDDEN = [
  /tramp[ao]/i,
  /\bcopi[oóa]/i,
  /plagi/i,
  /fraud/i,
  /deshonest/i,
  // El verbo, no el sustantivo: "intento" es el intento de examen.
  /\bintent(?:ó|aba|aron|ando|ar)(?![a-záéíóúüñ])/i,
  /enga[ñn]/i,
  /sospech/i,
  /culpa/i,
  /cheat/i,
  /\b(?:ment(?:ir|ía|ira)|mint(?:ió|iendo))(?![a-záéíóúüñ])/i,
  /nervios/i,
  /ansios/i,
  /estresad/i,
  /asustad/i,
  /preocupad/i,
];

export interface GuardrailResult {
  ok: boolean;
  reasons: string[];
}

export function validateSummary(text: string, labels: string[]): GuardrailResult {
  const reasons: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) reasons.push("vacío");
  if (trimmed.length > 1500) reasons.push("demasiado largo");
  const cited = [...trimmed.matchAll(/\[S(\d+)\]/g)].map((match) => `S${match[1]}`);
  if (cited.length === 0) reasons.push("no cita señales");
  const unknown = cited.filter((label) => !labels.includes(label));
  if (unknown.length) reasons.push(`cita señales que no existen: ${[...new Set(unknown)].join(", ")}`);
  for (const pattern of FORBIDDEN) {
    const match = trimmed.match(pattern);
    if (match) reasons.push(`palabra no permitida: «${match[0]}»`);
  }
  if (/@/.test(trimmed)) reasons.push("contiene datos de contacto");
  return { ok: reasons.length === 0, reasons };
}

/** El resumen de respaldo: las mismas señales, sin redacción libre. */
export function templateSummary(signals: SummarySignal[]): string {
  if (signals.length === 0) return "No se generaron señales en esta sesión.";
  const count = signals.length === 1 ? "1 señal" : `${signals.length} señales`;
  const body = signals.map((signal) => `[${signal.label}] ${signal.explanation}`).join(" ");
  return `La sesión tiene ${count} para revisar. ${body} Ninguna señal, por sí sola, establece lo que ocurrió: la decisión es de quien revisa.`;
}
