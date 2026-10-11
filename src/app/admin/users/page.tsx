import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageUser } from "@/modules/auth/session";
import { listInstitutionUsers } from "@/modules/users/users";
import { UserFormDialog } from "./user-form-dialog";
import { UserRowActions } from "./user-row-actions";

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
      <PageHeader
        title={t("admin.users.title")}
        description={t("admin.users.description")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/users/import">
                <Upload />
                {t("admin.users.import")}
              </Link>
            </Button>
            <UserFormDialog
              trigger={
                <Button>
                  <Plus />
                  {t("admin.users.new")}
                </Button>
              }
            />
          </>
        }
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.users.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("admin.users.email")}</TableHead>
                <TableHead>{t("admin.users.role")}</TableHead>
                <TableHead>{t("admin.users.status")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("admin.users.actions")}</span>
                </TableHead>
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
                      {row.isMinor && !row.guardianConsent ? <Badge variant="outline">{t("admin.guardian.missingBadge")}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.active ? (
                        <span className="text-sm">{t("admin.users.active")}</span>
                      ) : (
                        <Badge variant="destructive">{t("common.inactive")}</Badge>
                      )}
                      {row.mustChangePassword ? <Badge variant="outline">{t("admin.users.pendingPassword")}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={{ id: row.id, name: row.name, email: row.email, role: row.role, isMinor: row.isMinor, active: row.active }}
                      isSelf={row.id === user.id}
                    />
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
