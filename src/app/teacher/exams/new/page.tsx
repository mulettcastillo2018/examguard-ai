import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { listTeacherCourses } from "@/modules/courses/courses";
import { ExamSettingsForm } from "../exam-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams");
  return { title: t("newTitle") };
}

export default async function NewExamPage() {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const t = await getTranslations("exams");
  const courses = await listTeacherCourses(user);
  if (courses.length === 0) redirect("/teacher/exams");

  return (
    <>
      <Link href="/teacher/exams" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={t("newTitle")} />
      <Card>
        <CardContent>
          {/* Con un solo curso, ya queda elegido. */}
          <ExamSettingsForm courses={courses} initial={{ courseId: courses.length === 1 ? (courses[0]?.id ?? "") : "" }} />
        </CardContent>
      </Card>
    </>
  );
}
