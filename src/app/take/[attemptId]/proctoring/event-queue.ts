import type { ClientEvent } from "@/modules/proctoring/catalog";

// Cola de eventos de supervisión: guarda una copia local, envía por lotes cada pocos
// segundos (o antes si se juntan muchos), reintenta sin conexión y se detiene cuando el
// servidor dice que la sesión terminó. Si no hay eventos, envía una señal de vida.

export class QueueHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export interface QueueTransport {
  send(events: ClientEvent[], options: { keepalive: boolean }): Promise<{ accepted: number }>;
}

export interface QueueStorage {
  load(): ClientEvent[];
  store(events: ClientEvent[]): void;
}

const MAX_BATCH = 50;

export function createEventQueue(options: {
  transport: QueueTransport;
  storage: QueueStorage;
  intervalMs?: number;
  /** Con tantos eventos pendientes, no espera al siguiente intervalo. */
  eagerAt?: number;
  onStopped?: () => void;
}) {
  const intervalMs = options.intervalMs ?? 5000;
  const eagerAt = options.eagerAt ?? 10;
  let pending = options.storage.load();
  let sending: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const persist = () => options.storage.store(pending);

  async function send(keepalive: boolean) {
    // Señal de vida aunque no haya eventos (el monitoreo del docente sabe que sigue conectado).
    do {
      const batch = pending.slice(0, MAX_BATCH);
      try {
        await options.transport.send(batch, { keepalive });
      } catch (error) {
        if (error instanceof QueueHttpError && error.status === 409) {
          stop();
          options.onStopped?.();
          return;
        }
        if (error instanceof QueueHttpError && error.status === 400) {
          // Un lote rechazado por formato no mejora reintentándolo.
          pending = pending.slice(batch.length);
          persist();
          continue;
        }
        return; // Sin red: queda para el siguiente intervalo.
      }
      const sent = new Set(batch.map((event) => event.clientEventId));
      pending = pending.filter((event) => !sent.has(event.clientEventId));
      persist();
    } while (pending.length > 0 && !stopped);
  }

  async function flush({ keepalive = false }: { keepalive?: boolean } = {}) {
    if (stopped) return;
    if (sending) return sending;
    sending = send(keepalive).finally(() => {
      sending = null;
    });
    return sending;
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    push(event: ClientEvent) {
      if (stopped) return;
      pending.push(event);
      persist();
      if (pending.length >= eagerAt) void flush();
    },
    flush,
    start() {
      if (timer || stopped) return;
      void flush();
      timer = setInterval(() => void flush(), intervalMs);
    },
    /** Detiene el envío periódico sin cerrar la cola (start() lo reanuda). */
    pause() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    /** Cierra la cola para siempre: la sesión terminó. */
    stop,
    size: () => pending.length,
  };
}

export type EventQueue = ReturnType<typeof createEventQueue>;
