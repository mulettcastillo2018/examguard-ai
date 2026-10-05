import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listStudentExams } from "@/modules/attempts/attempts";
import { requirePageUser } from "@/modules/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentResults");
  return { title: t("title") };
}

export default async function StudentResultsPage() {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const t = await getTranslations("studentResults");
  const exams = (await listStudentExams(user)).filter((exam) => exam.resultsPublished && exam.attemptsUsed > 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent>
          {exams.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="grid gap-3">
              {exams.map((exam) => (
                <li key={exam.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid gap-1">
                    <span className="font-medium">{exam.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {exam.course.code} · {exam.course.name}
                    </span>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/student/exams/${exam.id}/result`}>{t("open")}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
