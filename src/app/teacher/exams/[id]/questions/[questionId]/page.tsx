import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { QuestionEditor, type QuestionDraft } from "@/components/questions/question-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getExamQuestion } from "@/modules/exams/exams";
import { saveExamQuestionAction } from "../../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams.questions");
  return { title: t("editTitle") };
}

export default async function EditExamQuestionPage({ params }: PageProps<"/teacher/exams/[id]/questions/[questionId]">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id, questionId } = await params;
  const t = await getTranslations("exams.questions");
  const { exam, question } = await getExamQuestion(user, id, questionId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  if (exam.status !== "DRAFT") redirect(`/teacher/exams/${exam.id}`);
  const returnTo = `/teacher/exams/${exam.id}`;

  // La copia del examen no tiene categoría ni etiquetas: esas viven en el banco.
  const draft: QuestionDraft = {
    type: question.type,
    prompt: question.prompt,
    points: question.points,
    options: (question.options as QuestionDraft["options"] | null) ?? [],
    answerKey: (question.answerKey as Record<string, unknown> | null) ?? {},
    category: null,
    tags: [],
  };

  return (
    <>
      <Link href={returnTo} className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={t("editTitle")} description={`${exam.title} · ${t("number", { number: question.position })}`} />
      {question.sourceQuestionId ? (
        <Alert className="mb-4">
          <AlertDescription>{t("copyNotice")}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <QuestionEditor initial={draft} save={saveExamQuestionAction.bind(null, exam.id, question.id)} returnTo={returnTo} showMeta={false} />
        </CardContent>
      </Card>
    </>
  );
}
