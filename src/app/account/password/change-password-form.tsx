"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/modules/auth/client";
import { validatePasswordChange } from "@/modules/auth/password-rules";

export function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations("auth.password");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    const problem = validatePasswordChange({ currentPassword, newPassword, confirmation });
    if (problem) {
      setError(t(problem));
      return;
    }

    setPending(true);
    setError(null);
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (changeError) {
      setError(changeError.code === "INVALID_PASSWORD" ? t("invalidCurrent") : t("failed"));
      setPending(false);
      return;
    }

    toast.success(t("success"));
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">{t("current")}</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">{t("new")}</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmation">{t("confirm")}</Label>
        <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
