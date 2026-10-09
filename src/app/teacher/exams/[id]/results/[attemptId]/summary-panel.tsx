"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { generateSummaryAction } from "../../../actions";

/** Resumen para quien revisa: se genera al pedirlo (Claude o la plantilla) y queda guardado. */
export function SummaryPanel({ examId, attemptId, initial }: { examId: string; attemptId: string; initial: { text: string; source: string } | null }) {
  const t = useTranslations("review");
  const [summary, setSummary] = useState(initial);
  const [pending, setPending] = useState(false);
  const hydrated = useHydrated();

  async function generate() {
    setPending(true);
    const result = await generateSummaryAction(examId, attemptId, Boolean(summary));
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSummary(result.data);
  }

  const model = summary?.source.startsWith("anthropic:") ? summary.source.slice("anthropic:".length) : null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{t("summary")}</p>
        <Button size="sm" variant="outline" onClick={generate} disabled={!hydrated || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pending ? t("generating") : summary ? t("regenerate") : t("generate")}
        </Button>
      </div>
      {summary ? (
        <div className="grid gap-1.5" data-testid="risk-summary">
          <p className="text-sm whitespace-pre-line">{summary.text}</p>
          <p className="text-xs text-muted-foreground">{model ? t("sourceAi", { model }) : t("sourceTemplate")}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}
