"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatPoints, parsePoints } from "@/modules/question-bank/content";
import { gradeAnswerAction } from "../../actions";

/** Puntos y comentario de una respuesta (calificar o corregir lo automático). */
export function GradeForm({
  examId,
  answerId,
  maxPoints,
  initialPoints,
  initialFeedback,
}: {
  examId: string;
  answerId: string;
  maxPoints: number;
  initialPoints?: number | null;
  initialFeedback?: string | null;
}) {
  const t = useTranslations("examResults.pending");
  const router = useRouter();
  const hydrated = useHydrated();
  const [points, setPoints] = useState(initialPoints == null ? "" : formatPoints(initialPoints));
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parsePoints(points);
    if (Number.isNaN(value) || value < 0 || value > maxPoints || !Number.isInteger(value * 4)) {
      setError(t("invalidPoints", { max: formatPoints(maxPoints) }));
      return;
    }
    setError(null);
    setPending(true);
    const result = await gradeAnswerAction(examId, answerId, { points: value, feedback });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!hydrated || pending} className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`points-${answerId}`}>{t("points", { max: formatPoints(maxPoints) })}</Label>
          <Input
            id={`points-${answerId}`}
            inputMode="decimal"
            autoComplete="off"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`feedback-${answerId}`}>{t("feedback")}</Label>
          <Textarea id={`feedback-${answerId}`} rows={1} className="min-h-9" value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        </div>
        <Button type="submit">{pending ? t("saving") : t("save")}</Button>
      </fieldset>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
