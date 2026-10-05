"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, Send, Undo2 } from "lucide-react";
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
import type { PublishProblem } from "@/modules/exams/settings";
import { publishExamAction, unpublishExamAction } from "../actions";

export function PublishPanel({
  examId,
  isDraft,
  problems,
  publishedOn,
  canUnpublish,
}: {
  examId: string;
  isDraft: boolean;
  problems: PublishProblem[];
  /** Fecha de publicación ya formateada por el servidor. */
  publishedOn: string | null;
  canUnpublish: boolean;
}) {
  const t = useTranslations("exams.publish");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(action: () => ReturnType<typeof publishExamAction>, success: string) {
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

  if (!isDraft) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1 text-sm">
          {publishedOn ? (
            <p className="flex items-center gap-2 font-medium">
              <CircleCheck className="size-4 text-primary" aria-hidden />
              {t("publishedOn", { date: publishedOn })}
            </p>
          ) : null}
          <p className="text-muted-foreground">{canUnpublish ? t("unpublishHint") : t("started")}</p>
        </div>
        {canUnpublish ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Undo2 />
                {t("unpublish")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("unpublishConfirm.title")}</AlertDialogTitle>
                <AlertDialogDescription>{t("unpublishConfirm.description")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("unpublishConfirm.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(() => unpublishExamAction(examId), t("unpublished"))}>
                  {t("unpublishConfirm.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      {problems.length ? (
        <div className="grid gap-1 text-sm" data-testid="publish-problems">
          <p className="flex items-center gap-2 font-medium">
            <CircleAlert className="size-4 text-destructive" aria-hidden />
            {t("missing")}
          </p>
          <ul className="ml-6 list-disc text-muted-foreground">
            {problems.map((problem) => (
              <li key={problem}>{t(`problems.${problem}`)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleCheck className="size-4 text-primary" aria-hidden />
          {t("ready")}
        </p>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={pending || problems.length > 0}>
            <Send />
            {t("publish")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => publishExamAction(examId), t("published"))}>{t("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
