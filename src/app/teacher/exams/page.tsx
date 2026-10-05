import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageUser } from "@/modules/auth/session";
import { listTeacherCourses } from "@/modules/courses/courses";
import { listTeacherExams } from "@/modules/exams/exams";
import { ExamRowActions } from "./exam-row-actions";
import { ExamStatusBadge } from "./exam-status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams");
  return { title: t("title") };
}

export default async function TeacherExamsPage() {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const t = await getTranslations("exams");
  const format = await getFormatter();
  const [exams, courses] = await Promise.all([listTeacherExams(user), listTeacherCourses(user)]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          courses.length ? (
            <Button asChild>
              <Link href="/teacher/exams/new">
                <Plus />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent>
          {exams.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{courses.length ? t("empty") : t("noCourses")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.title")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("columns.window")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link href={`/teacher/exams/${exam.id}`} className="font-medium underline-offset-4 hover:underline">
                        {exam.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {exam.course.code} · {exam.course.name}
                        </span>
                        <span>{t("questionsSummary", { count: exam.questionCount, points: exam.totalPoints })}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {exam.startsAt && exam.endsAt
                        ? format.dateTimeRange(exam.startsAt, exam.endsAt, { dateStyle: "medium", timeStyle: "short" })
                        : t("noWindow")}
                    </TableCell>
                    <TableCell>
                      <ExamStatusBadge status={exam.status} />
                    </TableCell>
                    <TableCell>
                      <ExamRowActions exam={{ id: exam.id, title: exam.title, isDraft: exam.status === "DRAFT" }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
