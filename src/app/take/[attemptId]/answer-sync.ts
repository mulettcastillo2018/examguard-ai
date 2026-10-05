// Guardado automático de respuestas, sin React: cola por pregunta con espera corta,
// versiones que solo crecen, copia local para no perder nada sin conexión, reintentos y
// bloqueo cuando el servidor dice que el intento ya no acepta cambios.

export interface SavedAnswer {
  value: unknown;
  version: number;
}

export type SyncState = "saved" | "pending" | "saving" | "offline" | "retrying";
export type SyncBlock = "otherDevice" | "timeUp";

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super(`HTTP ${status}${code ? ` (${code})` : ""}`);
  }
}

export interface SyncTransport {
  save(examQuestionId: string, entry: SavedAnswer, options: { keepalive: boolean; clientId: string }): Promise<{ version: number; stale: boolean }>;
}

export interface SyncStorage {
  store(pending: Record<string, SavedAnswer>): void;
}

export interface AnswerSyncOptions {
  transport: SyncTransport;
  storage: SyncStorage;
  initialPending?: Map<string, SavedAnswer>;
  onState: (state: SyncState) => void;
  onBlocked: (reason: SyncBlock) => void;
  /** El servidor tenía una versión mayor: la respuesta se reenvía con una versión nueva. */
  onBumped?: (examQuestionId: string, entry: SavedAnswer) => void;
  isOnline?: () => boolean;
  retryMs?: number;
}

export function createAnswerSync(options: AnswerSyncOptions) {
  const pending = new Map(options.initialPending ?? []);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const retryMs = options.retryMs ?? 4000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;
  let ready = false;
  let clientId = "";
  let blocked = false;

  const persist = () => options.storage.store(Object.fromEntries(pending));
  const online = () => options.isOnline?.() ?? true;

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flush();
    }, retryMs);
  }

  async function run(keepalive: boolean) {
    options.onState("saving");
    // Recorre una foto de la cola: lo que se escriba mientras tanto queda para la siguiente vuelta.
    for (const [questionId, entry] of [...pending]) {
      let result: { version: number; stale: boolean };
      try {
        result = await options.transport.save(questionId, entry, { keepalive, clientId });
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 409) {
          blocked = true;
          options.onBlocked(error.code === "otherDevice" ? "otherDevice" : "timeUp");
          return;
        }
        if (error instanceof SyncHttpError && error.status === 400) {
          // Formato rechazado: reintentar no lo arregla.
          pending.delete(questionId);
          persist();
          continue;
        }
        options.onState(online() ? "retrying" : "offline");
        scheduleRetry();
        return;
      }
      const current = pending.get(questionId);
      if (!current) continue;
      if (result.stale && current.version <= result.version) {
        // Otro dispositivo guardó una versión mayor; lo último que escribió el estudiante aquí sigue mandando.
        const bumped = { value: current.value, version: result.version + 1 };
        pending.set(questionId, bumped);
        options.onBumped?.(questionId, bumped);
      } else if (current.version <= result.version) {
        pending.delete(questionId);
      }
      persist();
    }
  }

  /** Envía todo lo pendiente. Si ya hay un envío en curso, espera a que termine y vuelve a revisar. */
  async function flush({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> {
    if (!ready || blocked) return;
    if (flushing) {
      await flushing;
      if (pending.size && !retryTimer) return flush({ keepalive });
      return;
    }
    if (pending.size === 0) {
      options.onState("saved");
      return;
    }
    flushing = run(keepalive).finally(() => {
      flushing = null;
    });
    await flushing;
    if (blocked || retryTimer) return;
    if (pending.size) return flush({ keepalive });
    options.onState("saved");
  }

  return {
    /** Anota una respuesta y la envía tras una espera corta (se reinicia con cada cambio). */
    queue(questionId: string, entry: SavedAnswer, delayMs: number) {
      pending.set(questionId, entry);
      persist();
      options.onState("pending");
      const previous = timers.get(questionId);
      if (previous) clearTimeout(previous);
      timers.set(
        questionId,
        setTimeout(() => {
          timers.delete(questionId);
          void flush();
        }, delayMs),
      );
    },
    flush,
    hasPending: () => pending.size > 0,
    /** El servidor aceptó esta pestaña (su identificador): desde ahora se puede enviar. */
    setReady(acceptedClientId: string) {
      clientId = acceptedClientId;
      ready = true;
      void flush();
    },
    unblock() {
      blocked = false;
      void flush();
    },
    /** La conexión volvió: reintenta sin esperar. */
    wake() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void flush();
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      if (retryTimer) clearTimeout(retryTimer);
    },
  };
}

export type AnswerSync = ReturnType<typeof createAnswerSync>;
