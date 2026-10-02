import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuditTable } from "@/components/dashboard/audit-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { getInstitutionAudit } from "@/modules/institutions/institutions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.audit");
  return { title: t("title") };
}

export default async function AdminAuditPage() {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const t = await getTranslations("admin.audit");
  const rows = await getInstitutionAudit(user);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent>
          <AuditTable rows={rows} />
        </CardContent>
      </Card>
    </>
  );
}
