"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Check, CircleAlert, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { QuestionType } from "@/modules/question-bank/content";
import { duplicateExamQuestionAction, moveExamQuestionAction, removeExamQuestionAction } from "../actions";

export interface ExamQuestionView {
  id: string;
  position: number;
  type: QuestionType;
  prompt: string;
  points: number;
  options: { id: string; label: string }[];
  answerKey: Record<string, unknown>;
  valid: boolean;
}

/** Vista previa de la respuesta, para que el docente revise el examen de un vistazo. */
function AnswerPreview({ question }: { question: ExamQuestionView }) {
  const t = useTranslations("exams.questions");
  const key = question.answerKey;
  if (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") {
    const correct = new Set((key.correctOptionIds as string[] | undefined) ?? []);
    return (
      <ul className="mt-2 grid gap-1 text-sm">
        {question.options.map((option) => (
          <li key={option.id} className="flex items-center gap-2">
            {correct.has(option.id) ? (
              <Check className="size-4 text-primary" aria-label={t("correct")} />
            ) : (
              <span className="size-4" aria-hidden />
            )}
            <span className={correct.has(option.id) ? "font-medium" : "text-muted-foreground"}>{option.label}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (question.type === "TRUE_FALSE") {
    return <p className="mt-2 text-sm text-muted-foreground">{t("answer", { value: key.value ? t("trueLabel") : t("falseLabel") })}</p>;
  }
  const accepted = (key.accepted as string[] | undefined) ?? [];
  if (question.type === "SHORT_ANSWER" && accepted.length) {
    return <p className="mt-2 text-sm text-muted-foreground">{t("accepted", { values: accepted.join(" · ") })}</p>;
  }
  return <p className="mt-2 text-sm text-muted-foreground">{t("manual")}</p>;
}

export function ExamQuestions({ examId, editable, questions }: { examId: string; editable: boolean; questions: ExamQuestionView[] }) {
  const t = useTranslations("exams.questions");
  const tTypes = useTranslations("questionBank.types");
  const tBank = useTranslations("questionBank");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [toRemove, setToRemove] = useState<ExamQuestionView | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (success) toast.success(success);
    router.refresh();
  }

  if (questions.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <>
      <ol className="grid gap-3">
        {questions.map((question, index) => (
          <li key={question.id} className="rounded-lg border p-4" data-testid="exam-question">
            {/* Arriba número, tipo, puntos y acciones; debajo el enunciado con todo el ancho. */}
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium tabular-nums">
                {question.position}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{tTypes(question.type)}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">{tBank("points", { points: question.points })}</span>
                  {question.valid ? null : (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <CircleAlert className="size-3.5" aria-hidden />
                      {t("invalid")}
                    </span>
                  )}
                </div>
              </div>
              {editable ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || index === 0}
                    aria-label={t("moveUp", { number: question.position })}
                    onClick={() => run(() => moveExamQuestionAction(examId, question.id, "up"))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || index === questions.length - 1}
                    aria-label={t("moveDown", { number: question.position })}
                    onClick={() => run(() => moveExamQuestionAction(examId, question.id, "down"))}
                  >
                    <ArrowDown />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={pending} aria-label={t("actions", { number: question.position })}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/teacher/exams/${examId}/questions/${question.id}`}>
                          <Pencil />
                          {t("edit")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => run(() => duplicateExamQuestionAction(examId, question.id), t("duplicatedMsg"))}>
                        <Copy />
                        {t("duplicate")}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToRemove(question)}>
                        <Trash2 />
                        {t("remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
            <div className="mt-2 sm:pl-10">
              <p className="whitespace-pre-line">{question.prompt}</p>
              <AnswerPreview question={question} />
            </div>
          </li>
        ))}
      </ol>

      <AlertDialog open={Boolean(toRemove)} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeConfirm.title", { number: toRemove?.position ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>{t("removeConfirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("removeConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const question = toRemove;
                setToRemove(null);
                if (question) void run(() => removeExamQuestionAction(examId, question.id), t("removed"));
              }}
            >
              {t("removeConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
