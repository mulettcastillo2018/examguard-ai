import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChartColumn, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { dateToZonedInput } from "@/lib/time";
import { requirePageUser } from "@/modules/auth/session";
import { listTeacherCourses } from "@/modules/courses/courses";
import { getExamForTeacher } from "@/modules/exams/exams";
import { PROCTORING_SIGNALS } from "@/modules/exams/settings";
import { listQuestions } from "@/modules/question-bank/question-bank";
import { ExamSettingsForm } from "../exam-settings-form";
import { ExamStatusBadge } from "../exam-status-badge";
import { AccommodationsTable } from "./accommodations-table";
import { AddFromBankDialog } from "./add-from-bank-dialog";
import { ExamQuestions, type ExamQuestionView } from "./exam-questions";
import { PublishPanel } from "./publish-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams");
  return { title: t("title") };
}

export default async function ExamBuilderPage({ params }: PageProps<"/teacher/exams/[id]">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id } = await params;
  const t = await getTranslations("exams");
  const format = await getFormatter();

  const data = await getExamForTeacher(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { exam, course, questions, totalPoints, students, accommodations, publishProblems, canUnpublish } = data;
  const isDraft = exam.status === "DRAFT";
  const [courses, bank] = isDraft ? await Promise.all([listTeacherCourses(user), listQuestions(user)]) : [[], null];

  const byStudent = new Map(accommodations.map((accommodation) => [accommodation.studentId, accommodation]));
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <Link href="/teacher/exams" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={exam.title}
        description={`${course.code} · ${course.name}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExamStatusBadge status={exam.status} />
            {isDraft ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/teacher/exams/${exam.id}/results`}>
                  <ChartColumn />
                  {t("resultsLink")}
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("publish.heading")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PublishPanel
              examId={exam.id}
              isDraft={isDraft}
              problems={publishProblems}
              publishedOn={exam.publishedAt ? when(exam.publishedAt) : null}
              canUnpublish={canUnpublish}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.heading")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isDraft ? (
              <ExamSettingsForm
                examId={exam.id}
                courses={courses}
                initial={{
                  title: exam.title,
                  description: exam.description ?? "",
                  instructions: exam.instructions ?? "",
                  courseId: exam.courseId,
                  startsAt: exam.startsAt ? dateToZonedInput(exam.startsAt) : "",
                  endsAt: exam.endsAt ? dateToZonedInput(exam.endsAt) : "",
                  durationMinutes: String(exam.durationMinutes),
                  maxAttempts: String(exam.maxAttempts),
                  shuffleQuestions: exam.shuffleQuestions,
                  proctoring: exam.proctoring,
                  simulationEnabled: exam.simulationEnabled,
                }}
              />
            ) : (
              // Publicado: la configuración se muestra, no se edita.
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="text-muted-foreground">{t("summary.window")}</dt>
                <dd>{exam.startsAt && exam.endsAt ? format.dateTimeRange(exam.startsAt, exam.endsAt, { dateStyle: "medium", timeStyle: "short" }) : t("noWindow")}</dd>
                <dt className="text-muted-foreground">{t("summary.duration")}</dt>
                <dd>{t("summary.durationValue", { minutes: exam.durationMinutes })}</dd>
                <dt className="text-muted-foreground">{t("summary.attempts")}</dt>
                <dd>{exam.maxAttempts}</dd>
                <dt className="text-muted-foreground">{t("summary.shuffle")}</dt>
                <dd>{exam.shuffleQuestions ? t("summary.yes") : t("summary.no")}</dd>
                <dt className="text-muted-foreground">{t("settings.proctoring")}</dt>
                <dd>
                  {PROCTORING_SIGNALS.map((signal) => `${t(`settings.signals.${signal}`)}: ${t(`settings.levels.${exam.proctoring[signal]}`)}`).join(" · ")}
                </dd>
                <dt className="text-muted-foreground">{t("settings.simulationShort")}</dt>
                <dd>{exam.simulationEnabled ? t("summary.yes") : t("summary.no")}</dd>
                <dt className="text-muted-foreground">{t("summary.instructions")}</dt>
                <dd className="whitespace-pre-line">{exam.instructions ?? t("summary.none")}</dd>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1.5">
              <CardTitle>{t("questions.heading")}</CardTitle>
              <CardDescription>
                {t("questions.summary", { count: questions.length, points: totalPoints })}
                {isDraft ? null : ` · ${t("questions.frozen")}`}
              </CardDescription>
            </div>
            {isDraft && bank ? (
              <div className="flex flex-wrap gap-2">
                <AddFromBankDialog
                  examId={exam.id}
                  bank={bank.questions.map((question) => ({
                    id: question.id,
                    type: question.type,
                    prompt: question.prompt,
                    points: question.points,
                    category: question.category,
                  }))}
                  inExam={questions.map((question) => question.sourceQuestionId).filter((value): value is string => Boolean(value))}
                />
                <Button asChild>
                  <Link href={`/teacher/exams/${exam.id}/questions/new`}>
                    <Plus />
                    {t("questions.create")}
                  </Link>
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            <ExamQuestions
              examId={exam.id}
              editable={isDraft}
              questions={questions.map(
                (question): ExamQuestionView => ({
                  id: question.id,
                  position: question.position,
                  type: question.type,
                  prompt: question.prompt,
                  points: question.points,
                  options: (question.options as ExamQuestionView["options"] | null) ?? [],
                  answerKey: (question.answerKey as Record<string, unknown> | null) ?? {},
                  valid: question.valid,
                }),
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("accommodations.heading")}</CardTitle>
            <CardDescription>{t("accommodations.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AccommodationsTable
              examId={exam.id}
              editable={exam.status === "DRAFT" || exam.status === "PUBLISHED"}
              rows={students.map((student) => {
                const saved = byStudent.get(student.id);
                return {
                  student: { id: student.id, name: student.name, isMinor: student.isMinor },
                  extraMinutes: saved?.extraMinutes ?? 0,
                  cameraExempt: saved?.cameraExempt ?? false,
                  note: saved?.note ?? "",
                };
              })}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
