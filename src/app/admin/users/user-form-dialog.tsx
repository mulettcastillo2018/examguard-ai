"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createUserAction, updateUserAction } from "./actions";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";

type Role = "ADMIN" | "TEACHER" | "STUDENT";

export interface EditableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isMinor: boolean;
  active: boolean;
}

/**
 * Crear (sin `user`) o editar un usuario. Al crearlo muestra la contraseña temporal una
 * sola vez. Para la propia cuenta no se puede cambiar el rol ni desactivarla.
 */
export function UserFormDialog({
  user,
  isSelf = false,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  user?: EditableUser;
  isSelf?: boolean;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("admin.users");
  const tRoles = useTranslations("roles");
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [role, setRole] = useState<Role>(user?.role ?? "STUDENT");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);

  function reset() {
    setError(null);
    setFields([]);
    setRole(user?.role ?? "STUDENT");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields([]);
    const form = new FormData(event.currentTarget);
    if (role !== "STUDENT") form.delete("isMinor");

    if (user) {
      const result = await updateUserAction(user.id, form);
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? []);
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
      return;
    }

    const result = await createUserAction(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? []);
      return;
    }
    setOpen(false);
    setCreated({ name: result.data.name, password: result.data.temporaryPassword });
    router.refresh();
  }

  const invalid = (field: string) => fields.includes(field);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) reset();
          setOpen(next);
        }}
      >
        {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user ? t("form.editTitle") : t("form.createTitle")}</DialogTitle>
            {!user ? <DialogDescription>{t("form.createDescription")}</DialogDescription> : null}
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="user-name">{t("form.name")}</Label>
              <Input id="user-name" name="name" defaultValue={user?.name} required minLength={3} aria-invalid={invalid("name")} />
              {invalid("name") ? <p className="text-xs text-destructive">{t("form.errors.name")}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-email">{t("form.email")}</Label>
              <Input
                id="user-email"
                name="email"
                type="email"
                defaultValue={user?.email}
                readOnly={Boolean(user)}
                required
                aria-invalid={invalid("email")}
              />
              {invalid("email") ? <p className="text-xs text-destructive">{t("form.errors.email")}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-role">{t("form.role")}</Label>
              <Select name="role" value={role} onValueChange={(value) => setRole(value as Role)} disabled={isSelf}>
                <SelectTrigger id="user-role" className="w-full" aria-invalid={invalid("role")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["STUDENT", "TEACHER", "ADMIN"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {tRoles(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Un Select deshabilitado no envía su valor: se manda aparte. */}
              {isSelf ? <input type="hidden" name="role" value={role} /> : null}
            </div>
            {role === "STUDENT" ? (
              <div className="flex items-start gap-3">
                <Checkbox id="user-minor" name="isMinor" defaultChecked={user?.isMinor} className="mt-0.5" />
                <div className="grid gap-1">
                  <Label htmlFor="user-minor">{t("form.isMinor")}</Label>
                  <p className="text-xs text-muted-foreground">{t("form.isMinorHint")}</p>
                </div>
              </div>
            ) : null}
            {user ? (
              <div className="flex items-start gap-3">
                <Switch id="user-active" name="active" defaultChecked={user.active} disabled={isSelf} className="mt-0.5" />
                {isSelf ? <input type="hidden" name="active" value="on" /> : null}
                <div className="grid gap-1">
                  <Label htmlFor="user-active">{t("form.active")}</Label>
                  <p className="text-xs text-muted-foreground">{t("form.activeHint")}</p>
                </div>
              </div>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("form.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("form.saving") : user ? t("form.save") : t("form.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {created ? (
        <TemporaryPasswordDialog
          open
          onOpenChange={(next) => !next && setCreated(null)}
          name={created.name}
          password={created.password}
        />
      ) : null}
    </>
  );
}
