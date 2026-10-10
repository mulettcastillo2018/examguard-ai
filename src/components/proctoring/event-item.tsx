"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface EventView {
  id: string;
  type: string;
  severity: string;
  occurredAt: string;
  durationSec: number | null;
  confidence: number | null;
  source: string;
  metadata: unknown;
}

const DOT: Record<string, string> = { LOW: "bg-muted-foreground/50", MEDIUM: "bg-amber-500", HIGH: "bg-destructive" };

/** Duración legible: "15 s", "2 min", "1 min 10 s". */
export function useDuration() {
  const t = useTranslations("proctoring");
  return (seconds: number) => {
    if (seconds < 60) return t("seconds", { seconds });
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? t("minutesSeconds", { minutes, seconds: rest }) : t("minutes", { minutes });
  };
}

/** Un evento como hecho: qué, cuándo, cuánto duró y de dónde vino (y qué señales lo citan, si se indica). */
export function EventItem({ event, citedBy = [] }: { event: EventView; citedBy?: string[] }) {
  const t = useTranslations("proctoring");
  const format = useFormatter();
  const duration = useDuration();
  const length = (event.metadata as { length?: number } | null)?.length;
  const details = [
    event.durationSec ? duration(event.durationSec) : null,
    event.type === "PASTE" && typeof length === "number" ? t("pasted", { length }) : null,
    event.confidence !== null ? t("confidence", { value: event.confidence }) : null,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-2 text-sm" data-testid="event-item">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[event.severity] ?? DOT.LOW)} aria-label={t(`severity.${event.severity}`)} />
      <span className="grid gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2">
          <span>{t(`types.${event.type}`)}</span>
          {event.source === "SIMULATION" ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
              {t("source.SIMULATION")}
            </Badge>
          ) : null}
          {citedBy.map((label) => (
            <span key={label} className="rounded border border-primary/40 px-1 text-[11px] font-medium text-primary tabular-nums" title={label}>
              {label}
            </span>
          ))}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {format.dateTime(new Date(event.occurredAt), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          {details.length ? ` · ${details.join(" · ")}` : ""}
        </span>
      </span>
    </li>
  );
}
