import type { ReactNode } from "react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EventItem, type EventView } from "@/components/proctoring/event-item";
import { SignalList } from "@/components/proctoring/signal-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { SessionReview } from "@/modules/review/review";
import { NOTES_MAX, NOTES_MIN_FOR_INVESTIGATION } from "@/modules/review/rules";
import { ReviewForm } from "./review-form";

const CATEGORIES = ["EXAM", "ACTIVITY", "FOCUS", "VISION", "AUDIO", "CONNECTION"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const SOURCES = ["BROWSER", "SIMULATION", "SERVER"] as const;

/** Revisión de una sesión: información, señales, línea de tiempo filtrable y la decisión humana. */
export async function SessionReviewView({ data, basePath, summarySlot }: { data: SessionReview; basePath: string; summarySlot?: ReactNode }) {
  const t = await getTranslations("sessionReview");
  const tReview = await getTranslations("review");
  const tProctoring = await getTranslations("proctoring");
  const format = await getFormatter();
  const { session, attempt, review } = data;
  const dateTime = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "medium" });
  const duration = (seconds: number) => {
    if (seconds < 60) return tProctoring("seconds", { seconds });
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? tProctoring("minutesSeconds", { minutes, seconds: rest }) : tProctoring("minutes", { minutes });
  };
  const totalEvents = Object.values(data.totals).reduce((sum, count) => sum + (count ?? 0), 0);
  const filtered = Boolean(data.filters.category || data.filters.severity || data.filters.source);
  const consent = attempt.consent;

  const info: [string, ReactNode][] = [
    [t("info.started"), dateTime(session.startedAt)],
    [t("info.ended"), session.endedAt ? dateTime(session.endedAt) : t("info.notEnded")],
    [t("info.duration"), duration(session.durationSec)],
    [t("info.device"), session.browser ? `${session.browser}${session.os ? ` · ${session.os}` : ""}` : t("info.unknown")],
    [t("info.camera"), session.cameraEnabled ? t("info.authorized") : t("info.notAuthorized")],
    [t("info.microphone"), session.microphoneEnabled ? t("info.microphoneAuthorized") : t("info.microphoneNotAuthorized")],
    [
      t("info.consent"),
      consent ? t("info.consentValue", { version: consent.textVersion, grantor: t(`info.grantor.${consent.grantedBy ?? "STUDENT"}`) }) : t("info.noConsent"),
    ],
    [t("info.deviceSwitches"), attempt.clientSwitches],
  ];

  return (
    <>
      <Link href={basePath} className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={t("title", { name: attempt.student.name })}
        description={t("description", { exam: attempt.exam.title, course: attempt.exam.course.name, number: attempt.number })}
        actions={
          <Badge variant={session.reviewStatus === "RECOMMENDED" ? "destructive" : "outline"}>
            {review ? tReview(`outcome.${review.outcome}`) : tReview(`status.${session.reviewStatus}`)}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t("info.title")}
                {attempt.student.isMinor ? <Badge variant="secondary">{t("info.minor")}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {info.map(([label, value]) => (
                  <div key={label} className="grid gap-0.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card data-testid="review-signals">
            <CardHeader>
              <CardTitle>{t("signals.title")}</CardTitle>
              <CardDescription>{tReview("disclaimer")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {data.signals.length ? <SignalList signals={data.signals} /> : <p className="text-muted-foreground">{t("signals.none")}</p>}
              {data.signals.length ? (
                <div className="grid gap-2 border-t pt-4">
                  {summarySlot ?? (
                    <>
                      <p className="font-medium">{t("summary.title")}</p>
                      {session.riskSummary ? <p className="whitespace-pre-line">{session.riskSummary}</p> : <p className="text-muted-foreground">{t("summary.none")}</p>}
                    </>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("timeline.title")}</CardTitle>
              <CardDescription>{t("timeline.description")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <form method="get" className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="f-category">{t("timeline.category")}</Label>
                  <NativeSelect id="f-category" name="category" defaultValue={data.filters.category ?? ""}>
                    <option value="">{t("timeline.all")}</option>
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {tProctoring(`categories.${category}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="f-severity">{t("timeline.severity")}</Label>
                  <NativeSelect id="f-severity" name="severity" defaultValue={data.filters.severity ?? ""}>
                    <option value="">{t("timeline.all")}</option>
                    {SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {tProctoring(`severity.${severity}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="f-source">{t("timeline.source")}</Label>
                  <NativeSelect id="f-source" name="source" defaultValue={data.filters.source ?? ""}>
                    <option value="">{t("timeline.all")}</option>
                    {SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {tProctoring(`source.${source}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary">
                    {t("timeline.apply")}
                  </Button>
                  {filtered ? (
                    <Link href={`${basePath}/${session.id}`} className="inline-flex h-9 items-center px-2 text-sm text-muted-foreground underline-offset-4 hover:underline">
                      {t("timeline.clear")}
                    </Link>
                  ) : null}
                </div>
              </form>

              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{t("timeline.count", { shown: data.timeline.length, total: totalEvents })}</span>
                {CATEGORIES.filter((category) => data.totals[category]).map((category) => (
                  <span key={category} className="tabular-nums">
                    {tProctoring(`categories.${category}`)} {data.totals[category]}
                  </span>
                ))}
              </p>

              {data.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("timeline.empty")}</p>
              ) : (
                <ol className="grid gap-3 border-l pl-4" data-testid="review-timeline">
                  {data.timeline.map((event) => (
                    <EventItem
                      key={event.id}
                      citedBy={event.citedBy}
                      event={{ ...event, occurredAt: event.occurredAt.toISOString() } satisfies EventView}
                    />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:sticky lg:top-6">
          <Card data-testid="review-decision">
            <CardHeader>
              <CardTitle>{t("decision.title")}</CardTitle>
              {review ? (
                <CardDescription>
                  {t("decision.current", { outcome: tReview(`outcome.${review.outcome}`) })}
                  <br />
                  {t("decision.by", { name: review.reviewer.name, date: format.dateTime(review.reviewedAt, { dateStyle: "medium", timeStyle: "short" }) })}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {data.canReview ? (
                <ReviewForm
                  sessionId={session.id}
                  initial={review ? { outcome: review.outcome, notes: review.notes } : null}
                  notesMin={NOTES_MIN_FOR_INVESTIGATION}
                  notesMax={NOTES_MAX}
                />
              ) : (
                <p className="text-muted-foreground">{t("decision.inProgress")}</p>
              )}
              <p className="text-xs text-muted-foreground">{t("decision.reminder")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("history.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
              ) : (
                <ol className="grid gap-3 text-sm" data-testid="review-history">
                  {data.history.map((entry) => {
                    const metadata = (entry.metadata ?? {}) as { outcome?: string; previousOutcome?: string | null };
                    const name = entry.actor?.name ?? "—";
                    const outcome = metadata.outcome ? tReview(`outcome.${metadata.outcome}`) : "—";
                    return (
                      <li key={entry.id} className="grid gap-0.5">
                        <span>
                          {metadata.previousOutcome && metadata.previousOutcome !== metadata.outcome
                            ? t("history.changed", { name, previous: tReview(`outcome.${metadata.previousOutcome}`), outcome })
                            : t("history.entry", { name, outcome })}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">{format.dateTime(entry.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
