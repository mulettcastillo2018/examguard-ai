// Fechas en la zona horaria de la institución. Por ahora es una sola (Colombia, sin
// horario de verano), pero la conversión usa Intl para servir con cualquier zona.
// La base guarda instantes UTC; los formularios trabajan con fecha y hora locales.

export const APP_TIME_ZONE = "America/Bogota";

/** Diferencia, en milisegundos, entre la hora local de la zona y UTC en ese instante. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * "2026-10-10T08:00" (valor de un <input type="datetime-local">) leído en la zona dada.
 * Devuelve null si el texto no es una fecha y hora válidas.
 */
export function zonedInputToDate(value: string, timeZone = APP_TIME_ZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const candidate = new Date(guess - offsetMs(new Date(guess), timeZone));
  // Rechaza fechas imposibles (31 de febrero) comprobando el viaje de ida y vuelta.
  return dateToZonedInput(candidate, timeZone) === value.trim() ? candidate : null;
}

/** Instante como "2026-10-10T08:00" en la zona dada, para precargar un datetime-local. */
export function dateToZonedInput(date: Date, timeZone = APP_TIME_ZONE): string {
  const local = new Date(date.getTime() + offsetMs(date, timeZone));
  return local.toISOString().slice(0, 16);
}
