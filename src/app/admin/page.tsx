import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuditTable } from "@/components/dashboard/audit-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { getInstitutionOverview } from "@/modules/institutions/institutions";
import { getSupervisionMetrics } from "@/modules/metrics/metrics";

export default async function AdminOverviewPage() {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const t = await getTranslations("admin.overview");
  const tSignal = await getTranslations("review.signalTypes");
  const [overview, metrics] = await Promise.all([getInstitutionOverview(user), getSupervisionMetrics(user)]);
  const maxSignals = Math.max(1, ...metrics.signals.map((signal) => signal.count));
  const figures: [string, number][] = [
    [t("supervision.finished"), metrics.finished],
    [t("supervision.camera"), metrics.withCamera],
    [t("supervision.microphone"), metrics.withMicrophone],
    [t("supervision.pending"), metrics.pending],
    [t("supervision.noIrregularity"), metrics.reviewed.noIrregularity],
    [t("supervision.needsInvestigation"), metrics.reviewed.needsInvestigation],
  ];

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("users")} value={overview.users} />
        <StatCard label={t("teachers")} value={overview.teachers} />
        <StatCard label={t("students")} value={overview.students} />
        <StatCard label={t("minors")} value={overview.minors} />
        <StatCard label={t("courses")} value={overview.courses} />
      </div>
      <Card className="mt-6" data-testid="supervision-metrics">
        <CardHeader>
          <CardTitle>{t("supervision.title", { days: metrics.windowDays })}</CardTitle>
          <CardDescription>{t("supervision.retention", { days: metrics.retentionDays })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {metrics.urgent || metrics.minorsWithoutConsent ? (
            <ul className="grid gap-2 text-sm">
              {metrics.urgent ? (
                <li className="flex flex-wrap items-center gap-x-2 rounded-md border border-amber-600/40 px-3 py-2 text-amber-800 dark:text-amber-300">
                  {t("supervision.urgent", { count: metrics.urgent })}
                  <Link href="/admin/reviews" className="font-medium underline-offset-4 hover:underline">
                    {t("supervision.urgentLink")}
                  </Link>
                </li>
              ) : null}
              {metrics.minorsWithoutConsent ? (
                <li className="flex flex-wrap items-center gap-x-2 rounded-md border px-3 py-2 text-muted-foreground">
                  {t("supervision.minorsWithoutConsent", { count: metrics.minorsWithoutConsent })}
                  <Link href="/admin/users" className="font-medium text-foreground underline-offset-4 hover:underline">
                    {t("supervision.minorsLink")}
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {figures.map(([label, value]) => (
              <div key={label} className="grid content-start gap-1">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-2">
            <p className="text-sm font-medium">{t("supervision.signals")}</p>
            {metrics.signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("supervision.noSignals")}</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {metrics.signals.map((signal) => (
                  <li key={signal.type} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3">
                    <span className="truncate">{tSignal.has(signal.type) ? tSignal(signal.type as "MULTIPLE_FACES") : signal.type}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.round((signal.count / maxSignals) * 100)}%` }} />
                    </span>
                    <span className="tabular-nums text-muted-foreground">{signal.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("recentActivity")}</CardTitle>
          <CardAction>
            <Link href="/admin/audit" className="text-sm text-primary underline-offset-4 hover:underline">
              {t("seeAudit")}
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <AuditTable rows={overview.recentActivity} />
        </CardContent>
      </Card>
    </>
  );
}
