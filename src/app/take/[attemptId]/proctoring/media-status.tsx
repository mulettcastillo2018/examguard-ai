"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { CameraPreview, FacesStatus, LevelMeter } from "@/components/proctoring/media-check";
import { Button } from "@/components/ui/button";
import type { MediaEvent } from "@/lib/media/devices";
import { useCamera, useMicrophone } from "@/lib/media/use-devices";
import { cn } from "@/lib/utils";

/**
 * Cámara y micrófono durante el examen (solo si la sesión los autorizó). El estudiante ve
 * en todo momento lo mismo que se mide; si un dispositivo falla, sigue presentando y el
 * hecho queda registrado.
 */
export function MediaStatus({
  camera,
  microphone,
  emit,
  closeRef,
}: {
  camera: boolean;
  microphone: boolean;
  emit: (event: MediaEvent) => void;
  /** Para que la entrega apague los dispositivos y cierre sus episodios antes de enviar. */
  closeRef: RefObject<(() => void) | null>;
}) {
  const t = useTranslations("media");
  const cam = useCamera(camera, emit);
  const mic = useMicrophone(microphone, emit);
  const [preview, setPreview] = useState(false);
  const { close: closeCamera } = cam;
  const { close: closeMicrophone } = mic;

  useEffect(() => {
    closeRef.current = () => {
      closeCamera();
      closeMicrophone();
    };
    return () => {
      closeRef.current = null;
    };
  }, [closeRef, closeCamera, closeMicrophone]);

  useEffect(() => {
    if (cam.state === "error") toast.warning(t("cameraErrorTitle"), { description: t("inExam") });
  }, [cam.state, t]);
  useEffect(() => {
    if (mic.state === "error") toast.warning(t("microphoneErrorTitle"), { description: t("inExam") });
  }, [mic.state, t]);

  const facesLabel = cam.state === "error" ? t("cameraUnavailable") : cam.faces === null ? t("starting") : t("faces", { count: cam.faces });
  const facesWarn = cam.state === "error" || (cam.faces !== null && cam.faces !== 1);

  return (
    <>
      <div className="flex items-center gap-2" data-testid="media-status">
        {camera ? (
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 gap-1.5 px-2 text-xs font-normal", facesWarn && "border-amber-600/50 text-amber-700")}
            onClick={() => setPreview((open) => !open)}
            disabled={cam.state !== "on"}
            aria-pressed={preview}
            aria-label={`${t("camera")}: ${facesLabel}. ${preview ? t("hidePreview") : t("showPreview")}`}
            data-testid="camera-status"
          >
            {cam.state === "error" ? <CameraOff aria-hidden /> : <Camera aria-hidden />}
            <span className="hidden md:inline">{facesLabel}</span>
          </Button>
        ) : null}
        {microphone ? (
          <span
            className={cn("flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs", mic.state === "error" && "border-amber-600/50 text-amber-700")}
            data-testid="microphone-status"
          >
            {mic.state === "error" ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            {mic.state === "on" ? (
              <LevelMeter level={mic.level.value} active={mic.level.active} className="w-10" />
            ) : (
              <span className="hidden md:inline">{mic.state === "error" ? t("microphoneUnavailable") : t("starting")}</span>
            )}
            <span className="sr-only">{mic.state === "on" ? t("microphoneOn") : ""}</span>
          </span>
        ) : null}
      </div>

      {/* En un portal: la cabecera (con desenfoque de fondo) atraparía un elemento fijo. */}
      {preview && cam.state === "on"
        ? createPortal(
            <div className="fixed right-4 bottom-4 z-20 grid w-52 gap-2 rounded-lg border bg-background p-2 shadow-lg" data-testid="camera-preview">
              <CameraPreview stream={cam.stream} label={t("previewLabel")} />
              <FacesStatus state={cam.state} faces={cam.faces} className="px-1" />
              <Button variant="ghost" size="sm" onClick={() => setPreview(false)}>
                {t("hidePreview")}
              </Button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
