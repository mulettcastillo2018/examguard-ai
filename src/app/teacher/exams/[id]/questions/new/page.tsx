import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { QuestionEditor } from "@/components/questions/question-editor";
import { Card, CardContent } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getExamForTeacher } from "@/modules/exams/exams";
import { getQuestionFacets } from "@/modules/question-bank/question-bank";
import { saveExamQuestionAction } from "../../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams.questions");
  return { title: t("newTitle") };
}

export default async function NewExamQuestionPage({ params }: PageProps<"/teacher/exams/[id]/questions/new">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id } = await params;
  const t = await getTranslations("exams.questions");
  const [{ exam }, { categories }] = await Promise.all([
    getExamForTeacher(user, id).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getQuestionFacets(user),
  ]);
  // Publicado, el examen está congelado.
  if (exam.status !== "DRAFT") redirect(`/teacher/exams/${exam.id}`);
  const returnTo = `/teacher/exams/${exam.id}`;

  return (
    <>
      <Link href={returnTo} className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={t("newTitle")} description={exam.title} />
      <Card>
        <CardContent>
          <QuestionEditor categories={categories} save={saveExamQuestionAction.bind(null, exam.id, null)} returnTo={returnTo} offerBankCopy />
        </CardContent>
      </Card>
    </>
  );
}
