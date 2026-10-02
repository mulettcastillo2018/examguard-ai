import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { CoursesTable } from "@/components/dashboard/courses-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { listInstitutionCourses } from "@/modules/courses/courses";
import { CreateCourseDialog } from "./course-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.courses");
  return { title: t("title") };
}

export default async function AdminCoursesPage() {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const t = await getTranslations("admin.courses");
  const courses = await listInstitutionCourses(user);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <CreateCourseDialog
            trigger={
              <Button>
                <Plus />
                {t("new")}
              </Button>
            }
          />
        }
      />
      <Card>
        <CardContent>
          <CoursesTable courses={courses} linkBase="/admin/courses" />
        </CardContent>
      </Card>
    </>
  );
}
