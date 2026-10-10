"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { REVIEW_OUTCOMES, type ReviewOutcome as Outcome } from "@/modules/review/rules";
import { saveReviewAction } from "./actions";

/** Decisión de quien revisa: un resultado y observaciones (obligatorias si pide investigar). */
export function ReviewForm({
  sessionId,
  initial,
  notesMin,
  notesMax,
}: {
  sessionId: string;
  initial: { outcome: Outcome; notes: string | null } | null;
  notesMin: number;
  notesMax: number;
}) {
  const t = useTranslations("sessionReview.decision");
  const tOutcome = useTranslations("review.outcome");
  const router = useRouter();
  const hydrated = useHydrated();
  const [outcome, setOutcome] = useState<Outcome | "">(initial?.outcome ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<{ field: "outcome" | "notes"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = notes.trim();
    if (!outcome) return setError({ field: "outcome", message: t("outcomeRequired") });
    if (outcome === "NEEDS_INVESTIGATION" && trimmed.length < notesMin) return setError({ field: "notes", message: t("notesRequired", { min: notesMin }) });
    if (trimmed.length > notesMax) return setError({ field: "notes", message: t("notesTooLong", { max: notesMax }) });

    setError(null);
    setPending(true);
    const result = await saveReviewAction(sessionId, { outcome, notes: trimmed });
    setPending(false);
    if (!result.ok) {
      const field = result.fields?.includes("notes") ? "notes" : "outcome";
      const message = result.codes?.includes("notesRequired")
        ? t("notesRequired", { min: notesMin })
        : result.codes?.includes("notesTooLong")
          ? t("notesTooLong", { max: notesMax })
          : result.error;
      setError({ field, message });
      return;
    }
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="review-form">
      <fieldset disabled={!hydrated || pending} className="grid gap-4">
        <div className="grid gap-2">
          <Label id="review-outcome-label">{t("outcomeLabel")}</Label>
          <RadioGroup
            aria-labelledby="review-outcome-label"
            value={outcome}
            onValueChange={(value) => setOutcome(value as Outcome)}
            aria-invalid={error?.field === "outcome"}
            className="gap-2"
          >
            {REVIEW_OUTCOMES.map((value) => (
              <Label key={value} htmlFor={`outcome-${value}`} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-primary">
                <RadioGroupItem id={`outcome-${value}`} value={value} />
                {tOutcome(value)}
              </Label>
            ))}
          </RadioGroup>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="review-notes">{t("notes")}</Label>
          <Textarea
            id="review-notes"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-invalid={error?.field === "notes"}
            aria-describedby="review-notes-hint"
          />
          <p id="review-notes-hint" className="text-xs text-muted-foreground">
            {t("notesHint")} <span className="tabular-nums">({notes.trim().length}/{notesMax})</span>
          </p>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}
        <Button type="submit">{pending ? t("saving") : initial ? t("update") : t("save")}</Button>
      </fieldset>
    </form>
  );
}
