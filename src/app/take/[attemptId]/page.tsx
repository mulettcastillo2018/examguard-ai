import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotFoundError } from "@/lib/errors";
import { getAttemptForStudent } from "@/modules/attempts/attempts";
import { requirePageUser } from "@/modules/auth/session";
import { ExamRunner } from "./exam-runner-client";
import type { RunnerQuestion } from "./exam-runner";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studentExams");
  return { title: t("title") };
}

export default async function TakeExamPage({ params }: PageProps<"/take/[attemptId]">) {
  const user = await requirePageUser({ roles: ["STUDENT"] });
  const { attemptId } = await params;
  const view = await getAttemptForStudent(user, attemptId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  // Entregado (a mano o por tiempo): la antesala muestra el estado y el resultado.
  if (view.attempt.status !== "IN_PROGRESS") redirect(`/student/exams/${view.exam.id}`);

  return (
    <ExamRunner
      attemptId={view.attempt.id}
      examId={view.exam.id}
      title={view.exam.title}
      questions={view.questions as RunnerQuestion[]}
      initialAnswers={view.answers as Record<string, { value: unknown; version: number }>}
      deadlineAt={view.attempt.deadlineAt.toISOString()}
      serverNow={view.serverNow.toISOString()}
    />
  );
}
