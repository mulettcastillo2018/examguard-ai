import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NotFoundError } from "@/lib/errors";
import { describeAnswer } from "@/modules/attempts/describe";
import { getExamResults } from "@/modules/attempts/results";
import { requirePageUser } from "@/modules/auth/session";
import type { QuestionType } from "@/modules/question-bank/content";
import { GradeForm } from "./grade-form";
import { ResultsPanel } from "./results-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("examResults");
  return { title: t("title") };
}

export default async function ExamResultsPage({ params }: PageProps<"/teacher/exams/[id]/results">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id } = await params;
  const t = await getTranslations("examResults");
  const tAttempt = await getTranslations("studentExams.attempt");
  const tCommon = await getTranslations("common");
  const tReview = await getTranslations("review");
  const format = await getFormatter();
  const results = await getExamResults(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { exam } = results;
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  const labels = { trueLabel: tAttempt("trueLabel"), falseLabel: tAttempt("falseLabel") };

  return (
    <>
      <Link href={`/teacher/exams/${exam.id}`} className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={exam.title} description={t("title")} />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("publish.heading")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsPanel
              examId={exam.id}
              problems={results.publishProblems}
              endsAtLabel={exam.endsAt ? when(exam.endsAt) : ""}
              publishedOn={exam.resultsPublishedAt ? when(exam.resultsPublishedAt) : null}
              canClose={exam.status === "PUBLISHED" && results.publishProblems.includes("windowOpen")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pending.heading")}</CardTitle>
            <CardDescription>{t("pending.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {results.pending.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("pending.empty")}</p>
            ) : (
              <ol className="grid gap-4">
                {results.pending.map((answer) => {
                  const text = describeAnswer(answer.question.type as QuestionType, answer.value, [], labels);
                  const rubric = (answer.question.answerKey as { rubric?: string } | null)?.rubric;
                  return (
                    <li key={answer.id} className="grid gap-3 rounded-lg border p-4" data-testid="pending-answer">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                        <span>{t("pending.question", { number: answer.question.position })}</span>
                        <span className="font-medium text-foreground">{t("pending.student", { name: answer.studentName, number: answer.attemptNumber })}</span>
                      </div>
                      <p className="whitespace-pre-line">{answer.question.prompt}</p>
                      <div className="grid gap-1 text-sm">
                        <span className="text-muted-foreground">{t("pending.answer")}</span>
                        <p className={text ? "whitespace-pre-line rounded-md bg-muted/60 p-3" : "text-muted-foreground italic"}>{text ?? t("pending.noAnswer")}</p>
                      </div>
                      {rubric ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{t("pending.guide")}:</span> {rubric}
                        </p>
                      ) : null}
                      <GradeForm examId={exam.id} answerId={answer.id} maxPoints={answer.question.points} />
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("students.heading")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("students.name")}</TableHead>
                  <TableHead>{t("students.state")}</TableHead>
                  <TableHead className="text-right">{t("students.best")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("students.attempts")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.rows.map((row) => {
                  const state = row.attempts.length === 0 ? "notStarted" : row.inProgress ? "inProgress" : row.pendingManual ? "pending" : "graded";
                  const latest = row.attempts.at(-1);
                  return (
                    <TableRow key={row.student.id}>
                      <TableCell className="whitespace-normal">
                        {latest ? (
                          <Link href={`/teacher/exams/${exam.id}/results/${latest.id}`} className="font-medium underline-offset-4 hover:underline">
                            {row.student.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{row.student.name}</span>
                        )}
                        {row.student.isMinor ? (
                          <Badge variant="outline" className="ml-2">
                            {tCommon("minor")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={state === "graded" ? "default" : state === "notStarted" ? "outline" : "secondary"}>{t(`students.${state}`)}</Badge>
                          {row.reviewRecommended ? <Badge variant="destructive">{tReview("status.RECOMMENDED")}</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.best === null ? "—" : t("students.score", { score: row.best, max: results.maxScore })}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-wrap gap-2 text-sm">
                          {row.attempts.map((attempt) => (
                            <Link key={attempt.id} href={`/teacher/exams/${exam.id}/results/${attempt.id}`} className="text-muted-foreground underline-offset-4 hover:underline">
                              #{attempt.number}
                            </Link>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
