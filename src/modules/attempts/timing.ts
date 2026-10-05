// Tiempo del examen. Lo controla el servidor: el navegador solo muestra la cuenta atrás.

/** Margen para guardados que salieron a tiempo pero llegaron tarde por la red. */
export const SAVE_GRACE_MS = 15_000;

/** Hora límite: inicio + duración + minutos extra, sin pasar del cierre del examen. */
export function computeDeadline(startedAt: Date, durationMinutes: number, extraMinutes: number, endsAt: Date): Date {
  const byDuration = startedAt.getTime() + (durationMinutes + extraMinutes) * 60_000;
  return new Date(Math.min(byDuration, endsAt.getTime()));
}

/** ¿El intento ya no acepta cambios? (pasó la hora límite más el margen de red) */
export const isPastDeadline = (deadlineAt: Date, now: Date) => now.getTime() > deadlineAt.getTime() + SAVE_GRACE_MS;

/** ¿Está abierta la ventana para empezar un intento? */
export function isWindowOpen(exam: { startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  return Boolean(exam.startsAt && exam.endsAt && now >= exam.startsAt && now < exam.endsAt);
}

/** Versión del texto de consentimiento que acepta el estudiante (se guarda en cada intento). */
export const CONSENT_TEXT_VERSION = "2026-10-05";
