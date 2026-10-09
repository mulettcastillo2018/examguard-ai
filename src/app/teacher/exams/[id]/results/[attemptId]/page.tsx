import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { SignalList } from "@/components/proctoring/signal-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { labelSignals } from "@/modules/agents/labels";
import { describeAnswer, describeKey } from "@/modules/attempts/describe";
import { getAttemptDetail } from "@/modules/attempts/results";
import { requirePageUser } from "@/modules/auth/session";
import { formatPoints } from "@/modules/question-bank/content";
import { GradeForm } from "../grade-form";
import { SummaryPanel } from "./summary-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("examResults");
  return { title: t("title") };
}

export default async function AttemptDetailPage({ params }: PageProps<"/teacher/exams/[id]/results/[attemptId]">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id, attemptId } = await params;
  const t = await getTranslations("examResults");
  const tAttempt = await getTranslations("studentExams.attempt");
  const tTypes = await getTranslations("questionBank.types");
  const tReview = await getTranslations("review");
  const format = await getFormatter();
  const { attempt, answers } = await getAttemptDetail(user, id, attemptId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const labels = { trueLabel: tAttempt("trueLabel"), falseLabel: tAttempt("falseLabel") };
  const editable = attempt.status !== "IN_PROGRESS";
  const session = attempt.proctoring;
  const signals = session ? labelSignals(session.signals).map(({ id, label, severity, explanation }) => ({ id, label, severity, explanation })) : [];

  return (
    <>
      <Link href={`/teacher/exams/${id}/results`} className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("title")}
      </Link>
      <PageHeader
        title={t("detail.title", { name: attempt.student.name })}
        description={`${t("detail.attempt", { number: attempt.number })} · ${t(`detail.status.${attempt.status}`)}${
          attempt.submittedAt ? ` · ${t("detail.submittedAt", { date: format.dateTime(attempt.submittedAt, { dateStyle: "medium", timeStyle: "short" }) })}` : ""
        }`}
      />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-2xl font-semibold tabular-nums">
              {attempt.score === null ? t("detail.pendingScore") : t("detail.score", { score: attempt.score, max: attempt.maxScore })}
            </p>
            {attempt.consent ? (
              <p className="text-muted-foreground">
                {t("detail.consent", {
                  version: attempt.consent.textVersion,
                  camera: attempt.consent.camera ? t("detail.yes") : t("detail.no"),
                  microphone: attempt.consent.microphone ? t("detail.yes") : t("detail.no"),
                })}
              </p>
            ) : null}
            <p className="text-muted-foreground">
              {t("detail.deviceSwitches", { count: attempt.clientSwitches })}
              {attempt.clientSwitches ? ` ${t("detail.deviceNote")}` : ""}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="supervision-card">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{tReview("heading")}</CardTitle>
            {session ? (
              <Badge variant={session.reviewStatus === "RECOMMENDED" ? "destructive" : "outline"}>{tReview(`status.${session.reviewStatus}`)}</Badge>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {!session ? (
              <p className="text-muted-foreground">{tReview("noSession")}</p>
            ) : signals.length === 0 ? (
              <p className="text-muted-foreground">{tReview("noSignals")}</p>
            ) : (
              <>
                <div className="grid gap-2">
                  <p className="font-medium">{tReview("signals")}</p>
                  <SignalList signals={signals} />
                </div>
                <SummaryPanel
                  examId={id}
                  attemptId={attempt.id}
                  initial={session.riskSummary ? { text: session.riskSummary, source: session.riskSummaryProvider ?? "template" } : null}
                />
              </>
            )}
          </CardContent>
        </Card>

        <ol className="grid gap-3">
          {answers.map((answer) => {
            const question = answer.examQuestion;
            const options = (question.options as { id: string; label: string }[] | null) ?? [];
            const text = describeAnswer(question.type, answer.value, options, labels);
            const key = describeKey(question.type, question.answerKey, options, labels);
            const gradedLabel = answer.pointsAwarded === null ? t("detail.notGraded") : answer.autoGraded ? t("detail.autoGraded") : t("detail.manualGraded");
            return (
              <li key={answer.id} className="grid gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    {question.position}. <Badge variant="secondary">{tTypes(question.type)}</Badge>
                  </span>
                  <span className="text-sm tabular-nums">
                    <span className="font-medium">{answer.pointsAwarded === null ? "—" : formatPoints(answer.pointsAwarded)}</span> / {formatPoints(question.points)} · <span className="text-muted-foreground">{gradedLabel}</span>
                  </span>
                </div>
                <p className="whitespace-pre-line">{question.prompt}</p>
                <div className="grid gap-1 text-sm sm:grid-cols-2 sm:gap-4">
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">{t("detail.studentAnswer")}</span>
                    <p className={text ? "whitespace-pre-line" : "text-muted-foreground italic"}>{text ?? t("pending.noAnswer")}</p>
                  </div>
                  {key ? (
                    <div className="grid gap-1">
                      <span className="text-muted-foreground">{t("detail.correct")}</span>
                      <p>{key}</p>
                    </div>
                  ) : null}
                </div>
                {answer.feedback ? (
                  <p className="text-sm">
                    <span className="font-medium">{t("detail.feedback")}:</span> {answer.feedback}
                  </p>
                ) : null}
                {editable ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground underline-offset-4 hover:underline">{t("detail.adjust")}</summary>
                    <div className="mt-3">
                      <GradeForm examId={id} answerId={answer.id} maxPoints={question.points} initialPoints={answer.pointsAwarded} initialFeedback={answer.feedback} />
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
