"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { MediaErrorCode } from "@/lib/media/devices";
import { useCamera, useMicrophone, type DeviceState } from "@/lib/media/use-devices";
import { cn } from "@/lib/utils";

/** Video en vivo de la cámara, en espejo como un espejo de verdad. Nunca se graba. */
export function CameraPreview({ stream, label, className }: { stream: MediaStream | null; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} muted playsInline aria-label={label} className={cn("aspect-[4/3] w-full -scale-x-100 rounded-md bg-muted object-cover", className)} />;
}

/** Lo que el estudiante ve de su cámara: cuántos rostros detecta el modelo, igual que se medirá. */
export function FacesStatus({ state, faces, className }: { state: DeviceState; faces: number | null; className?: string }) {
  const t = useTranslations("media");
  if (state !== "on" || faces === null) {
    return (
      <p className={cn("flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("starting")}
      </p>
    );
  }
  const ok = faces === 1;
  return (
    <div className={cn("grid gap-0.5 text-sm", className)} aria-live="polite">
      <p className={cn("flex items-center gap-1.5 font-medium", ok ? "text-primary" : "text-amber-700")} data-testid="faces-status">
        {ok ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
        {t("faces", { count: faces })}
      </p>
      {faces === 0 ? <p className="text-xs text-muted-foreground">{t("noFaceHint")}</p> : null}
    </div>
  );
}

/** Barra del nivel del micrófono (el sonido no se graba: solo su intensidad). */
export function LevelMeter({ level, active, className }: { level: number; active: boolean; className?: string }) {
  const t = useTranslations("media");
  // La voz ronda 0,05–0,2 de RMS: se amplía para que la barra se mueva al hablar.
  const percent = Math.round(Math.min(1, level * 6) * 100);
  return (
    <div
      role="meter"
      aria-label={t("levelLabel")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-200", active ? "bg-primary" : "bg-muted-foreground/40")} style={{ width: `${percent}%` }} />
    </div>
  );
}

function useReport(state: DeviceState, code: MediaErrorCode | null, onChange: (state: DeviceState, code: MediaErrorCode | null) => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(state, code);
  }, [state, code]);
}

/** Prueba de cámara en la pantalla previa: se enciende al autorizarla y se apaga al desmarcar. */
export function CameraCheck({ onChange }: { onChange: (state: DeviceState, code: MediaErrorCode | null) => void }) {
  const t = useTranslations("media");
  const camera = useCamera(true);
  useReport(camera.state, camera.code, onChange);
  if (camera.state === "error") return null;
  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center" data-testid="camera-check">
      <CameraPreview stream={camera.stream} label={t("previewLabel")} />
      <div className="grid gap-2">
        <FacesStatus state={camera.state} faces={camera.faces} />
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      </div>
    </div>
  );
}

/** Prueba de micrófono en la pantalla previa: una barra que se mueve al hablar. */
export function MicrophoneCheck({ onChange }: { onChange: (state: DeviceState, code: MediaErrorCode | null) => void }) {
  const t = useTranslations("media");
  const microphone = useMicrophone(true);
  useReport(microphone.state, microphone.code, onChange);
  if (microphone.state === "error") return null;
  return (
    <div className="grid gap-2 rounded-lg border p-3" data-testid="microphone-check">
      {microphone.state === "on" ? (
        <div className="flex items-center gap-3">
          <LevelMeter level={microphone.level.value} active={microphone.level.active} className="flex-1" />
          <span className="w-20 text-xs text-muted-foreground">{microphone.level.active ? t("sound") : t("quiet")}</span>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("starting")}
        </p>
      )}
    </div>
  );
}
