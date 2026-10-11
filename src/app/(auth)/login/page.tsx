import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeInternalPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/modules/auth/session";
import { DEMO_ACCOUNTS, demoSettings } from "@/modules/demo/demo";
import { ROLE_HOME } from "@/modules/rbac";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);

  const { next } = await searchParams;
  const t = await getTranslations("auth.login");
  const demo = demoSettings();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={safeInternalPath(next)} demo={demo ? { password: demo.password, accounts: [...DEMO_ACCOUNTS] } : null} />
          <p className="mt-6 text-xs text-muted-foreground">{t("noSignUp")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
