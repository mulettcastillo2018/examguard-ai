import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startActivityDetector,
  startConnectionDetector,
  startFocusDetector,
  startFullscreenDetector,
  startPasteDetector,
  type DetectorEnv,
} from "@/app/take/[attemptId]/proctoring/detectors";
import { createEventQueue, QueueHttpError } from "@/app/take/[attemptId]/proctoring/event-queue";
import type { ClientEvent } from "@/modules/proctoring/catalog";

// Documento y ventana falsos: EventTarget de Node con lo mínimo que usan los detectores.
class FakeDoc extends EventTarget {
  visibilityState = "visible";
  fullscreenElement: unknown = null;
}

function setup() {
  let clock = Date.UTC(2026, 9, 6, 13, 0, 0);
  let id = 0;
  const doc = new FakeDoc();
  const win = new EventTarget();
  const env: DetectorEnv = { doc, win, now: () => clock, newId: () => `evt-${++id}-xxxxxxxx` };
  const events: ClientEvent[] = [];
  return {
    doc,
    win,
    env,
    events,
    emit: (event: ClientEvent) => events.push(event),
    advance(ms: number) {
      clock += ms;
    },
    fire(target: EventTarget, type: string) {
      target.dispatchEvent(new Event(type));
    },
  };
}

describe("detector de foco", () => {
  it("cuenta la salida de la pestaña una sola vez, con su duración", () => {
    const t = setup();
    startFocusDetector(t.env, t.emit);
    t.fire(t.win, "blur");
    t.doc.visibilityState = "hidden";
    t.fire(t.doc, "visibilitychange");
    t.advance(15_000);
    t.doc.visibilityState = "visible";
    t.fire(t.doc, "visibilitychange");
    t.fire(t.win, "focus");
    expect(t.events.map((e) => [e.type, e.durationSec])).toEqual([["TAB_SWITCH", 15]]);
  });

  it("registra la pérdida de foco de la ventana, salvo las de menos de 1,5 s", () => {
    const t = setup();
    startFocusDetector(t.env, t.emit);
    t.fire(t.win, "blur");
    t.advance(800);
    t.fire(t.win, "focus");
    t.fire(t.win, "blur");
    t.advance(6_000);
    t.fire(t.win, "focus");
    expect(t.events.map((e) => [e.type, e.durationSec])).toEqual([["WINDOW_BLUR", 6]]);
  });
});

describe("detector de inactividad", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("informa el periodo sin actividad cuando el estudiante vuelve", () => {
    const t = setup();
    startActivityDetector(t.env, t.emit, { idleMs: 60_000, checkMs: 5_000 });
    t.advance(90_000);
    vi.advanceTimersByTime(5_000);
    expect(t.events).toHaveLength(0);
    t.fire(t.win, "keydown");
    expect(t.events.map((e) => [e.type, e.durationSec])).toEqual([["LOW_ACTIVITY", 90]]);
  });

  it("no cuenta inactividad con la pestaña oculta", () => {
    const t = setup();
    startActivityDetector(t.env, t.emit, { idleMs: 60_000, checkMs: 5_000 });
    t.doc.visibilityState = "hidden";
    t.fire(t.doc, "visibilitychange");
    t.advance(120_000);
    vi.advanceTimersByTime(5_000);
    t.doc.visibilityState = "visible";
    t.fire(t.doc, "visibilitychange");
    t.fire(t.win, "pointermove");
    expect(t.events).toHaveLength(0);
  });
});

describe("otros detectores", () => {
  it("pantalla completa: cuenta las salidas", () => {
    const t = setup();
    startFullscreenDetector(t.env, t.emit);
    t.doc.fullscreenElement = {};
    t.fire(t.doc, "fullscreenchange");
    t.doc.fullscreenElement = null;
    t.fire(t.doc, "fullscreenchange");
    expect(t.events.map((e) => e.type)).toEqual(["FULLSCREEN_EXIT"]);
  });

  it("conexión: informa cuánto duró sin red", () => {
    const t = setup();
    startConnectionDetector(t.env, t.emit);
    t.fire(t.win, "offline");
    t.advance(70_000);
    t.fire(t.win, "online");
    expect(t.events.map((e) => [e.type, e.durationSec])).toEqual([["CONNECTION_LOST", 70]]);
  });

  it("pegar: guarda el largo, nunca el texto", () => {
    const t = setup();
    startPasteDetector(t.env, t.emit);
    const paste = Object.assign(new Event("paste"), { clipboardData: { getData: () => "texto secreto" } });
    t.doc.dispatchEvent(paste);
    expect(t.events[0]).toMatchObject({ type: "PASTE", metadata: { length: 13 } });
    expect(JSON.stringify(t.events)).not.toContain("secreto");
  });

  it("al detenerse deja de escuchar", () => {
    const t = setup();
    const stop = startConnectionDetector(t.env, t.emit);
    stop();
    t.fire(t.win, "offline");
    t.fire(t.win, "online");
    expect(t.events).toHaveLength(0);
  });
});

describe("cola de eventos", () => {
  const event = (n: number): ClientEvent => ({ clientEventId: `evt-${n}-xxxxxxxx`, type: "TAB_SWITCH", occurredAt: new Date().toISOString(), metadata: {} });

  it("envía por lotes, reintenta sin red y conserva una copia local", async () => {
    const sent: number[] = [];
    let offline = true;
    let stored: ClientEvent[] = [];
    const queue = createEventQueue({
      transport: {
        async send(events) {
          if (offline) throw new TypeError("Failed to fetch");
          sent.push(events.length);
          return { accepted: events.length };
        },
      },
      storage: { load: () => [], store: (events) => (stored = events) },
    });
    queue.push(event(1));
    queue.push(event(2));
    await queue.flush();
    expect(stored).toHaveLength(2);
    offline = false;
    await queue.flush();
    expect(sent).toEqual([2]);
    expect(stored).toHaveLength(0);
  });

  it("sin eventos manda una señal de vida y se detiene cuando la sesión termina", async () => {
    const calls: number[] = [];
    let ended = false;
    let stopped = false;
    const queue = createEventQueue({
      transport: {
        async send(events) {
          calls.push(events.length);
          if (ended) throw new QueueHttpError(409);
          return { accepted: events.length };
        },
      },
      storage: { load: () => [], store: () => {} },
      onStopped: () => (stopped = true),
    });
    await queue.flush();
    expect(calls).toEqual([0]);
    ended = true;
    queue.push(event(3));
    await queue.flush();
    expect(stopped).toBe(true);
    queue.push(event(4));
    await queue.flush();
    expect(calls).toEqual([0, 1]);
  });

  it("recupera lo pendiente de una visita anterior", async () => {
    const sent: string[] = [];
    const queue = createEventQueue({
      transport: {
        async send(events) {
          sent.push(...events.map((e) => e.clientEventId));
          return { accepted: events.length };
        },
      },
      storage: { load: () => [event(7)], store: () => {} },
    });
    await queue.flush();
    expect(sent).toEqual(["evt-7-xxxxxxxx"]);
  });
});
