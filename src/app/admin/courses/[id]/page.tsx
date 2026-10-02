import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getCourseForAdmin } from "@/modules/courses/courses";
import { EditCourseForm } from "../course-form";
import { MembersPicker } from "./members-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.courses");
  return { title: t("title") };
}

export default async function AdminCourseDetailPage({ params }: PageProps<"/admin/courses/[id]">) {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const { id } = await params;
  const t = await getTranslations("admin.courses");

  const detail = await getCourseForAdmin(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <>
      <Link href="/admin/courses" className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("detail.back")}
      </Link>
      <PageHeader title={`${detail.course.name}`} description={`${detail.course.code} · ${detail.course.period}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("form.editTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EditCourseForm course={detail.course} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.teachersTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <MembersPicker courseId={detail.course.id} kind="teachers" people={detail.teachers} initialSelected={detail.teacherIds} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.studentsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <MembersPicker courseId={detail.course.id} kind="students" people={detail.students} initialSelected={detail.studentIds} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
