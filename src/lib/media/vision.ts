import type { ClientEvent } from "@/modules/proctoring/catalog";

// Seguimiento de rostros, sin navegador: recibe por cuadro cuántos rostros detectó el
// modelo y dónde (cajas normalizadas de 0 a 1) y emite episodios con su duración. Nunca
// recibe la imagen ni identifica a nadie: solo cuenta rostros y mira si están en el cuadro.

export interface FaceBox {
  /** Confianza del detector, de 0 a 1. */
  score: number;
  /** Esquina superior izquierda, ancho y alto, en fracciones del cuadro. */
  x: number;
  y: number;
  width: number;
  height: number;
}

type VisionState = "none" | "one" | "edge" | "many";

export interface VisionOptions {
  /** Un rostro cuenta si el detector lo ve con al menos esta confianza. */
  minScore: number;
  /** Tiempo que un estado debe sostenerse antes de cambiar (evita parpadeos del detector). */
  settleMs: number;
  /** Duración mínima de cada episodio para registrarlo. */
  noFaceMinMs: number;
  multipleMinMs: number;
  edgeMinMs: number;
  /** Un rostro con el centro a menos de esta fracción del borde está fuera del encuadre. */
  edgeMargin: number;
  /** Los episodios largos se registran por tramos, para que el monitoreo los vea en vivo. */
  maxEpisodeMs: number;
}

export const DEFAULT_VISION_OPTIONS: VisionOptions = {
  minScore: 0.5,
  settleMs: 1_000,
  noFaceMinMs: 5_000,
  multipleMinMs: 1_500,
  edgeMinMs: 5_000,
  edgeMargin: 0.1,
  maxEpisodeMs: 60_000,
};

interface Episode {
  state: VisionState;
  startedAt: number;
  lastAt: number;
  frames: number;
  /** Cuadros que confirman el estado (sin rostro, varios, en el borde). */
  matching: number;
  /** Para varios rostros: la confianza del segundo rostro más seguro y el máximo de rostros. */
  secondScore: number;
  maxFaces: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function classify(faces: FaceBox[], options: VisionOptions): { state: VisionState; secondScore: number; count: number } {
  const seen = faces.filter((face) => face.score >= options.minScore).sort((a, b) => b.score - a.score);
  if (seen.length === 0) return { state: "none", secondScore: 0, count: 0 };
  if (seen.length > 1) return { state: "many", secondScore: seen[1]!.score, count: seen.length };
  const face = seen[0]!;
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  const m = options.edgeMargin;
  const edge = cx < m || cx > 1 - m || cy < m || cy > 1 - m;
  return { state: edge ? "edge" : "one", secondScore: 0, count: 1 };
}

export interface VisionTracker {
  /** Un cuadro analizado en el instante `at` (ms). */
  frame(at: number, faces: FaceBox[]): void;
  /** Cierra el episodio en curso (al entregar o detener la cámara). */
  flush(at: number): void;
}

export function createVisionTracker(
  emit: (event: Omit<ClientEvent, "clientEventId">) => void,
  overrides: Partial<VisionOptions> = {},
): VisionTracker {
  const options = { ...DEFAULT_VISION_OPTIONS, ...overrides };
  let stable: Episode | null = null;
  // Un estado distinto que todavía no se sostiene lo bastante: sus cuadros se guardan aparte.
  let candidate: Episode | null = null;

  const minFor = (state: VisionState) =>
    state === "none" ? options.noFaceMinMs : state === "many" ? options.multipleMinMs : state === "edge" ? options.edgeMinMs : Infinity;

  function close(episode: Episode, endAt: number) {
    const durationMs = endAt - episode.startedAt;
    if (episode.state === "one" || durationMs < minFor(episode.state)) return;
    const base = {
      occurredAt: new Date(episode.startedAt).toISOString(),
      durationSec: Math.round(durationMs / 1000),
      // Qué tan sostenido fue: la fracción de cuadros del episodio que lo confirman.
      confidence: round2(episode.frames ? episode.matching / episode.frames : 1),
      metadata: {} as Record<string, number>,
    };
    if (episode.state === "none") emit({ ...base, type: "FACE_NOT_VISIBLE" });
    else if (episode.state === "edge") emit({ ...base, type: "FACE_OUT_OF_FRAME" });
    else emit({ ...base, type: "MULTIPLE_FACES", confidence: round2(episode.secondScore), metadata: { maxFaces: episode.maxFaces } });
  }

  const open = (state: VisionState, at: number): Episode => ({ state, startedAt: at, lastAt: at, frames: 0, matching: 0, secondScore: 0, maxFaces: 0 });
  const add = (episode: Episode, at: number, secondScore: number, count: number) => {
    episode.lastAt = at;
    episode.frames += 1;
    episode.matching += 1;
    if (episode.state === "many") {
      episode.secondScore = Math.max(episode.secondScore, secondScore);
      episode.maxFaces = Math.max(episode.maxFaces, count);
    }
  };
  // Un parpadeo que no se sostuvo: sus cuadros cuentan en el episodio, pero no lo confirman.
  const discardCandidate = () => {
    if (stable && candidate) stable.frames += candidate.frames;
    candidate = null;
  };

  return {
    frame(at, faces) {
      const { state, secondScore, count } = classify(faces, options);
      if (!stable) {
        // El primer estado se fija sin esperar: el episodio empieza con la cámara.
        stable = open(state, at);
        add(stable, at, secondScore, count);
        return;
      }
      if (state === stable.state) {
        discardCandidate();
        add(stable, at, secondScore, count);
      } else {
        if (candidate?.state !== state) {
          discardCandidate();
          candidate = open(state, at);
        }
        add(candidate!, at, secondScore, count);
        if (at - candidate!.startedAt >= options.settleMs) {
          // El episodio anterior terminó cuando empezó el estado nuevo.
          close(stable, candidate!.startedAt);
          stable = candidate!;
          candidate = null;
        }
      }
      if (stable.state !== "one" && at - stable.startedAt >= options.maxEpisodeMs) {
        close(stable, at);
        stable = open(stable.state, at);
      }
    },
    flush(at) {
      if (stable) close(stable, candidate ? candidate.startedAt : Math.max(at, stable.lastAt));
      stable = null;
      candidate = null;
    },
  };
}
