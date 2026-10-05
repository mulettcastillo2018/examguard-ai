import type { ClientEvent, EventType } from "@/modules/proctoring/catalog";

// Detectores del navegador. Solo observan hechos con su hora (sin contenido): cambios de
// pestaña o ventana, salidas de pantalla completa, inactividad, texto pegado (solo su
// largo) y pérdidas de conexión. Reciben el documento y la ventana como parámetros para
// poder probarlos sin navegador.

export type Emit = (event: ClientEvent) => void;
type Stop = () => void;

interface DocumentLike extends EventTarget {
  visibilityState: string;
  fullscreenElement?: unknown;
}

export interface DetectorEnv {
  doc: DocumentLike;
  win: EventTarget;
  now?: () => number;
  newId?: () => string;
}

function makeEvent(env: DetectorEnv, type: EventType, startedAt: number, extra: Partial<ClientEvent> = {}): ClientEvent {
  return {
    clientEventId: env.newId?.() ?? crypto.randomUUID(),
    type,
    occurredAt: new Date(startedAt).toISOString(),
    metadata: {},
    ...extra,
  };
}

const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000));

/** Salir de la pestaña (TAB_SWITCH) o que la ventana pierda el foco (WINDOW_BLUR), con su duración. */
export function startFocusDetector(env: DetectorEnv, emit: Emit, { minBlurMs = 1500 } = {}): Stop {
  const now = env.now ?? Date.now;
  let hiddenSince: number | null = null;
  let blurSince: number | null = null;

  const onVisibility = () => {
    if (env.doc.visibilityState === "hidden") {
      hiddenSince = now();
      blurSince = null; // La pestaña oculta ya lo explica: no se cuenta dos veces.
    } else if (hiddenSince !== null) {
      emit(makeEvent(env, "TAB_SWITCH", hiddenSince, { durationSec: seconds(now() - hiddenSince) }));
      hiddenSince = null;
    }
  };
  const onBlur = () => {
    if (env.doc.visibilityState !== "hidden" && hiddenSince === null) blurSince = now();
  };
  const onFocus = () => {
    if (blurSince !== null && hiddenSince === null && now() - blurSince >= minBlurMs) {
      emit(makeEvent(env, "WINDOW_BLUR", blurSince, { durationSec: seconds(now() - blurSince) }));
    }
    blurSince = null;
  };
  env.doc.addEventListener("visibilitychange", onVisibility);
  env.win.addEventListener("blur", onBlur);
  env.win.addEventListener("focus", onFocus);
  return () => {
    env.doc.removeEventListener("visibilitychange", onVisibility);
    env.win.removeEventListener("blur", onBlur);
    env.win.removeEventListener("focus", onFocus);
  };
}

/** Sin mouse, teclado, desplazamiento ni toques durante al menos `idleMs` (con la página visible). */
export function startActivityDetector(env: DetectorEnv, emit: Emit, { idleMs = 60_000, checkMs = 5_000 } = {}): Stop {
  const now = env.now ?? Date.now;
  let lastActivity = now();
  let idleSince: number | null = null;

  const onActivity = () => {
    if (idleSince !== null) {
      emit(makeEvent(env, "LOW_ACTIVITY", idleSince, { durationSec: seconds(now() - idleSince) }));
      idleSince = null;
    }
    lastActivity = now();
  };
  const onVisibility = () => {
    // Con la pestaña oculta manda el detector de foco; al volver, el contador empieza de cero.
    idleSince = null;
    lastActivity = now();
  };
  const timer = setInterval(() => {
    if (env.doc.visibilityState === "hidden") return;
    if (idleSince === null && now() - lastActivity >= idleMs) idleSince = lastActivity;
  }, checkMs);

  const kinds = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"];
  for (const kind of kinds) env.win.addEventListener(kind, onActivity, { passive: true } as AddEventListenerOptions);
  env.doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    for (const kind of kinds) env.win.removeEventListener(kind, onActivity);
    env.doc.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Salidas de pantalla completa (solo cuenta si el estudiante había entrado). */
export function startFullscreenDetector(env: DetectorEnv, emit: Emit): Stop {
  const now = env.now ?? Date.now;
  let inside = Boolean(env.doc.fullscreenElement);
  const onChange = () => {
    const isInside = Boolean(env.doc.fullscreenElement);
    if (inside && !isInside) emit(makeEvent(env, "FULLSCREEN_EXIT", now()));
    inside = isInside;
  };
  env.doc.addEventListener("fullscreenchange", onChange);
  return () => env.doc.removeEventListener("fullscreenchange", onChange);
}

/** Tiempo sin conexión (el evento se envía al volver, con la duración). */
export function startConnectionDetector(env: DetectorEnv, emit: Emit): Stop {
  const now = env.now ?? Date.now;
  let offlineSince: number | null = null;
  const onOffline = () => {
    offlineSince ??= now();
  };
  const onOnline = () => {
    if (offlineSince !== null) {
      emit(makeEvent(env, "CONNECTION_LOST", offlineSince, { durationSec: seconds(now() - offlineSince) }));
      offlineSince = null;
    }
  };
  env.win.addEventListener("offline", onOffline);
  env.win.addEventListener("online", onOnline);
  return () => {
    env.win.removeEventListener("offline", onOffline);
    env.win.removeEventListener("online", onOnline);
  };
}

/** Texto pegado: solo cuántos caracteres, nunca el texto. */
export function startPasteDetector(env: DetectorEnv, emit: Emit): Stop {
  const now = env.now ?? Date.now;
  const onPaste = (event: Event) => {
    const text = (event as ClipboardEvent).clipboardData?.getData("text") ?? "";
    emit(makeEvent(env, "PASTE", now(), { metadata: { length: text.length } }));
  };
  env.doc.addEventListener("paste", onPaste);
  return () => env.doc.removeEventListener("paste", onPaste);
}

/** Arranca todos los detectores de la sesión; devuelve una función para detenerlos. */
export function startDetectors(env: DetectorEnv, emit: Emit, options: { fullscreen: boolean }): Stop {
  const stops = [
    startFocusDetector(env, emit),
    startActivityDetector(env, emit),
    startConnectionDetector(env, emit),
    startPasteDetector(env, emit),
    ...(options.fullscreen ? [startFullscreenDetector(env, emit)] : []),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
