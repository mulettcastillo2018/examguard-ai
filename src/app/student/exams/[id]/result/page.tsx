import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { getStudentResult } from "@/modules/attempts/results";
import { requirePageUser } from "@/modules/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExams.result");
  return { title: t("title") };
}

/** La respuesta del estudiante, en texto (sin marcar cuál era la correcta). */
function describeAnswer(type: string, value: unknown, options: { id: string; label: string }[], labels: { trueLabel: string; falseLabel: string }) {
  const data = (value ?? {}) as { optionId?: string | null; optionIds?: string[]; value?: boolean | null; text?: string };
  const label = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  switch (type) {
    case "SINGLE_CHOICE":
      return data.optionId ? label(data.optionId) : null;
    case "MULTIPLE_CHOICE":
      return data.optionIds?.length ? data.optionIds.map(label).join(" · ") : null;
    case "TRUE_FALSE":
      return data.value == null ? null : data.value ? labels.trueLabel : labels.falseLabel;
    default:
      return data.text?.trim() ? data.text : null;
  }
}

export default async function StudentResultPage({ params }: PageProps<"/student/exams/[id]/result">) {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const { id } = await params;
  const t = await getTranslations("studentExams");
  const tTypes = await getTranslations("questionBank.types");
  const result = await getStudentResult(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ConflictError) return null;
    throw error;
  });

  return (
    <>
      <Link href="/student/exams" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("lobby.back")}
      </Link>
      {!result ? (
        <Alert>
          <AlertDescription>{t("result.notPublished")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <PageHeader title={result.exam.title} description={`${result.exam.course.code} · ${result.exam.course.name}`} />
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("result.title")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {result.best ? (
                  <>
                    <p className="text-3xl font-semibold tabular-nums" data-testid="result-score">
                      {t("result.score", { score: result.best.score ?? 0, max: result.best.maxScore })}
                    </p>
                    {result.attempts.length > 1 ? (
                      <div className="grid gap-1 text-sm text-muted-foreground">
                        <p>{t("result.best", { number: result.best.number })}</p>
                        <ul className="ml-5 list-disc">
                          {result.attempts.map((attempt) => (
                            <li key={attempt.id}>{t("result.attemptLine", { number: attempt.number, score: attempt.score ?? 0, max: attempt.maxScore })}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("state.missed")}</p>
                )}
                <p className="text-xs text-muted-foreground">{t("result.noKeyNotice")}</p>
              </CardContent>
            </Card>

            {result.answers.length ? (
              <ol className="grid gap-3">
                {result.answers.map((answer, index) => {
                  const text = describeAnswer(answer.question.type, answer.value, answer.question.options, {
                    trueLabel: t("attempt.trueLabel"),
                    falseLabel: t("attempt.falseLabel"),
                  });
                  return (
                    <li key={answer.question.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          {index + 1}. <Badge variant="secondary">{tTypes(answer.question.type)}</Badge>
                        </span>
                        <span className="text-sm font-medium tabular-nums">
                          {t("result.points", { awarded: answer.pointsAwarded ?? 0, points: answer.question.points })}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-line">{answer.question.prompt}</p>
                      <div className="mt-3 grid gap-1 text-sm">
                        <span className="text-muted-foreground">{t("result.yourAnswer")}</span>
                        <p className={text ? "whitespace-pre-line" : "text-muted-foreground italic"}>{text ?? t("result.noAnswer")}</p>
                      </div>
                      {answer.feedback ? (
                        <div className="mt-3 grid gap-1 rounded-md bg-muted/60 p-3 text-sm">
                          <span className="font-medium">{t("result.feedback")}</span>
                          <p className="whitespace-pre-line">{answer.feedback}</p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
