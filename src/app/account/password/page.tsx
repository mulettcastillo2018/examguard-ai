import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { ROLE_HOME } from "@/modules/rbac";
import { ChangePasswordForm } from "./change-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.password");
  return { title: t("title") };
}

export default async function ChangePasswordPage() {
  const user = await requirePageUser({ allowPendingPasswordChange: true });
  const t = await getTranslations("auth.password");
  const home = ROLE_HOME[user.role];

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {user.mustChangePassword ? (
            <Alert>
              <AlertDescription>{t("requiredNotice")}</AlertDescription>
            </Alert>
          ) : null}
          <ChangePasswordForm redirectTo={home} />
          {!user.mustChangePassword ? (
            <Link href={home} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              {t("back")}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
