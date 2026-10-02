import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageUser } from "@/modules/auth/session";
import { listInstitutionUsers } from "@/modules/users/users";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.users");
  return { title: t("title") };
}

export default async function AdminUsersPage() {
  const user = await requirePageUser({ roles: ["ADMIN"] });
  const t = await getTranslations();
  const users = await listInstitutionUsers(user);

  return (
    <>
      <PageHeader title={t("admin.users.title")} description={t("admin.users.description")} />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.users.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("admin.users.email")}</TableHead>
                <TableHead>{t("admin.users.role")}</TableHead>
                <TableHead>{t("admin.users.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{row.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{t(`roles.${row.role}`)}</Badge>
                      {row.isMinor ? <Badge variant="outline">{t("common.minor")}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.active ? t("admin.users.active") : <Badge variant="destructive">{t("common.inactive")}</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
