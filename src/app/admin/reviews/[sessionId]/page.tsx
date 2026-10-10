import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SessionReviewView } from "@/components/review/session-review";
import { NotFoundError } from "@/lib/errors";
import { requirePageUser } from "@/modules/auth/session";
import { getSessionReview, parseTimelineFilters } from "@/modules/review/review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reviews");
  return { title: t("title") };
}

// Misma revisión que el docente; el resumen con IA se genera desde el examen (lo pide el docente).
export default async function AdminSessionReviewPage({ params, searchParams }: PageProps<"/admin/reviews/[sessionId]">) {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const { sessionId } = await params;
  const data = await getSessionReview(user, sessionId, parseTimelineFilters(await searchParams)).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  return <SessionReviewView data={data} basePath="/admin/reviews" />;
}
