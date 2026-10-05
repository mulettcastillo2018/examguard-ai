import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const VARIANTS = {
  DRAFT: "outline",
  PUBLISHED: "default",
  CLOSED: "secondary",
  ARCHIVED: "secondary",
} as const;

export function ExamStatusBadge({ status }: { status: keyof typeof VARIANTS }) {
  const t = useTranslations("exams.status");
  return <Badge variant={VARIANTS[status]}>{t(status)}</Badge>;
}
