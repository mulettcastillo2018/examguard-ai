"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydrated } from "@/hooks/use-hydrated";
import { accommodationSchema } from "@/modules/exams/settings";
import { setAccommodationAction } from "../actions";

export interface AccommodationRow {
  student: { id: string; name: string; isMinor: boolean };
  extraMinutes: number;
  cameraExempt: boolean;
  note: string;
}

function StudentRow({ examId, row, editable }: { examId: string; row: AccommodationRow; editable: boolean }) {
  const t = useTranslations("exams.accommodations");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const hydrated = useHydrated();
  const [extra, setExtra] = useState(String(row.extraMinutes));
  const [cameraExempt, setCameraExempt] = useState(row.cameraExempt);
  const [note, setNote] = useState(row.note);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = extra !== String(row.extraMinutes) || cameraExempt !== row.cameraExempt || note !== row.note;
  const disabled = !editable || !hydrated || pending;
  const label = (field: string) => t("fieldFor", { field, name: row.student.name });

  async function save() {
    const input = { extraMinutes: /^\d+$/.test(extra.trim()) ? Number(extra.trim()) : Number.NaN, cameraExempt, note };
    const local = accommodationSchema.safeParse(input);
    if (!local.success) {
      const code = local.error.issues[0]?.message ?? "generic";
      setError(t(`errors.${code === "note" || code === "extraMinutes" ? code : "generic"}`));
      return;
    }
    setError(null);
    setPending(true);
    const result = await setAccommodationAction(examId, row.student.id, input);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(t("saved", { name: row.student.name }));
    router.refresh();
  }

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <span className="font-medium">{row.student.name}</span>
        {row.student.isMinor ? (
          <Badge variant="outline" className="ml-2">
            {tCommon("minor")}
          </Badge>
        ) : null}
        {error ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <Input
          className="w-20"
          inputMode="numeric"
          autoComplete="off"
          value={extra}
          onChange={(event) => setExtra(event.target.value)}
          disabled={disabled}
          aria-label={label(t("extraMinutes"))}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          checked={cameraExempt}
          onCheckedChange={(checked) => setCameraExempt(checked === true)}
          disabled={disabled}
          aria-label={label(t("cameraExempt"))}
        />
      </TableCell>
      <TableCell>
        <Input
          className="min-w-40"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={disabled}
          aria-label={label(t("note"))}
        />
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" onClick={save} disabled={disabled || !dirty} aria-label={`${t("save")}: ${row.student.name}`}>
          {t("save")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function AccommodationsTable({ examId, rows, editable }: { examId: string; rows: AccommodationRow[]; editable: boolean }) {
  const t = useTranslations("exams.accommodations");
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("noStudents")}</p>;
  return (
    <>
      {editable ? null : <p className="mb-3 text-sm text-muted-foreground">{t("locked")}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("student")}</TableHead>
            <TableHead>{t("extraMinutes")}</TableHead>
            <TableHead>{t("cameraExempt")}</TableHead>
            <TableHead>{t("note")}</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">{t("save")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            // La clave incluye los valores guardados: tras guardar, la fila se reinicia con ellos.
            <StudentRow key={`${row.student.id}:${row.extraMinutes}:${row.cameraExempt}:${row.note}`} examId={examId} row={row} editable={editable} />
          ))}
        </TableBody>
      </Table>
    </>
  );
}
