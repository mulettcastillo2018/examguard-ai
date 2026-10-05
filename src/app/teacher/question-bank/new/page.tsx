import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { getQuestionFacets } from "@/modules/question-bank/question-bank";
import { QuestionEditor } from "@/components/questions/question-editor";
import { saveQuestionAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("questionBank");
  return { title: t("newTitle") };
}

export default async function NewQuestionPage() {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const t = await getTranslations("questionBank");
  const { categories } = await getQuestionFacets(user);

  return (
    <>
      <Link href="/teacher/question-bank" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={t("newTitle")} />
      <Card>
        <CardContent>
          <QuestionEditor categories={categories} save={saveQuestionAction.bind(null, null)} returnTo="/teacher/question-bank" />
        </CardContent>
      </Card>
    </>
  );
}
