import type { QuestionType } from "@/modules/question-bank/content";

// Respuestas en texto legible, para la revisión del docente y el resultado del estudiante.

type Option = { id: string; label: string };
export interface BooleanLabels {
  trueLabel: string;
  falseLabel: string;
}

/** Lo que respondió el estudiante, o null si no respondió. */
export function describeAnswer(type: QuestionType, value: unknown, options: Option[], labels: BooleanLabels): string | null {
  const data = (value ?? {}) as { optionId?: string | null; optionIds?: string[]; value?: boolean | null; text?: string };
  const label = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  switch (type) {
    case "SINGLE_CHOICE":
      return data.optionId ? label(data.optionId) : null;
    case "MULTIPLE_CHOICE":
      return data.optionIds?.length ? data.optionIds.map(label).join(" · ") : null;
    case "TRUE_FALSE":
      return data.value == null ? null : data.value ? labels.trueLabel : labels.falseLabel;
    case "SHORT_ANSWER":
    case "LONG_ANSWER":
      return data.text?.trim() ? data.text : null;
  }
}

/** La respuesta correcta en texto (solo para el docente); null si se califica a mano. */
export function describeKey(type: QuestionType, answerKey: unknown, options: Option[], labels: BooleanLabels): string | null {
  const key = (answerKey ?? {}) as { correctOptionIds?: string[]; value?: boolean; accepted?: string[] };
  const label = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  switch (type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return key.correctOptionIds?.map(label).join(" · ") ?? null;
    case "TRUE_FALSE":
      return key.value === undefined ? null : key.value ? labels.trueLabel : labels.falseLabel;
    case "SHORT_ANSWER":
      return key.accepted?.length ? key.accepted.join(" · ") : null;
    case "LONG_ANSWER":
      return null;
  }
}
