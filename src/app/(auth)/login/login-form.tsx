"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/modules/auth/client";

export interface DemoLogin {
  password: string;
  accounts: { key: "admin" | "teacher" | "student" | "minor"; email: string }[];
}

export function LoginForm({ next, demo }: { next: string; demo?: DemoLogin | null }) {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await signIn(String(form.get("email") ?? "").trim(), String(form.get("password") ?? ""));
  }

  async function signIn(email: string, password: string) {
    setPending(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    if (signInError) {
      // Un solo mensaje para correo inexistente, contraseña incorrecta o cuenta desactivada:
      // no se revela qué cuentas existen.
      setError(signInError.status === 429 ? t("tooManyAttempts") : t("invalid"));
      setPending(false);
      return;
    }

    // La página de inicio redirige a la sección del rol (o al cambio de contraseña).
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
      {demo ? (
        <div className="mt-2 grid gap-3 rounded-lg border border-dashed p-3" data-testid="demo-accounts">
          <div className="grid gap-1">
            <p className="text-sm font-medium">{t("demo.title")}</p>
            <p className="text-xs text-muted-foreground">{t("demo.description")}</p>
            <p className="text-xs">
              {t("demo.password")} <code className="rounded bg-muted px-1 py-0.5 font-mono">{demo.password}</code>
            </p>
          </div>
          <div className="grid gap-2">
            {demo.accounts.map((account) => (
              <Button
                key={account.key}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto justify-start py-1.5 text-left whitespace-normal"
                disabled={pending}
                onClick={() => void signIn(account.email, demo.password)}
              >
                <span className="grid">
                  <span>{t(`demo.accounts.${account.key}`)}</span>
                  <span className="text-xs font-normal text-muted-foreground">{account.email}</span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
