import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReviewQueue } from "@/components/review/review-queue";
import { requirePageUser } from "@/modules/auth/session";
import { listReviewQueue, parseQueueFilter } from "@/modules/review/review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reviews");
  return { title: t("title") };
}

export default async function TeacherReviewsPage({ searchParams }: PageProps<"/teacher/reviews">) {
  const user = await requirePageUser({ roles: ["TEACHER"] });
  const { status } = await searchParams;
  const data = await listReviewQueue(user, parseQueueFilter(status));
  return <ReviewQueue data={data} basePath="/teacher/reviews" />;
}
