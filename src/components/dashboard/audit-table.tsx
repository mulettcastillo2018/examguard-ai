import { getFormatter, getTranslations } from "next-intl/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AUDIT_ACTIONS, type AuditAction } from "@/modules/audit";

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  createdAt: Date;
  ip: string | null;
  actor: { name: string; email: string } | null;
}

const isKnownAction = (action: string): action is AuditAction =>
  (AUDIT_ACTIONS as readonly string[]).includes(action);

export async function AuditTable({ rows }: { rows: AuditRow[] }) {
  const t = await getTranslations();
  const format = await getFormatter();

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("common.empty")}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("admin.audit.when")}</TableHead>
          <TableHead>{t("admin.audit.who")}</TableHead>
          <TableHead>{t("admin.audit.action")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("admin.audit.detail")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap tabular-nums">
              {format.dateTime(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}
            </TableCell>
            <TableCell>{row.actor?.name ?? t("admin.audit.system")}</TableCell>
            <TableCell>{isKnownAction(row.action) ? t(`audit.actions.${row.action}`) : row.action}</TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">
              {row.entityType}
              {row.ip ? ` · ${row.ip}` : ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
