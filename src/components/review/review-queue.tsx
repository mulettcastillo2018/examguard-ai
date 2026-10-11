import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { listReviewQueue } from "@/modules/review/review";
import { QUEUE_FILTERS } from "@/modules/review/rules";

const SEVERITY_TONE: Record<string, string> = {
  LOW: "border-muted-foreground/30 text-muted-foreground",
  MEDIUM: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  HIGH: "border-destructive/60 text-destructive",
};

/** Cola de sesiones por revisar (o revisadas), compartida por docente y administrador. */
export async function ReviewQueue({ data, basePath }: { data: Awaited<ReturnType<typeof listReviewQueue>>; basePath: string }) {
  const t = await getTranslations("reviews");
  const tReview = await getTranslations("review");
  const tProctoring = await getTranslations("proctoring");
  const format = await getFormatter();
  const counts: Record<string, number> = { RECOMMENDED: data.counts.recommended, REVIEWED: data.counts.reviewed };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("filterLabel")} className="mb-4 flex flex-wrap gap-2">
        {QUEUE_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={filter === "RECOMMENDED" ? basePath : `${basePath}?status=${filter}`}
            aria-current={data.filter === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              data.filter === filter ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(`filters.${filter}`, { count: counts[filter] ?? 0 })}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{t(`empty.${data.filter}`)}</p>
      ) : (
        <ul className="grid gap-3" data-testid="review-queue">
          {data.rows.map((row) => (
            <li key={row.sessionId} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid min-w-0 gap-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {row.attempt.student.name}
                  <Badge variant={row.reviewStatus === "RECOMMENDED" ? "destructive" : "outline"}>
                    {row.review ? tReview(`outcome.${row.review.outcome}`) : tReview(`status.${row.reviewStatus}`)}
                  </Badge>
                  {row.attempt.status === "IN_PROGRESS" ? <Badge variant="secondary">{t("inProgress")}</Badge> : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {row.attempt.exam.title} · {row.attempt.exam.course.name} · {t("attempt", { number: row.attempt.number })}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{format.dateTime(row.startedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                  <span aria-hidden>·</span>
                  <span>
                    {t("signals", { count: row.signalCount })}, {t("events", { count: row.eventCount })}
                  </span>
                  {row.highestSeverity ? (
                    <span className={cn("rounded border px-1.5 font-medium", SEVERITY_TONE[row.highestSeverity])}>{tProctoring(`severity.${row.highestSeverity}`)}</span>
                  ) : null}
                  {row.review ? (
                    <span>
                      · {t("reviewedBy", { name: row.review.reviewer.name, date: format.dateTime(row.review.reviewedAt, { dateStyle: "medium" }) })}
                    </span>
                  ) : null}
                  {row.evidencePurgedAt ? (
                    <span>· {t("evidencePurged")}</span>
                  ) : row.evidenceExpiresAt ? (
                    <span className={cn(row.evidenceUrgent && "font-medium text-amber-700")}>
                      · {t("evidenceUntil", { date: format.dateTime(row.evidenceExpiresAt, { dateStyle: "medium" }) })}
                    </span>
                  ) : null}
                </p>
              </div>
              <Link
                href={`${basePath}/${row.sessionId}`}
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
                aria-label={`${row.review ? t("view") : t("open")}: ${row.attempt.student.name}`}
              >
                {row.review ? t("view") : t("open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
