import type { FaceDetector } from "@mediapipe/tasks-vision";
import type { ClientEvent } from "@/modules/proctoring/catalog";
import { createAudioTracker } from "./audio";
import { createVisionTracker, type FaceBox } from "./vision";

// Cámara y micrófono en el navegador. La imagen y el sonido se procesan aquí y no salen
// del equipo: a los seguimientos solo llegan cuántos rostros hay y dónde, o el nivel de la
// señal. Los modelos se sirven desde el propio sitio (public/mediapipe y public/models).

export type MediaEvent = Omit<ClientEvent, "clientEventId">;
export type MediaErrorCode = "denied" | "notFound" | "busy" | "unsupported" | "model" | "disconnected";
export type DeviceKind = "camera" | "microphone";

export class MediaUnavailableError extends Error {
  constructor(readonly code: MediaErrorCode) {
    super(code);
  }
}

const constraints = (kind: DeviceKind): MediaStreamConstraints =>
  kind === "camera"
    ? { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 }, facingMode: "user" }, audio: false }
    : // Sin control automático de ganancia: si no, el navegador "sube" el silencio.
      { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false };

/**
 * Pide la cámara o el micrófono al navegador; los fallos llegan con un código legible. Si el
 * dispositivo se está liberando (otra pantalla lo acaba de soltar), se reintenta un par de
 * veces: el navegador lo informa como "no encontrado" u "ocupado" durante un instante.
 */
export async function requestStream(kind: DeviceKind, retryDelaysMs = [400, 1200]): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new MediaUnavailableError("unsupported");
  for (let attempt = 0; ; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints(kind));
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      const transient = name === "NotFoundError" || name === "NotReadableError" || name === "AbortError";
      if (transient && attempt < retryDelaysMs.length) {
        await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
        continue;
      }
      console.warn(`No se pudo usar ${kind === "camera" ? "la cámara" : "el micrófono"}:`, name, (error as Error | null)?.message);
      if (name === "NotAllowedError" || name === "SecurityError") throw new MediaUnavailableError("denied");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new MediaUnavailableError("notFound");
      if (name === "NotReadableError" || name === "AbortError") throw new MediaUnavailableError("busy");
      throw new MediaUnavailableError("unsupported");
    }
  }
}

const stopTracks = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

interface SharedStream {
  promise: Promise<MediaStream>;
  users: number;
  stopTimer?: ReturnType<typeof setTimeout>;
}
const shared = new Map<DeviceKind, SharedStream>();

export interface StreamLease {
  stream: Promise<MediaStream>;
  /** Devuelve el préstamo; el dispositivo se apaga cuando nadie lo usa. */
  release(): void;
}

/**
 * Un solo pedido por dispositivo, compartido por quien lo necesite (y por el doble montaje
 * de React en desarrollo): abrir la misma cámara dos veces a la vez y soltar una puede
 * dejarla inutilizable en algunos navegadores. Al quedar sin uso se apaga tras un instante,
 * por si se vuelve a pedir enseguida.
 */
export function acquireStream(kind: DeviceKind, releaseDelayMs = 300): StreamLease {
  let entry = shared.get(kind);
  if (entry?.stopTimer) {
    clearTimeout(entry.stopTimer);
    entry.stopTimer = undefined;
  }
  if (!entry) {
    const created: SharedStream = { promise: requestStream(kind), users: 0 };
    created.promise.catch(() => {
      if (shared.get(kind) === created) shared.delete(kind);
    });
    shared.set(kind, created);
    entry = created;
  }
  const current = entry;
  current.users += 1;
  let released = false;
  return {
    stream: current.promise,
    release() {
      if (released) return;
      released = true;
      current.users -= 1;
      if (current.users > 0) return;
      current.stopTimer = setTimeout(() => {
        if (shared.get(kind) === current) shared.delete(kind);
        current.promise.then(stopTracks).catch(() => undefined);
      }, releaseDelayMs);
    },
  };
}

/** Si el dispositivo se desconectó, el próximo pedido abre uno nuevo. */
export function forgetStream(kind: DeviceKind) {
  shared.delete(kind);
}

let detector: Promise<FaceDetector> | null = null;

/** El detector de rostros se carga una vez (unos 12 MB que el navegador guarda en caché). */
export function loadFaceDetector(): Promise<FaceDetector> {
  detector ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
  })().catch((error: unknown) => {
    detector = null;
    console.error("No se pudo cargar el detector de rostros", error);
    throw new MediaUnavailableError("model");
  });
  return detector;
}

export interface DeviceMonitor {
  stream: MediaStream;
  /** Cierra el episodio en curso y deja de medir (el préstamo del flujo se devuelve aparte). */
  stop(): void;
}


/** Cuenta rostros dos veces por segundo y registra episodios (sin rostro, varios, en el borde). */
export async function startCameraMonitor(
  stream: MediaStream,
  emit: (event: MediaEvent) => void,
  { onFaces, onEnded, intervalMs = 500 }: { onFaces?: (count: number) => void; onEnded?: () => void; intervalMs?: number } = {},
): Promise<DeviceMonitor> {
  const faceDetector = await loadFaceDetector();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);

  const tracker = createVisionTracker(emit);
  let lastTimestamp = 0;
  const timer = setInterval(() => {
    if (video.readyState < 2 || !video.videoWidth) return;
    // El modo de video exige marcas de tiempo crecientes.
    const timestamp = Math.max(performance.now(), lastTimestamp + 1);
    lastTimestamp = timestamp;
    let faces: FaceBox[];
    try {
      const { detections } = faceDetector.detectForVideo(video, timestamp);
      const width = video.videoWidth;
      const height = video.videoHeight;
      faces = detections.map((detection) => ({
        score: detection.categories[0]?.score ?? 0,
        x: (detection.boundingBox?.originX ?? 0) / width,
        y: (detection.boundingBox?.originY ?? 0) / height,
        width: (detection.boundingBox?.width ?? 0) / width,
        height: (detection.boundingBox?.height ?? 0) / height,
      }));
    } catch {
      return;
    }
    tracker.frame(Date.now(), faces);
    onFaces?.(faces.filter((face) => face.score >= 0.5).length);
  }, intervalMs);

  const track = stream.getVideoTracks()[0];
  let stopped = false;
  const cleanup = () => {
    stopped = true;
    clearInterval(timer);
    track?.removeEventListener("ended", handleEnded);
    video.srcObject = null;
  };
  // Desconectada (se desenchufó o el sistema la quitó): se cierra el episodio y quien la
  // pidió registra la desconexión.
  function handleEnded() {
    if (stopped) return;
    tracker.flush(Date.now());
    cleanup();
    onEnded?.();
  }
  track?.addEventListener("ended", handleEnded);

  return {
    stream,
    stop() {
      if (stopped) return;
      tracker.flush(Date.now());
      cleanup();
    },
  };
}

/** Mide el nivel del micrófono cuatro veces por segundo y registra los periodos con sonido. */
export function startMicrophoneMonitor(
  stream: MediaStream,
  emit: (event: MediaEvent) => void,
  { onLevel, onEnded, intervalMs = 250 }: { onLevel?: (level: number, active: boolean) => void; onEnded?: () => void; intervalMs?: number } = {},
): DeviceMonitor {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  const tracker = createAudioTracker(emit);

  // El navegador puede crear el audio en pausa hasta que la persona interactúe con la página.
  const resume = () => void context.resume().catch(() => undefined);
  resume();
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);

  const timer = setInterval(() => {
    if (context.state !== "running") return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (const value of buffer) sum += value * value;
    const level = Math.sqrt(sum / buffer.length);
    onLevel?.(level, tracker.sample(Date.now(), level));
  }, intervalMs);

  const track = stream.getAudioTracks()[0];
  let stopped = false;
  const cleanup = () => {
    stopped = true;
    clearInterval(timer);
    track?.removeEventListener("ended", handleEnded);
    window.removeEventListener("pointerdown", resume);
    window.removeEventListener("keydown", resume);
    void context.close().catch(() => undefined);
  };
  function handleEnded() {
    if (stopped) return;
    tracker.flush(Date.now());
    cleanup();
    onEnded?.();
  }
  track?.addEventListener("ended", handleEnded);

  return {
    stream,
    stop() {
      if (stopped) return;
      tracker.flush(Date.now());
      cleanup();
    },
  };
}
