"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Pencil } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archiveQuestionAction, duplicateQuestionAction } from "./actions";

export function QuestionRowActions({ question }: { question: { id: string; prompt: string; archived: boolean } }) {
  const t = useTranslations("questionBank");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // El enunciado completo puede ser largo: la etiqueta accesible usa solo el comienzo.
  const shortPrompt = question.prompt.length > 60 ? `${question.prompt.slice(0, 60)}…` : question.prompt;

  async function duplicate() {
    const result = await duplicateQuestionAction(question.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("duplicated"));
    router.refresh();
  }

  async function setArchived(archived: boolean) {
    const result = await archiveQuestionAction(question.id, archived);
    setConfirmOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(archived ? t("archivedMsg") : t("restored"));
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${t("actions")}: ${shortPrompt}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/teacher/question-bank/${question.id}`}>
              <Pencil />
              {t("edit")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate}>
            <Copy />
            {t("duplicate")}
          </DropdownMenuItem>
          {question.archived ? (
            <DropdownMenuItem onSelect={() => setArchived(false)}>
              <ArchiveRestore />
              {t("restore")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
              <Archive />
              {t("archive")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archiveConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("archiveConfirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("archiveConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setArchived(true)}>{t("archiveConfirm.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
