"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download, FileDown, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { importUsersAction, type ImportActionData } from "../actions";

// Descarga un texto como archivo CSV, con BOM para que Excel respete las tildes.
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const csvCell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function ImportForm({ template }: { template: string }) {
  const t = useTranslations("admin.import");
  const hydrated = useHydrated();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ImportActionData, { ok: true }> | null>(null);
  const router = useRouter();

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setText(await file.text());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    const response = await importUsersAction(text);
    setPending(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    if (!response.data.ok) {
      setError(t(`errors.${response.data.error}`, { columns: response.data.missing.join(", ") }));
      return;
    }
    setResult(response.data);
    router.refresh();
  }

  function downloadCredentials() {
    if (!result) return;
    const lines = ["nombre;correo;contraseña_temporal"];
    for (const row of result.results) {
      if (row.status === "created") lines.push([row.name, row.email, row.temporaryPassword].map(csvCell).join(";"));
    }
    downloadCsv("credenciales-temporales.csv", `${lines.join("\n")}\n`);
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={onSubmit}>
        {/* Deshabilitado hasta hidratar: lo pegado antes no llegaría al estado. */}
        <fieldset disabled={!hydrated || pending} className="grid min-w-0 gap-4">
          <p className="text-sm text-muted-foreground">{t("columnsHelp")}</p>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv("plantilla-usuarios.csv", template)}>
              <FileDown />
              {t("template")}
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="import-file">{t("file")}</Label>
            <Input id="import-file" type="file" accept=".csv,text/csv" onChange={onFile} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="import-text">{t("paste")}</Label>
            <Textarea
              id="import-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("pastePlaceholder")}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div>
            <Button type="submit" disabled={pending || !text.trim()}>
              <Upload />
              {pending ? t("submitting") : t("submit")}
            </Button>
          </div>
        </fieldset>
      </form>

      {result ? (
        <div className="grid gap-4">
          <p className="font-medium" data-testid="import-summary">
            {t("summary", result.summary)}
          </p>
          {result.summary.created > 0 ? (
            <Alert>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{t("credentialsWarning")}</span>
                <Button type="button" size="sm" onClick={downloadCredentials}>
                  <Download />
                  {t("downloadCredentials")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("line")}</TableHead>
                <TableHead>{t("person")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("detail")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.results.map((row) => (
                <TableRow key={`${row.line}-${row.email ?? ""}`}>
                  <TableCell className="tabular-nums">{row.line}</TableCell>
                  <TableCell>{row.status === "created" ? `${row.name} · ${row.email}` : (row.email ?? "—")}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "created" ? "secondary" : row.status === "exists" ? "outline" : "destructive"}>
                      {t(`statuses.${row.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {row.status === "invalid"
                      ? t(`errors.${row.error}`)
                      : row.status === "created" && row.unknownCourses.length
                        ? t("unknownCourses", { codes: row.unknownCourses.join(", ") })
                        : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
