import { getTranslations } from "next-intl/server";
import { CoursesTable } from "@/components/dashboard/courses-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { listTeacherCourses } from "@/modules/courses/courses";

export default async function TeacherOverviewPage() {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const t = await getTranslations();
  const courses = await listTeacherCourses(user);

  // Indicadores de la sección 11 de la especificación; se llenan con los exámenes (Fases 2, 3 y 6).
  return (
    <>
      <PageHeader title={t("teacher.overview.title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("teacher.overview.examsCreated")} value={null} hint={t("common.notAvailableYet", { phase: 2 })} />
        <StatCard label={t("teacher.overview.examsActive")} value={null} hint={t("common.notAvailableYet", { phase: 3 })} />
        <StatCard label={t("teacher.overview.studentsEvaluated")} value={null} hint={t("common.notAvailableYet", { phase: 3 })} />
        <StatCard label={t("teacher.overview.pendingSessions")} value={null} hint={t("common.notAvailableYet", { phase: 6 })} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("teacher.overview.myCourses")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CoursesTable courses={courses} showTeachers={false} />
        </CardContent>
      </Card>
    </>
  );
}
