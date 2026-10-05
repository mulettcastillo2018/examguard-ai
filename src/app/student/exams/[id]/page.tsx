import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Play } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { getExamLobby } from "@/modules/attempts/attempts";
import { requirePageUser } from "@/modules/auth/session";
import { StartExam } from "./start-exam";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExams");
  return { title: t("title") };
}

export default async function ExamLobbyPage({ params }: PageProps<"/student/exams/[id]">) {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const { id } = await params;
  const t = await getTranslations("studentExams");
  const tBank = await getTranslations("questionBank");
  const format = await getFormatter();
  const lobby = await getExamLobby(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { exam } = lobby;

  return (
    <>
      <Link href="/student/exams" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("lobby.back")}
      </Link>
      <PageHeader title={exam.title} description={`${lobby.course.code} · ${lobby.course.name}`} />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{t("lobby.window")}</dt>
              <dd>{exam.startsAt && exam.endsAt ? format.dateTimeRange(exam.startsAt, exam.endsAt, { dateStyle: "medium", timeStyle: "short" }) : t("noWindow")}</dd>
              <dt className="text-muted-foreground">{t("lobby.duration")}</dt>
              <dd>
                {t("duration", { minutes: exam.durationMinutes + lobby.extraMinutes })}
                {lobby.extraMinutes ? <span className="block text-muted-foreground">{t("lobby.extra", { minutes: lobby.extraMinutes })}</span> : null}
              </dd>
              <dt className="text-muted-foreground">{t("lobby.questions")}</dt>
              <dd>
                {exam.questionCount} · {tBank("points", { points: exam.totalPoints })}
              </dd>
              <dt className="text-muted-foreground">{t("lobby.attempts")}</dt>
              <dd>{t("attempts", { used: lobby.attemptsUsed, max: exam.maxAttempts })}</dd>
            </dl>
            {exam.description ? <p className="mt-4 text-sm">{exam.description}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("lobby.instructions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{exam.instructions ?? t("lobby.noInstructions")}</p>
          </CardContent>
        </Card>

        {lobby.attemptsUsed > 0 && !lobby.inProgressAttemptId ? (
          <Alert>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t("lobby.submitted")} {exam.resultsPublished ? t("lobby.resultsReady") : t("lobby.resultsPending")}
              </span>
              {exam.resultsPublished ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/student/exams/${exam.id}/result`}>{t("result")}</Link>
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {lobby.inProgressAttemptId ? (
          <div>
            <Button asChild>
              <Link href={`/take/${lobby.inProgressAttemptId}`}>
                <Play />
                {t("lobby.continue")}
              </Link>
            </Button>
          </div>
        ) : lobby.blocked ? (
          lobby.blocked === "noAttemptsLeft" && lobby.attemptsUsed > 0 ? null : (
            <Alert>
              <AlertDescription>
                {lobby.blocked === "upcoming" && exam.startsAt
                  ? t("lobby.blocked.upcoming", { date: format.dateTime(exam.startsAt, { dateStyle: "full", timeStyle: "short" }) })
                  : t(`lobby.blocked.${lobby.blocked}`)}
              </AlertDescription>
            </Alert>
          )
        ) : (
          <StartExam examId={exam.id} requests={lobby.requests} isMinor={lobby.isMinor} cameraExempt={lobby.cameraExempt} consent={lobby.consent} />
        )}
      </div>
    </>
  );
}
