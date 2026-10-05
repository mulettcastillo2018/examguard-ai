"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Activity, ChartColumn, Copy, FolderOpen, MoreHorizontal, Trash2 } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteExamAction, duplicateExamAction } from "./actions";

export function ExamRowActions({ exam }: { exam: { id: string; title: string; isDraft: boolean } }) {
  const t = useTranslations("exams");
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function duplicate() {
    const result = await duplicateExamAction(exam.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("duplicated"));
    router.push(`/teacher/exams/${result.data.id}`);
  }

  async function remove() {
    const result = await deleteExamAction(exam.id);
    setConfirmOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("deleted"));
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${t("actions")}: ${exam.title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/teacher/exams/${exam.id}`}>
              <FolderOpen />
              {t("open")}
            </Link>
          </DropdownMenuItem>
          {exam.isDraft ? null : (
            <DropdownMenuItem asChild>
              <Link href={`/teacher/exams/${exam.id}/monitor`}>
                <Activity />
                {t("monitorLink")}
              </Link>
            </DropdownMenuItem>
          )}
          {exam.isDraft ? null : (
            <DropdownMenuItem asChild>
              <Link href={`/teacher/exams/${exam.id}/results`}>
                <ChartColumn />
                {t("resultsLink")}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={duplicate}>
            <Copy />
            {t("duplicate")}
          </DropdownMenuItem>
          {exam.isDraft ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
              <Trash2 />
              {t("delete")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{t("deleteConfirm.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
