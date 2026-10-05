import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listStudentExams, type StudentExamState } from "@/modules/attempts/attempts";
import { requirePageUser } from "@/modules/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExams");
  return { title: t("title") };
}

const GROUPS: { key: "now" | "upcoming" | "past"; states: StudentExamState[] }[] = [
  { key: "now", states: ["inProgress", "open"] },
  { key: "upcoming", states: ["upcoming"] },
  { key: "past", states: ["finished", "missed"] },
];

const BADGE: Record<StudentExamState, "default" | "secondary" | "outline"> = {
  inProgress: "default",
  open: "default",
  upcoming: "outline",
  finished: "secondary",
  missed: "outline",
};

export default async function StudentExamsPage() {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const t = await getTranslations("studentExams");
  const format = await getFormatter();
  const exams = await listStudentExams(user);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {exams.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {GROUPS.map((group) => {
            const items = exams.filter((exam) => group.states.includes(exam.state));
            if (items.length === 0) return null;
            return (
              <Card key={group.key}>
                <CardHeader>
                  <CardTitle>{t(`groups.${group.key}`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-3">
                    {items.map((exam) => (
                      <li key={exam.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="student-exam">
                        <div className="grid min-w-0 gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{exam.title}</span>
                            <Badge variant={BADGE[exam.state]}>{t(`state.${exam.state}`)}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {exam.course.code} · {exam.course.name} · {t("duration", { minutes: exam.durationMinutes })} ·{" "}
                            {t("attempts", { used: exam.attemptsUsed, max: exam.maxAttempts })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {exam.startsAt && exam.endsAt
                              ? format.dateTimeRange(exam.startsAt, exam.endsAt, { dateStyle: "medium", timeStyle: "short" })
                              : t("noWindow")}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {exam.state === "finished" && exam.resultsPublished ? (
                            <Button asChild variant="outline">
                              <Link href={`/student/exams/${exam.id}/result`}>{t("result")}</Link>
                            </Button>
                          ) : exam.state === "finished" ? (
                            <span className="text-sm text-muted-foreground">{t("resultsPending")}</span>
                          ) : exam.state === "missed" ? null : (
                            <Button asChild variant={exam.state === "upcoming" ? "outline" : "default"}>
                              <Link href={`/student/exams/${exam.id}`}>{exam.state === "inProgress" ? t("continue") : t("go")}</Link>
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
