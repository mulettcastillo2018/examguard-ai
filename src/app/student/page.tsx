import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { listStudentExams } from "@/modules/attempts/attempts";
import { listStudentCourses } from "@/modules/courses/courses";

export default async function StudentOverviewPage() {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const t = await getTranslations();
  const format = await getFormatter();
  const [courses, exams] = await Promise.all([listStudentCourses(user), listStudentExams(user)]);
  // Lo que puede presentar ya y lo que viene, en orden de apertura.
  const upcoming = exams.filter((exam) => exam.state === "inProgress" || exam.state === "open" || exam.state === "upcoming").slice(0, 4);
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <>
      <PageHeader title={t("student.overview.title", { name: firstName })} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("student.overview.upcomingExams")}</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("student.overview.noUpcoming")}</p>
            ) : (
              <ul className="grid gap-2">
                {upcoming.map((exam) => (
                  <li key={exam.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <span className="grid gap-0.5">
                      <Link href={`/student/exams/${exam.id}`} className="font-medium underline-offset-4 hover:underline">
                        {exam.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {exam.course.code} · {exam.startsAt ? format.dateTime(exam.startsAt, { dateStyle: "medium", timeStyle: "short" }) : ""}
                      </span>
                    </span>
                    <Badge variant={exam.state === "upcoming" ? "outline" : "default"}>{t(`studentExams.state.${exam.state}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              {t("student.overview.privacyTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <p>{t("student.overview.privacyText")}</p>
            {user.isMinor ? <p className="font-medium text-foreground">{t("student.overview.guardianNotice")}</p> : null}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("student.overview.myCourses")}</CardTitle>
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => (
                <li key={course.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{course.name}</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {course.code}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.teachers.map(({ teacher }) => teacher.name).join(", ") || t("common.teachers", { count: 0 })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
