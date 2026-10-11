"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/hooks/use-hydrated";
import { recordGuardianConsentAction, revokeGuardianConsentAction } from "./actions";

type Field = "guardianName" | "relationship" | "evidence" | "camera";
const FIELDS: Field[] = ["guardianName", "relationship", "evidence", "camera"];

/** Registra (o reemplaza) la autorización del acudiente. */
export function GuardianForm({ studentId, replacing }: { studentId: string; replacing: boolean }) {
  const t = useTranslations("admin.guardian");
  const router = useRouter();
  const hydrated = useHydrated();
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [camera, setCamera] = useState(false);
  const [microphone, setMicrophone] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await recordGuardianConsentAction(studentId, { guardianName, relationship, camera, microphone, evidence });
    setPending(false);
    if (!result.ok) {
      const next: Partial<Record<Field, string>> = {};
      for (const code of result.codes ?? []) {
        const field = code === "nothingAuthorized" ? "camera" : FIELDS.find((name) => name === code);
        if (field) next[field] = t(`errors.${code as "guardianName" | "relationship" | "evidence" | "nothingAuthorized"}`);
      }
      setErrors(next);
      if (!Object.keys(next).length) toast.error(result.error);
      return;
    }
    setErrors({});
    setGuardianName("");
    setRelationship("");
    setCamera(false);
    setMicrophone(false);
    setEvidence("");
    toast.success(t("form.saved"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="guardian-form">
      <fieldset disabled={!hydrated || pending} className="grid gap-4">
        {replacing ? <p className="text-sm text-muted-foreground">{t("form.replaceHint")}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="guardian-name">{t("form.guardianName")}</Label>
            <Input id="guardian-name" value={guardianName} onChange={(event) => setGuardianName(event.target.value)} aria-invalid={Boolean(errors.guardianName)} />
            {errors.guardianName ? <p className="text-sm text-destructive">{errors.guardianName}</p> : null}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="guardian-relationship">{t("form.relationship")}</Label>
            <Input
              id="guardian-relationship"
              value={relationship}
              placeholder={t("form.relationshipPlaceholder")}
              onChange={(event) => setRelationship(event.target.value)}
              aria-invalid={Boolean(errors.relationship)}
            />
            {errors.relationship ? <p className="text-sm text-destructive">{errors.relationship}</p> : null}
          </div>
        </div>
        <div className="grid gap-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={camera} onCheckedChange={(checked) => setCamera(checked === true)} />
            {t("form.camera")}
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={microphone} onCheckedChange={(checked) => setMicrophone(checked === true)} />
            {t("form.microphone")}
          </Label>
          {errors.camera ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.camera}
            </p>
          ) : null}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="guardian-evidence">{t("form.evidence")}</Label>
          <Input
            id="guardian-evidence"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            aria-describedby="guardian-evidence-hint"
            aria-invalid={Boolean(errors.evidence)}
          />
          <p id="guardian-evidence-hint" className="text-xs text-muted-foreground">
            {t("form.evidenceHint")}
          </p>
          {errors.evidence ? <p className="text-sm text-destructive">{errors.evidence}</p> : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("form.reminder")}</p>
        <div>
          <Button type="submit">{pending ? t("form.saving") : t("form.save")}</Button>
        </div>
      </fieldset>
    </form>
  );
}

/** Deja sin efecto la autorización vigente, con confirmación. */
export function RevokeGuardianConsent({ studentId, studentName }: { studentId: string; studentName: string }) {
  const t = useTranslations("admin.guardian.revoke");
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    const result = await revokeGuardianConsentAction(studentId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("done"));
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={!hydrated || pending}>
          {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description", { name: studentName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void revoke()}>{t("confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
