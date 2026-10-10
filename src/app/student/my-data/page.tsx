import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { requirePageUser } from "@/modules/auth/session";
import { listMySupervision } from "@/modules/review/review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myData");
  return { title: t("title") };
}

// Transparencia: el estudiante ve los hechos registrados en sus sesiones (sección 11 del análisis).
export default async function MyDataPage() {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const t = await getTranslations("myData");
  const format = await getFormatter();
  const data = await listMySupervision(user);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {data.retentionDays ? <p className="mb-4 text-sm text-muted-foreground">{t("retention", { days: data.retentionDays })}</p> : null}
      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3" data-testid="my-data-list">
          {data.rows.map((row) => (
            <li key={row.attemptId} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid min-w-0 gap-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {row.exam.title}
                  <Badge variant="outline">{t(`reviewState.${row.reviewState}`)}</Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.exam.course.name} · {t("attempt", { number: row.number })} · <span className="tabular-nums">{format.dateTime(row.startedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                </p>
                <p className="text-xs text-muted-foreground">{t("events", { count: row.eventCount })}</p>
              </div>
              <Link
                href={`/student/my-data/${row.attemptId}`}
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
                aria-label={`${t("open")}: ${row.exam.title}`}
              >
                {t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
