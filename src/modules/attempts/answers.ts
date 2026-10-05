import { z } from "zod";
import type { QuestionType } from "@/modules/question-bank/content";

// Forma de la respuesta de un estudiante según el tipo de pregunta. La comparten la
// pantalla del examen (navegador) y el servidor, que la vuelve a validar al guardar.

export const answerValueSchemas = {
  SINGLE_CHOICE: z.object({ optionId: z.string().max(24).nullable() }),
  MULTIPLE_CHOICE: z.object({ optionIds: z.array(z.string().max(24)).max(8) }),
  TRUE_FALSE: z.object({ value: z.boolean().nullable() }),
  SHORT_ANSWER: z.object({ text: z.string().max(200) }),
  LONG_ANSWER: z.object({ text: z.string().max(10_000) }),
} satisfies Record<QuestionType, z.ZodType>;

export type AnswerValue =
  | { optionId: string | null }
  | { optionIds: string[] }
  | { value: boolean | null }
  | { text: string };

export function parseAnswerValue(type: QuestionType, value: unknown) {
  return answerValueSchemas[type].safeParse(value);
}

/** ¿El estudiante respondió algo? Sirve para el progreso y el aviso al enviar. */
export function isAnswered(type: QuestionType, value: unknown): boolean {
  const parsed = parseAnswerValue(type, value);
  if (!parsed.success) return false;
  const data = parsed.data as Record<string, unknown>;
  switch (type) {
    case "SINGLE_CHOICE":
      return data.optionId != null;
    case "MULTIPLE_CHOICE":
      return (data.optionIds as string[]).length > 0;
    case "TRUE_FALSE":
      return data.value != null;
    case "SHORT_ANSWER":
    case "LONG_ANSWER":
      return (data.text as string).trim().length > 0;
  }
}
