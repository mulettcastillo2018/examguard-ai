"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireStream,
  forgetStream,
  MediaUnavailableError,
  startCameraMonitor,
  startMicrophoneMonitor,
  type DeviceKind,
  type DeviceMonitor,
  type MediaErrorCode,
  type MediaEvent,
  type StreamLease,
} from "./devices";

export type DeviceState = "off" | "starting" | "on" | "error";

type Result = { state: "on"; stream: MediaStream } | { state: "error"; code: MediaErrorCode };
type Start = (stream: MediaStream, emit: (event: MediaEvent) => void, onEnded: () => void) => Promise<DeviceMonitor> | DeviceMonitor;

const MAX_RECONNECTS = 3;
const RECONNECT_DELAY_MS = 1_500;

const codeOf = (error: unknown): MediaErrorCode => (error instanceof MediaUnavailableError ? error.code : "unsupported");

/**
 * Enciende un dispositivo mientras `enabled` sea verdadero y lo apaga al desmontar. Si no
 * se puede usar y hay `emit` (pantalla del examen), queda registrado como desconectado.
 */
function useDevice(kind: DeviceKind, enabled: boolean, start: Start, emit?: (event: MediaEvent) => void) {
  const [result, setResult] = useState<Result | null>(null);
  const monitorRef = useRef<DeviceMonitor | null>(null);
  const leaseRef = useRef<StreamLease | null>(null);
  const emitRef = useRef(emit);
  const startRef = useRef(start);
  useEffect(() => {
    emitRef.current = emit;
    startRef.current = start;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let monitor: DeviceMonitor | null = null;
    let lease: StreamLease | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnects = 0;

    const disconnected = (reason?: MediaErrorCode) =>
      emitRef.current?.({
        type: kind === "camera" ? "CAMERA_DISCONNECTED" : "MICROPHONE_DISCONNECTED",
        occurredAt: new Date().toISOString(),
        metadata: reason ? { reason } : {},
      });

    const open = async () => {
      const current = acquireStream(kind);
      lease = current;
      leaseRef.current = current;
      let created: DeviceMonitor | null = null;
      let endHandled = false;
      // Una sola vez por apertura, venga del monitor o de la revisión de abajo.
      const handleEnd = () => {
        if (endHandled) return;
        endHandled = true;
        created?.stop();
        onEnded(current);
      };
      try {
        const stream = await current.stream;
        if (cancelled) return;
        created = await startRef.current(stream, (event) => emitRef.current?.(event), handleEnd);
        if (cancelled) {
          created.stop();
          return;
        }
        // Pudo terminar mientras se preparaba (el detector tarda en cargar la primera vez).
        if (stream.getTracks().some((track) => track.readyState === "ended")) {
          handleEnd();
          return;
        }
        monitor = created;
        monitorRef.current = created;
        setResult({ state: "on", stream });
      } catch (error) {
        if (cancelled) return;
        current.release();
        const code = codeOf(error);
        setResult({ state: "error", code });
        // Al reconectar, la desconexión ya quedó registrada.
        if (reconnects === 0) disconnected(code);
      }
    };

    // Se desconectó durante el uso: queda registrado. Un tropiezo pasajero —el servicio de
    // cámara del sistema que se reinicia, un cable que se reconecta— no debe dejar al
    // estudiante sin dispositivo: se intenta abrir de nuevo unas pocas veces.
    const onEnded = (current: StreamLease) => {
      disconnected();
      forgetStream(kind);
      current.release();
      monitor = null;
      monitorRef.current = null;
      if (cancelled) return;
      if (reconnects >= MAX_RECONNECTS) {
        setResult({ state: "error", code: "disconnected" });
        return;
      }
      reconnects += 1;
      setResult(null);
      retryTimer = setTimeout(() => void open(), RECONNECT_DELAY_MS);
    };

    void open();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      monitorRef.current = null;
      leaseRef.current = null;
      monitor?.stop();
      lease?.release();
      setResult(null);
    };
  }, [kind, enabled]);

  /** Deja de medir, cierra el episodio en curso y suelta el dispositivo (antes de entregar). */
  const close = useCallback(() => {
    monitorRef.current?.stop();
    leaseRef.current?.release();
  }, []);

  const state: DeviceState = !enabled ? "off" : (result?.state ?? "starting");
  return {
    state,
    close,
    code: result?.state === "error" ? result.code : null,
    stream: result?.state === "on" ? result.stream : null,
  };
}

/** Cámara con conteo de rostros en vivo (para que el estudiante vea lo mismo que se mide). */
export function useCamera(enabled: boolean, emit?: (event: MediaEvent) => void) {
  const [faces, setFaces] = useState<number | null>(null);
  const device = useDevice("camera", enabled, (stream, onEvent, onEnded) => startCameraMonitor(stream, onEvent, { onFaces: setFaces, onEnded }), emit);
  return { ...device, faces: device.state === "on" ? faces : null };
}

/** Micrófono con el nivel en vivo, de 0 a 1, y si cuenta como sonido. */
export function useMicrophone(enabled: boolean, emit?: (event: MediaEvent) => void) {
  const [level, setLevel] = useState({ value: 0, active: false });
  const device = useDevice(
    "microphone",
    enabled,
    (stream, onEvent, onEnded) => startMicrophoneMonitor(stream, onEvent, { onLevel: (value, active) => setLevel({ value, active }), onEnded }),
    emit,
  );
  return { ...device, level: device.state === "on" ? level : { value: 0, active: false } };
}
