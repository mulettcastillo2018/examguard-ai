import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EventItem, type EventView } from "@/components/proctoring/event-item";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getMySupervisionSession } from "@/modules/review/review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myData");
  return { title: t("title") };
}

// Los hechos de una sesión propia. Sin señales, resumen ni observaciones de quien revisa:
// eso es trabajo interno de la revisión; aquí están los datos que se registraron.
export default async function MySupervisionSessionPage({ params }: PageProps<"/student/my-data/[attemptId]">) {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const { attemptId } = await params;
  const t = await getTranslations("myData");
  const tGrantor = await getTranslations("sessionReview.info.grantor");
  const format = await getFormatter();
  const data = await getMySupervisionSession(user, attemptId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { attempt, session } = data;
  const consent = attempt.consent;
  const yesNo = (value: boolean) => (value ? t("detail.yes") : t("detail.no"));

  return (
    <>
      <Link href="/student/my-data" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("detail.back")}
      </Link>
      <PageHeader
        title={attempt.exam.title}
        description={t("detail.subtitle", { course: attempt.exam.course.name, number: attempt.number })}
        actions={<Badge variant="outline">{t(`reviewState.${data.reviewState}`)}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.authorized")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              {t("detail.camera", { state: yesNo(session.cameraEnabled) })} · {t("detail.microphone", { state: yesNo(session.microphoneEnabled) })}
            </p>
            {consent ? (
              <p className="text-muted-foreground">
                {t("detail.consent", {
                  version: consent.textVersion,
                  date: format.dateTime(consent.grantedAt, { dateStyle: "medium", timeStyle: "short" }),
                  grantor: tGrantor(consent.grantedBy ?? "STUDENT"),
                })}
              </p>
            ) : null}
            {session.browser ? <p className="text-muted-foreground">{t("detail.device", { browser: session.browser, os: session.os ?? "—" })}</p> : null}
            {data.retentionDays ? <p className="text-muted-foreground">{t("retention", { days: data.retentionDays })}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("detail.events")}</CardTitle>
            <CardDescription>{t("detail.meaning")}</CardDescription>
          </CardHeader>
          <CardContent>
            {session.evidencePurgedAt ? (
              <p className="text-sm text-muted-foreground" data-testid="my-data-purged">
                {t("detail.purged", { date: format.dateTime(session.evidencePurgedAt, { dateStyle: "medium" }) })}
              </p>
            ) : data.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noEvents")}</p>
            ) : (
              <ol className="grid gap-3 border-l pl-4" data-testid="my-data-events">
                {data.events.map((event) => (
                  <EventItem key={event.id} event={{ ...event, occurredAt: event.occurredAt.toISOString() } satisfies EventView} />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">{t("detail.question")}</p>
      </div>
    </>
  );
}
