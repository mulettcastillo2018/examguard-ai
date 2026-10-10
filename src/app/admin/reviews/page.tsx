import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReviewQueue } from "@/components/review/review-queue";
import { requirePageUser } from "@/modules/auth/session";
import { listReviewQueue, parseQueueFilter } from "@/modules/review/review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reviews");
  return { title: t("title") };
}

// El administrador ve las sesiones de toda la institución (y también puede revisarlas).
export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const { status } = await searchParams;
  const data = await listReviewQueue(user, parseQueueFilter(status));
  return <ReviewQueue data={data} basePath="/admin/reviews" />;
}
