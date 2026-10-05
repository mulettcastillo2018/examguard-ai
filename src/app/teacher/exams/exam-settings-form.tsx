"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import { zonedInputToDate } from "@/lib/time";
import {
  examSettingsSchema,
  PROCTORING_LEVELS,
  PROCTORING_SIGNALS,
  type ExamSettingsInput,
  type ProctoringConfig,
} from "@/modules/exams/settings";
import { createExamAction, updateExamSettingsAction } from "./actions";

/** Valores del formulario como texto (las fechas en la hora de Colombia). */
export interface ExamSettingsDraft {
  title: string;
  description: string;
  instructions: string;
  courseId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: string;
  maxAttempts: string;
  shuffleQuestions: boolean;
  proctoring: ProctoringConfig;
}

// Valores de un borrador nuevo. No se exporta: un componente del servidor que importe un
// valor (no un componente) de un módulo "use client" recibe una referencia, no el objeto.
const EMPTY_SETTINGS: ExamSettingsDraft = {
  title: "",
  description: "",
  instructions: "",
  courseId: "",
  startsAt: "",
  endsAt: "",
  durationMinutes: "60",
  maxAttempts: "1",
  shuffleQuestions: false,
  proctoring: { camera: "requested", microphone: "off", fullscreen: "requested" },
};

const parseWhole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

export function ExamSettingsForm({
  examId,
  initial,
  courses,
}: {
  /** Sin examId crea un borrador; con examId edita ese borrador. */
  examId?: string;
  /** Valores iniciales; lo que falte toma los de un borrador nuevo. */
  initial?: Partial<ExamSettingsDraft>;
  courses: { id: string; code: string; name: string }[];
}) {
  const t = useTranslations("exams.settings");
  const router = useRouter();
  const hydrated = useHydrated();
  const [draft, setDraft] = useState<ExamSettingsDraft>({ ...EMPTY_SETTINGS, ...initial });
  const [pending, setPending] = useState(false);
  const [problems, setProblems] = useState<{ fields: string[]; codes: string[] }>({ fields: [], codes: [] });
  const set = <K extends keyof ExamSettingsDraft>(key: K, value: ExamSettingsDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Una fecha escrita pero inválida no se puede confundir con "sin fecha".
    const startsAt = draft.startsAt ? zonedInputToDate(draft.startsAt) : null;
    const endsAt = draft.endsAt ? zonedInputToDate(draft.endsAt) : null;
    const dateProblems = [draft.startsAt && !startsAt ? "startsAt" : null, draft.endsAt && !endsAt ? "endsAt" : null].filter(
      (code): code is string => Boolean(code),
    );
    const input: ExamSettingsInput = {
      title: draft.title,
      description: draft.description,
      instructions: draft.instructions,
      courseId: draft.courseId,
      startsAt,
      endsAt,
      durationMinutes: parseWhole(draft.durationMinutes),
      maxAttempts: Number(draft.maxAttempts),
      shuffleQuestions: draft.shuffleQuestions,
      proctoring: draft.proctoring,
    };
    const local = examSettingsSchema.safeParse(input);
    if (!local.success || dateProblems.length) {
      const issues = local.success ? [] : local.error.issues;
      setProblems({
        fields: [...dateProblems, ...issues.map((issue) => String(issue.path[0] ?? ""))],
        codes: [...dateProblems, ...issues.map((issue) => issue.message)],
      });
      return;
    }

    setPending(true);
    setProblems({ fields: [], codes: [] });
    const result = examId ? await updateExamSettingsAction(examId, input) : await createExamAction(input);
    setPending(false);
    if (!result.ok) {
      setProblems({ fields: result.fields ?? [], codes: result.codes ?? [] });
      if (!result.fields?.length) toast.error(result.error);
      return;
    }
    if (examId) {
      toast.success(t("saved"));
      router.refresh();
    } else {
      toast.success(t("created"));
      router.push(`/teacher/exams/${(result.data as { id: string }).id}`);
    }
  }

  const has = (field: string) => problems.fields.includes(field);
  const known = new Set(Object.keys(t.raw("errors") as Record<string, string>));
  const messages = [...new Set(problems.codes.filter((code) => known.has(code)).map((code) => t(`errors.${code}`)))];
  if (problems.fields.length && messages.length === 0) messages.push(t("errors.generic"));

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!hydrated || pending} className="grid min-w-0 gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <Label htmlFor="exam-title">{t("title")}</Label>
            <Input id="exam-title" value={draft.title} onChange={(event) => set("title", event.target.value)} aria-invalid={has("title")} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="exam-course">{t("course")}</Label>
            <NativeSelect
              id="exam-course"
              value={draft.courseId}
              onChange={(event) => set("courseId", event.target.value)}
              aria-invalid={has("courseId")}
            >
              <option value="">{t("chooseCourse")}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {course.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="exam-description">{t("description")}</Label>
          <Textarea
            id="exam-description"
            rows={2}
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
            aria-invalid={has("description")}
          />
          <p className="text-xs text-muted-foreground">{t("descriptionHint")}</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="exam-instructions">{t("instructions")}</Label>
          <Textarea
            id="exam-instructions"
            rows={4}
            value={draft.instructions}
            onChange={(event) => set("instructions", event.target.value)}
            aria-invalid={has("instructions")}
          />
          <p className="text-xs text-muted-foreground">{t("instructionsHint")}</p>
        </div>

        <div className="grid gap-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="exam-starts">{t("startsAt")}</Label>
              <Input
                id="exam-starts"
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => set("startsAt", event.target.value)}
                aria-invalid={has("startsAt")}
              />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="exam-ends">{t("endsAt")}</Label>
              <Input
                id="exam-ends"
                type="datetime-local"
                value={draft.endsAt}
                onChange={(event) => set("endsAt", event.target.value)}
                aria-invalid={has("endsAt")}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("windowHint")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="exam-duration">{t("duration")}</Label>
            <Input
              id="exam-duration"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.durationMinutes}
              onChange={(event) => set("durationMinutes", event.target.value)}
              aria-invalid={has("durationMinutes")}
            />
            <p className="text-xs text-muted-foreground">{t("durationHint")}</p>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="exam-attempts">{t("attempts")}</Label>
            <NativeSelect id="exam-attempts" value={draft.maxAttempts} onChange={(event) => set("maxAttempts", event.target.value)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={draft.shuffleQuestions} onCheckedChange={(checked) => set("shuffleQuestions", checked === true)} />
          {t("shuffle")}
        </Label>

        <fieldset className="grid gap-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">{t("proctoring")}</legend>
          <p className="text-xs text-muted-foreground">{t("proctoringHint")}</p>
          {PROCTORING_SIGNALS.map((signal) => (
            <div key={signal} className="flex flex-wrap items-center justify-between gap-2">
              <span id={`proctoring-${signal}`} className="text-sm">
                {t(`signals.${signal}`)}
              </span>
              <RadioGroup
                aria-labelledby={`proctoring-${signal}`}
                value={draft.proctoring[signal]}
                onValueChange={(value) => set("proctoring", { ...draft.proctoring, [signal]: value as ProctoringConfig[typeof signal] })}
                className="flex gap-4"
              >
                {PROCTORING_LEVELS.map((level) => (
                  <Label key={level} className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value={level} aria-label={`${t(`signals.${signal}`)}: ${t(`levels.${level}`)}`} />
                    {t(`levels.${level}`)}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          ))}
        </fieldset>

        {messages.length ? (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-inside list-disc">
                {messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : examId ? t("save") : t("create")}
          </Button>
          {examId ? null : (
            <Button asChild type="button" variant="outline">
              <Link href="/teacher/exams">{t("cancel")}</Link>
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
