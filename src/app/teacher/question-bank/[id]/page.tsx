import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import type { QuestionType } from "@/modules/question-bank/content";
import { getQuestion, getQuestionFacets } from "@/modules/question-bank/question-bank";
import { QuestionEditor, type QuestionDraft } from "@/components/questions/question-editor";
import { saveQuestionAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questionBank");
  return { title: t("editTitle") };
}

export default async function EditQuestionPage({ params }: PageProps<"/teacher/question-bank/[id]">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id } = await params;
  const t = await getTranslations("questionBank");

  const [question, { categories }] = await Promise.all([
    getQuestion(user, id).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getQuestionFacets(user),
  ]);

  // Esta página es solo del docente dueño, así que el editor sí recibe la clave.
  const draft: QuestionDraft = {
    type: question.type as QuestionType,
    prompt: question.prompt,
    points: question.points,
    options: (question.options as QuestionDraft["options"] | null) ?? [],
    answerKey: (question.answerKey as Record<string, unknown> | null) ?? {},
    category: question.category,
    tags: question.tags,
  };

  return (
    <>
      <Link href="/teacher/question-bank" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={t("editTitle")} />
      {question.archivedAt ? (
        <Badge variant="destructive" className="mb-4">
          {t("archivedBadge")}
        </Badge>
      ) : null}
      <Card>
        <CardContent>
          <QuestionEditor
            initial={draft}
            categories={categories}
            save={saveQuestionAction.bind(null, question.id)}
            returnTo="/teacher/question-bank"
          />
        </CardContent>
      </Card>
    </>
  );
}
