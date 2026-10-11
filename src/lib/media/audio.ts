import type { ClientEvent } from "@/modules/proctoring/catalog";

// Seguimiento del sonido, sin navegador: recibe el nivel de la señal del micrófono (RMS,
// de 0 a 1) unas cuatro veces por segundo y emite episodios de actividad con su duración.
// Nunca recibe el audio, ni lo graba, ni distingue voces: solo si hubo sonido y cuánto duró.

export interface AudioOptions {
  /** Al empezar se escucha el ruido del lugar para fijar el punto de partida. */
  calibrationMs: number;
  /** Hay actividad si el nivel supera el ruido de fondo multiplicado por este factor... */
  factor: number;
  /** ...y además este mínimo absoluto (un lugar muy silencioso no vuelve sensible al detector). */
  minLevel: number;
  /** Silencios más cortos que esto no cortan el episodio (pausas al hablar). */
  gapMs: number;
  /** Duración mínima del episodio para registrarlo. */
  minEpisodeMs: number;
  /** Los episodios largos se registran por tramos. */
  maxEpisodeMs: number;
}

export const DEFAULT_AUDIO_OPTIONS: AudioOptions = {
  calibrationMs: 3_000,
  factor: 3,
  minLevel: 0.02,
  gapMs: 1_500,
  minEpisodeMs: 2_000,
  maxEpisodeMs: 60_000,
};

export interface AudioTracker {
  /** Un nivel medido en el instante `at` (ms). Devuelve si cuenta como actividad. */
  sample(at: number, level: number): boolean;
  flush(at: number): void;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function createAudioTracker(
  emit: (event: Omit<ClientEvent, "clientEventId">) => void,
  overrides: Partial<AudioOptions> = {},
): AudioTracker {
  const options = { ...DEFAULT_AUDIO_OPTIONS, ...overrides };
  let startedAt: number | null = null;
  const calibration: number[] = [];
  let floor: number | null = null;
  // `quiet`: mediciones sin sonido desde la última con sonido; solo cuentan si el episodio sigue.
  let episode: { startedAt: number; lastActiveAt: number; samples: number; active: number; quiet: number } | null = null;

  function close(endAt: number) {
    if (!episode) return;
    const durationMs = endAt - episode.startedAt;
    if (durationMs >= options.minEpisodeMs) {
      emit({
        type: "AUDIO_ACTIVITY",
        occurredAt: new Date(episode.startedAt).toISOString(),
        durationSec: Math.round(durationMs / 1000),
        // Qué tan continuo fue: la fracción de mediciones del episodio con sonido.
        confidence: round2(episode.samples ? episode.active / episode.samples : 1),
        metadata: {},
      });
    }
    episode = null;
  }

  return {
    sample(at, level) {
      startedAt ??= at;
      if (floor === null) {
        calibration.push(level);
        if (at - startedAt < options.calibrationMs) return false;
        // La mediana resiste un golpe aislado durante la calibración.
        const sorted = [...calibration].sort((a, b) => a - b);
        floor = sorted[Math.floor(sorted.length / 2)] ?? 0;
      }
      const threshold = Math.max(options.minLevel, floor * options.factor);
      const active = level >= threshold;
      // Sin actividad, el ruido de fondo se sigue despacio (un ventilador que se enciende).
      if (!active) floor = floor * 0.98 + level * 0.02;

      if (episode && at - episode.lastActiveAt > options.gapMs) close(episode.lastActiveAt);
      if (active) {
        episode ??= { startedAt: at, lastActiveAt: at, samples: 0, active: 0, quiet: 0 };
        episode.lastActiveAt = at;
        episode.active += 1;
        episode.samples += episode.quiet + 1;
        episode.quiet = 0;
        if (at - episode.startedAt >= options.maxEpisodeMs) {
          close(at);
          episode = { startedAt: at, lastActiveAt: at, samples: 0, active: 0, quiet: 0 };
        }
      } else if (episode) {
        episode.quiet += 1;
      }
      return active;
    },
    flush() {
      if (episode) close(episode.lastActiveAt);
    },
  };
}
