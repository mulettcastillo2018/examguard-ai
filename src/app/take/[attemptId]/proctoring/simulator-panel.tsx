"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FlaskConical, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EVENT_CATALOG, SIMULATED_EVENTS, type ClientEvent } from "@/modules/proctoring/catalog";

type Simulated = (typeof SIMULATED_EVENTS)[number];

/** El evento "ocurrió" durante los últimos segundos que dice su duración (fuera del render). */
function simulatedEvent(simulated: Simulated): ClientEvent {
  return {
    clientEventId: crypto.randomUUID(),
    type: simulated.type,
    occurredAt: new Date(Date.now() - (simulated.durationSec ?? 0) * 1000).toISOString(),
    durationSec: simulated.durationSec,
    confidence: simulated.confidence,
    metadata: {},
    simulated: true,
  };
}

/**
 * Simulador de la demostración (sección 22 de la especificación): genera eventos
 * marcados como simulados. Los de cámara o micrófono solo si la sesión los autorizó.
 */
export function SimulatorPanel({ camera, microphone, onEmit }: { camera: boolean; microphone: boolean; onEmit: (event: ClientEvent) => void }) {
  const t = useTranslations("proctoring");
  const [open, setOpen] = useState(false);

  function emit(simulated: Simulated) {
    onEmit(simulatedEvent(simulated));
    toast.message(t("simulator.sent", { type: t(`types.${simulated.type}`) }));
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="fixed bottom-4 left-4 z-20 shadow-md" onClick={() => setOpen(true)}>
        <FlaskConical />
        {t("simulator.open")}
      </Button>
    );
  }

  return (
    <section aria-label={t("simulator.title")} className="fixed bottom-4 left-4 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-background p-4 shadow-lg">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4" aria-hidden />
            {t("simulator.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("simulator.description")}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t("simulator.close")} onClick={() => setOpen(false)}>
          <X />
        </Button>
      </div>
      <ul className="grid gap-1.5">
        {SIMULATED_EVENTS.map((simulated) => {
          const definition = EVENT_CATALOG[simulated.type];
          const requires = "requires" in definition ? definition.requires : undefined;
          const blocked = (requires === "camera" && !camera) || (requires === "microphone" && !microphone);
          return (
            <li key={simulated.type}>
              <Button variant="secondary" size="sm" className="w-full justify-start" disabled={blocked} onClick={() => emit(simulated)}>
                {t(`types.${simulated.type}`)}
              </Button>
              {blocked ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{requires === "camera" ? t("simulator.needsCamera") : t("simulator.needsMicrophone")}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
