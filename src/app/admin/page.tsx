import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuditTable } from "@/components/dashboard/audit-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { getInstitutionOverview } from "@/modules/institutions/institutions";

export default async function AdminOverviewPage() {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const t = await getTranslations("admin.overview");
  const overview = await getInstitutionOverview(user);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t("users")} value={overview.users} />
        <StatCard label={t("teachers")} value={overview.teachers} />
        <StatCard label={t("students")} value={overview.students} />
        <StatCard label={t("minors")} value={overview.minors} />
        <StatCard label={t("courses")} value={overview.courses} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("recentActivity")}</CardTitle>
          <CardAction>
            <Link href="/admin/audit" className="text-sm text-primary underline-offset-4 hover:underline">
              {t("seeAudit")}
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <AuditTable rows={overview.recentActivity} />
        </CardContent>
      </Card>
    </>
  );
}
