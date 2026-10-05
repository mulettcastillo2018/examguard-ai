"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import {
  CHOICE_TYPES,
  formatPoints,
  newOptionId,
  parsePoints,
  QUESTION_TYPES,
  questionInputSchema,
  type QuestionInput,
  type QuestionType,
} from "@/modules/question-bank/content";

export interface QuestionDraft {
  type: QuestionType;
  prompt: string;
  points: number;
  options: { id: string; label: string }[];
  answerKey: Record<string, unknown>;
  category: string | null;
  tags: string[];
}

/** Guarda la pregunta: en el banco o como copia dentro de un examen. */
export type SaveQuestion = (input: QuestionInput, options: { saveToBank: boolean }) => Promise<ActionResult<{ id: string }>>;

const blankOptions = () => [
  { id: newOptionId(), label: "" },
  { id: newOptionId(), label: "" },
];

/**
 * Formulario de una pregunta, con sus campos según el tipo. Lo usan el banco (con
 * categoría y etiquetas) y el constructor de exámenes (la copia del examen no las tiene).
 */
export function QuestionEditor({
  initial,
  categories = [],
  save,
  returnTo,
  showMeta = true,
  offerBankCopy = false,
}: {
  initial?: QuestionDraft;
  categories?: string[];
  save: SaveQuestion;
  /** Página a la que vuelve al guardar o cancelar. */
  returnTo: string;
  showMeta?: boolean;
  /** Pregunta nueva dentro de un examen: ofrece guardarla también en el banco. */
  offerBankCopy?: boolean;
}) {
  const t = useTranslations("questionBank");
  const router = useRouter();
  const hydrated = useHydrated();

  const [type, setType] = useState<QuestionType>(initial?.type ?? "SINGLE_CHOICE");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [points, setPoints] = useState(formatPoints(initial?.points ?? 1));
  const [options, setOptions] = useState(initial?.options.length ? initial.options : blankOptions());
  const [correct, setCorrect] = useState<string[]>(
    (initial?.answerKey.correctOptionIds as string[] | undefined) ?? [],
  );
  const [tfValue, setTfValue] = useState<"true" | "false">(initial?.answerKey.value === false ? "false" : "true");
  const [accepted, setAccepted] = useState(((initial?.answerKey.accepted as string[] | undefined) ?? []).join("\n"));
  const [rubric, setRubric] = useState((initial?.answerKey.rubric as string | undefined) ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [saveToBank, setSaveToBank] = useState(true);
  const [pending, setPending] = useState(false);
  const [problems, setProblems] = useState<{ fields: string[]; codes: string[] }>({ fields: [], codes: [] });

  const isChoice = CHOICE_TYPES.includes(type);

  function changeType(next: QuestionType) {
    setType(next);
    setProblems({ fields: [], codes: [] });
    // Entre opción única y múltiple se conservan las opciones; la única guarda una correcta.
    if (next === "SINGLE_CHOICE") setCorrect((current) => current.slice(0, 1));
  }

  function buildInput(): QuestionInput {
    const base = {
      prompt,
      points: parsePoints(points),
      category,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    switch (type) {
      case "SINGLE_CHOICE":
      case "MULTIPLE_CHOICE":
        return { ...base, type, options, answerKey: { correctOptionIds: correct.filter((id) => options.some((o) => o.id === id)) } };
      case "TRUE_FALSE":
        return { ...base, type, options: [], answerKey: { value: tfValue === "true" } };
      case "SHORT_ANSWER":
        return { ...base, type, options: [], answerKey: { accepted: accepted.split("\n").map((a) => a.trim()).filter(Boolean) } };
      case "LONG_ANSWER":
        return { ...base, type, options: [], answerKey: { rubric } };
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = buildInput();

    // Validación inmediata con el mismo esquema del servidor (que vuelve a validar).
    const local = questionInputSchema.safeParse(input);
    if (!local.success) {
      setProblems({
        fields: [...new Set(local.error.issues.map((issue) => String(issue.path[0] ?? "")))],
        codes: [...new Set(local.error.issues.map((issue) => issue.message))],
      });
      return;
    }

    setPending(true);
    setProblems({ fields: [], codes: [] });
    const result = await save(input, { saveToBank: offerBankCopy && saveToBank });
    setPending(false);
    if (!result.ok) {
      setProblems({ fields: result.fields ?? [], codes: result.codes ?? [] });
      if (!result.fields?.length) toast.error(result.error);
      return;
    }
    toast.success(t("saved"));
    // revalidatePath ya invalidó la página de destino: basta con navegar (un refresh la pediría dos veces).
    router.push(returnTo);
  }

  const has = (field: string) => problems.fields.includes(field);
  const known = new Set(Object.keys(t.raw("errors") as Record<string, string>));
  const messages = [
    ...new Set(
      problems.codes.map((code) => (known.has(code) ? t(`errors.${code}`) : null)).filter((m): m is string => Boolean(m)),
    ),
  ];
  if (has("options") && !messages.some((m) => m === t("errors.minOptions") || m === t("errors.duplicateOptions"))) {
    messages.push(t("errors.emptyOption"));
  }
  if (problems.fields.length && messages.length === 0) messages.push(t("errors.generic"));

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Deshabilitado hasta hidratar (lo escrito antes no llegaría al estado) y mientras guarda. */}
      <fieldset disabled={!hydrated || pending} className="grid min-w-0 gap-6">
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">{t("editor.type")}</legend>
          <RadioGroup value={type} onValueChange={(value) => changeType(value as QuestionType)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {QUESTION_TYPES.map((value) => (
              <Label
                key={value}
                htmlFor={`type-${value}`}
                className={cn(
                  "flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 font-normal",
                  type === value && "border-primary bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <RadioGroupItem id={`type-${value}`} value={value} />
                  {t(`types.${value}`)}
                </span>
                <span className="text-xs text-muted-foreground">{t(`typeHints.${value}`)}</span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor="q-prompt">{t("editor.prompt")}</Label>
          <Textarea
            id="q-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t("editor.promptPlaceholder")}
            rows={4}
            aria-invalid={has("prompt")}
          />
        </div>

        {isChoice ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("editor.options")}</legend>
            <p className="text-xs text-muted-foreground">
              {type === "MULTIPLE_CHOICE" ? t("editor.optionsHintMultiple") : t("editor.optionsHint")}
            </p>
            <ul className="grid gap-2">
              {options.map((option, index) => (
                <li key={option.id} className="flex items-center gap-2">
                  {type === "SINGLE_CHOICE" ? (
                    <input
                      type="radio"
                      name="correct"
                      aria-label={`${t("editor.correct")}: ${t("editor.option", { number: index + 1 })}`}
                      checked={correct.includes(option.id)}
                      onChange={() => setCorrect([option.id])}
                      className="size-4 accent-[var(--primary)]"
                    />
                  ) : (
                    <Checkbox
                      aria-label={`${t("editor.correct")}: ${t("editor.option", { number: index + 1 })}`}
                      checked={correct.includes(option.id)}
                      onCheckedChange={(checked) =>
                        setCorrect((current) => (checked === true ? [...current, option.id] : current.filter((id) => id !== option.id)))
                      }
                    />
                  )}
                  <Input
                    value={option.label}
                    onChange={(event) =>
                      setOptions((current) => current.map((o) => (o.id === option.id ? { ...o, label: event.target.value } : o)))
                    }
                    placeholder={t("editor.option", { number: index + 1 })}
                    aria-label={t("editor.option", { number: index + 1 })}
                    aria-invalid={has("options") && !option.label.trim()}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={options.length <= 2}
                    aria-label={t("editor.removeOption", { number: index + 1 })}
                    onClick={() => {
                      setOptions((current) => current.filter((o) => o.id !== option.id));
                      setCorrect((current) => current.filter((id) => id !== option.id));
                    }}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={options.length >= 8}
                onClick={() => setOptions((current) => [...current, { id: newOptionId(), label: "" }])}
              >
                <Plus />
                {t("editor.addOption")}
              </Button>
            </div>
          </fieldset>
        ) : null}

        {type === "TRUE_FALSE" ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t("editor.trueFalseAnswer")}</legend>
            <RadioGroup value={tfValue} onValueChange={(value) => setTfValue(value as "true" | "false")} className="flex gap-6">
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="true" />
                {t("editor.trueLabel")}
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <RadioGroupItem value="false" />
                {t("editor.falseLabel")}
              </Label>
            </RadioGroup>
          </fieldset>
        ) : null}

        {type === "SHORT_ANSWER" ? (
          <div className="grid gap-2">
            <Label htmlFor="q-accepted">{t("editor.accepted")}</Label>
            <Textarea id="q-accepted" value={accepted} onChange={(event) => setAccepted(event.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">{t("editor.acceptedHint")}</p>
          </div>
        ) : null}

        {type === "LONG_ANSWER" ? (
          <div className="grid gap-2">
            <Label htmlFor="q-rubric">{t("editor.rubric")}</Label>
            <Textarea id="q-rubric" value={rubric} onChange={(event) => setRubric(event.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">{t("editor.rubricHint")}</p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor="q-points">{t("editor.points")}</Label>
            <Input
              id="q-points"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              aria-invalid={has("points")}
            />
            <p className="text-xs text-muted-foreground">{t("editor.pointsHint")}</p>
          </div>
          {showMeta ? (
            <>
              <div className="grid content-start gap-2">
                <Label htmlFor="q-category">{t("editor.category")}</Label>
                <Input
                  id="q-category"
                  list="q-categories"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder={t("editor.categoryPlaceholder")}
                  aria-invalid={has("category")}
                />
                <datalist id="q-categories">
                  {categories.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="q-tags">{t("editor.tags")}</Label>
                <Input id="q-tags" value={tags} onChange={(event) => setTags(event.target.value)} aria-invalid={has("tags")} />
                <p className="text-xs text-muted-foreground">{t("editor.tagsHint")}</p>
              </div>
            </>
          ) : null}
        </div>

        {offerBankCopy ? (
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={saveToBank} onCheckedChange={(checked) => setSaveToBank(checked === true)} />
            {t("editor.saveToBank")}
          </Label>
        ) : null}

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <KeyRound className="size-3.5" aria-hidden />
          {t("editor.keyNotice")}
        </p>

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
            {pending ? t("editor.saving") : t("editor.save")}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href={returnTo}>{t("editor.cancel")}</Link>
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
