import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SessionReviewView } from "@/components/review/session-review";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getSessionReview, parseTimelineFilters } from "@/modules/review/review";
import { SummaryPanel } from "../../exams/[id]/results/[attemptId]/summary-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reviews");
  return { title: t("title") };
}

export default async function TeacherSessionReviewPage({ params, searchParams }: PageProps<"/teacher/reviews/[sessionId]">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { sessionId } = await params;
  const data = await getSessionReview(user, sessionId, parseTimelineFilters(await searchParams)).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { session, attempt } = data;
  return (
    <SessionReviewView
      data={data}
      basePath="/teacher/reviews"
      summarySlot={
        <SummaryPanel
          examId={attempt.exam.id}
          attemptId={attempt.id}
          initial={session.riskSummary ? { text: session.riskSummary, source: session.riskSummaryProvider ?? "template" } : null}
          disclaimer={false}
        />
      }
    />
  );
}
