import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Eye, ListChecks, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/session";
import { ROLE_HOME } from "@/modules/rbac";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/account/password" : ROLE_HOME[user.role]);

  const t = await getTranslations();
  const principles = [
    { icon: Eye, title: t("landing.principles.detection"), text: t("landing.principles.detectionText") },
    { icon: ListChecks, title: t("landing.principles.interpretation"), text: t("landing.principles.interpretationText") },
    { icon: UserCheck, title: t("landing.principles.decision"), text: t("landing.principles.decisionText") },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-4 py-16">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        {t("app.name")}
      </div>

      <section className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("landing.title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("landing.subtitle")}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/login">{t("landing.login")}</Link>
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {principles.map(({ icon: Icon, title, text }, index) => (
          <Card key={title}>
            <CardHeader>
              <span className="text-xs font-medium text-muted-foreground">0{index + 1}</span>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-primary" aria-hidden />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{text}</CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
