import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnswerSync, SyncHttpError, type SavedAnswer, type SyncState } from "@/app/take/[attemptId]/answer-sync";

// Servidor falso: guarda la mayor versión por pregunta, como el real.
function fakeServer() {
  const stored = new Map<string, SavedAnswer>();
  let failNext: Error | null = null;
  const calls: { id: string; entry: SavedAnswer }[] = [];
  return {
    stored,
    calls,
    failWith(error: Error) {
      failNext = error;
    },
    transport: {
      async save(id: string, entry: SavedAnswer) {
        calls.push({ id, entry });
        if (failNext) {
          const error = failNext;
          failNext = null;
          throw error;
        }
        const current = stored.get(id);
        if (current && current.version >= entry.version) return { version: current.version, stale: current.version > entry.version };
        stored.set(id, entry);
        return { version: entry.version, stale: false };
      },
    },
  };
}

function setup(server = fakeServer(), initialPending?: Map<string, SavedAnswer>) {
  const states: SyncState[] = [];
  const blocked: string[] = [];
  let local: Record<string, SavedAnswer> = {};
  const sync = createAnswerSync({
    transport: server.transport,
    storage: { store: (pending) => (local = pending) },
    initialPending,
    onState: (state) => states.push(state),
    onBlocked: (reason) => blocked.push(reason),
    retryMs: 1000,
  });
  return { sync, server, states, blocked, local: () => local };
}

describe("guardado automático", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("espera a que el estudiante deje de escribir y envía solo la última versión", async () => {
    const { sync, server, states } = setup();
    sync.setReady("pestana-1");
    sync.queue("q1", { value: { text: "B" }, version: 1 }, 1000);
    sync.queue("q1", { value: { text: "Bo" }, version: 2 }, 1000);
    sync.queue("q1", { value: { text: "Bogotá" }, version: 3 }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.calls).toHaveLength(1);
    expect(server.stored.get("q1")).toEqual({ value: { text: "Bogotá" }, version: 3 });
    expect(states.at(-1)).toBe("saved");
    expect(sync.hasPending()).toBe(false);
  });

  it("no envía nada hasta que el servidor acepta la pestaña", async () => {
    const { sync, server } = setup();
    sync.queue("q1", { value: { optionId: "a" }, version: 1 }, 0);
    await vi.advanceTimersByTimeAsync(10);
    expect(server.calls).toHaveLength(0);
    sync.setReady("pestana-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls).toHaveLength(1);
  });

  it("sin conexión guarda una copia local y reintenta", async () => {
    const { sync, server, states, local } = setup();
    sync.setReady("pestana-1");
    server.failWith(new TypeError("Failed to fetch"));
    sync.queue("q1", { value: { value: true }, version: 1 }, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toContain("retrying");
    expect(local()).toEqual({ q1: { value: { value: true }, version: 1 } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.stored.get("q1")?.version).toBe(1);
    expect(local()).toEqual({});
    expect(states.at(-1)).toBe("saved");
  });

  it("recupera lo que quedó pendiente de una visita anterior", async () => {
    const pending = new Map([["q2", { value: { text: "pendiente" }, version: 4 }]]);
    const { sync, server } = setup(fakeServer(), pending);
    sync.setReady("pestana-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(server.stored.get("q2")).toEqual({ value: { text: "pendiente" }, version: 4 });
  });

  it("si el servidor tiene una versión mayor, reenvía lo último con una versión nueva", async () => {
    const server = fakeServer();
    server.stored.set("q1", { value: { optionId: "viejo" }, version: 7 });
    const { sync } = setup(server);
    sync.setReady("pestana-1");
    sync.queue("q1", { value: { optionId: "nuevo" }, version: 2 }, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.stored.get("q1")).toEqual({ value: { optionId: "nuevo" }, version: 8 });
  });

  it("se bloquea si el examen se abrió en otro lado o se acabó el tiempo", async () => {
    const { sync, server, blocked } = setup();
    sync.setReady("pestana-1");
    server.failWith(new SyncHttpError(409, "otherDevice"));
    sync.queue("q1", { value: { text: "x" }, version: 1 }, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(blocked).toEqual(["otherDevice"]);
    // Bloqueado no envía; al retomar, sí.
    sync.queue("q1", { value: { text: "xy" }, version: 2 }, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(server.calls).toHaveLength(1);
    sync.unblock();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.stored.get("q1")?.version).toBe(2);

    server.failWith(new SyncHttpError(409, "timeUp"));
    sync.queue("q2", { value: { text: "z" }, version: 1 }, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(blocked).toEqual(["otherDevice", "timeUp"]);
  });

  it("descarta una respuesta con formato inválido en lugar de reintentarla para siempre", async () => {
    const { sync, server } = setup();
    sync.setReady("pestana-1");
    server.failWith(new SyncHttpError(400));
    sync.queue("q1", { value: "basura", version: 1 }, 0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.calls).toHaveLength(1);
    expect(sync.hasPending()).toBe(false);
  });

  it("entregar espera a que termine el guardado en curso", async () => {
    const { sync, server } = setup();
    sync.setReady("pestana-1");
    sync.queue("q1", { value: { text: "a" }, version: 1 }, 5000);
    sync.queue("q2", { value: { text: "b" }, version: 1 }, 5000);
    await sync.flush();
    expect(server.stored.size).toBe(2);
    expect(sync.hasPending()).toBe(false);
  });
});
