"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, MoreHorizontal, Pencil } from "lucide-react";
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
import { resetPasswordAction } from "./actions";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";
import { UserFormDialog, type EditableUser } from "./user-form-dialog";

export function UserRowActions({ user, isSelf }: { user: EditableUser; isSelf: boolean }) {
  const t = useTranslations("admin.users");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const router = useRouter();

  async function reset() {
    const result = await resetPasswordAction(user.id);
    setConfirmOpen(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPassword(result.data.temporaryPassword);
    router.refresh();
  }

  return (
    <>
      {/* Los diálogos se abren fuera del menú para que no se cierren junto con él. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${t("actions")}: ${user.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            {t("edit")}
          </DropdownMenuItem>
          {!isSelf ? (
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
              <KeyRound />
              {t("resetPassword")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserFormDialog user={user} isSelf={isSelf} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reset.title", { name: user.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("reset.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("reset.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>{t("reset.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {password ? (
        <TemporaryPasswordDialog open onOpenChange={(next) => !next && setPassword(null)} name={user.name} password={password} />
      ) : null}
    </>
  );
}
