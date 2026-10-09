"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface SignalView {
  id: string;
  label: string;
  severity: string;
  explanation: string;
}

const TONE: Record<string, string> = {
  LOW: "border-muted-foreground/30 text-muted-foreground",
  MEDIUM: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  HIGH: "border-destructive/60 text-destructive",
};

/** Señales con su etiqueta (S1...), severidad y explicación factual. */
export function SignalList({ signals }: { signals: SignalView[] }) {
  const t = useTranslations("proctoring");
  return (
    <ul className="grid gap-2" data-testid="signal-list">
      {signals.map((signal) => (
        <li key={signal.id} className="flex items-start gap-2 text-sm">
          <span
            className={cn("mt-0.5 shrink-0 rounded border px-1.5 text-xs font-medium tabular-nums", TONE[signal.severity] ?? TONE.LOW)}
            title={t(`severity.${signal.severity}`)}
          >
            {signal.label}
          </span>
          <span>
            {signal.explanation}
            <span className="sr-only"> ({t(`severity.${signal.severity}`)})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
