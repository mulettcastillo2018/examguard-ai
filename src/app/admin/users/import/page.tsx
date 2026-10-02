import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/modules/auth/session";
import { IMPORT_TEMPLATE } from "@/modules/users/csv";
import { ImportForm } from "./import-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.import");
  return { title: t("title") };
}

export default async function ImportUsersPage() {
  await requirePageUser({ roles: ["ADMIN"] });
  const t = await getTranslations("admin.import");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent>
          <ImportForm template={IMPORT_TEMPLATE} />
        </CardContent>
      </Card>
      <Link href="/admin/users" className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← {t("back")}
      </Link>
    </>
  );
}
