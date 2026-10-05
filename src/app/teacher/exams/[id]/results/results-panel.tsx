"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ResultsProblem } from "@/modules/attempts/results";
import { closeExamAction, publishResultsAction } from "../../actions";

export function ResultsPanel({
  examId,
  problems,
  endsAtLabel,
  publishedOn,
  canClose,
}: {
  examId: string;
  problems: ResultsProblem[];
  /** Cierre del examen ya formateado por el servidor. */
  endsAtLabel: string;
  publishedOn: string | null;
  canClose: boolean;
}) {
  const t = useTranslations("examResults");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: () => ReturnType<typeof publishResultsAction>, success: string) {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  if (publishedOn) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleCheck className="size-4 text-primary" aria-hidden />
        {t("publish.publishedOn", { date: publishedOn })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      {problems.length ? (
        <div className="grid gap-1 text-sm" data-testid="results-problems">
          <p className="flex items-center gap-2 font-medium">
            <CircleAlert className="size-4 text-destructive" aria-hidden />
            {t("publish.missing")}
          </p>
          <ul className="ml-6 list-disc text-muted-foreground">
            {problems.map((problem) => (
              <li key={problem}>{t(`publish.problems.${problem}`, { date: endsAtLabel })}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleCheck className="size-4 text-primary" aria-hidden />
          {t("publish.ready")}
        </p>
      )}
      <div className="flex shrink-0 flex-wrap gap-2">
        {canClose ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Lock />
                {t("close.button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("close.title")}</AlertDialogTitle>
                <AlertDialogDescription>{t("close.description")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("close.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => closeExamAction(examId), t("close.closed"))}>{t("close.confirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={pending || problems.length > 0}>
              <Send />
              {t("publish.publish")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("publish.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("publish.confirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("publish.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => publishResultsAction(examId), t("publish.published"))}>{t("publish.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
