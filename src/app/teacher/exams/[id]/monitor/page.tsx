import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import type { Jsonify } from "@/lib/api";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getExamMonitor, type ExamMonitor } from "@/modules/proctoring/monitor";
import { MonitorBoard } from "./monitor-board";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("monitor");
  return { title: t("title") };
}

export default async function ExamMonitorPage({ params }: PageProps<"/teacher/exams/[id]/monitor">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { id } = await params;
  const t = await getTranslations("monitor");
  const monitor = await getExamMonitor(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  // Mismo formato que la consulta periódica (fechas como texto).
  const initial = JSON.parse(JSON.stringify(monitor)) as Jsonify<ExamMonitor>;

  return (
    <>
      <Link href={`/teacher/exams/${id}`} className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader title={monitor.exam.title} description={t("description")} />
      <Card>
        <CardContent>
          <MonitorBoard examId={id} initial={initial} />
        </CardContent>
      </Card>
    </>
  );
}
