import { z } from "zod";

// Contenido de una pregunta: lo comparten el formulario (navegador) y el servidor.
// La clave de respuesta (answerKey) se guarda aparte de las opciones para que, al
// mostrar la pregunta a un estudiante, baste con no enviar ese campo.

export const QUESTION_TYPES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "LONG_ANSWER"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const CHOICE_TYPES: readonly QuestionType[] = ["SINGLE_CHOICE", "MULTIPLE_CHOICE"];

const optionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{4,24}$/),
  label: z.string().trim().min(1).max(500),
});

const choiceOptions = z
  .array(optionSchema)
  .min(2, "minOptions")
  .max(8, "maxOptions")
  .refine((options) => new Set(options.map((o) => o.id)).size === options.length, "duplicateOptionIds")
  .refine((options) => new Set(options.map((o) => o.label.toLowerCase())).size === options.length, "duplicateOptions");

const base = {
  prompt: z.string().trim().min(3, "prompt").max(4000, "prompt"),
  points: z
    .number()
    .min(0.25, "points")
    .max(100, "points")
    .refine((value) => Number.isInteger(value * 4), "points"),
};

export const questionContentSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("SINGLE_CHOICE"),
      ...base,
      options: choiceOptions,
      answerKey: z.object({ correctOptionIds: z.array(z.string()).length(1, "oneCorrect") }),
    }),
    z.object({
      type: z.literal("MULTIPLE_CHOICE"),
      ...base,
      options: choiceOptions,
      answerKey: z.object({ correctOptionIds: z.array(z.string()).min(1, "atLeastOneCorrect") }),
    }),
    z.object({
      type: z.literal("TRUE_FALSE"),
      ...base,
      options: z.array(optionSchema).max(0).default([]),
      answerKey: z.object({ value: z.boolean() }),
    }),
    z.object({
      type: z.literal("SHORT_ANSWER"),
      ...base,
      options: z.array(optionSchema).max(0).default([]),
      // Sin respuestas aceptadas, la pregunta se califica a mano.
      answerKey: z.object({ accepted: z.array(z.string().trim().min(1).max(200)).max(10).default([]) }),
    }),
    z.object({
      type: z.literal("LONG_ANSWER"),
      ...base,
      options: z.array(optionSchema).max(0).default([]),
      // Guía para quien califica; nunca se muestra al estudiante.
      answerKey: z.object({ rubric: z.string().trim().max(2000).default("") }),
    }),
  ])
  .superRefine((content, ctx) => {
    if (content.type === "SINGLE_CHOICE" || content.type === "MULTIPLE_CHOICE") {
      const ids = new Set(content.options.map((o) => o.id));
      if (content.answerKey.correctOptionIds.some((id) => !ids.has(id))) {
        ctx.addIssue({ code: "custom", path: ["answerKey"], message: "unknownCorrectOption" });
      }
    }
  });

export type QuestionContent = z.infer<typeof questionContentSchema>;

export const questionMetaSchema = z.object({
  category: z
    .string()
    .trim()
    .max(60, "category")
    .transform((value) => value || null)
    .nullable()
    .default(null),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(30, "tags"))
    .max(10, "tags")
    .default([])
    .transform((tags) => [...new Set(tags)]),
});

export const questionInputSchema = z.intersection(questionContentSchema, questionMetaSchema);
export type QuestionInput = z.input<typeof questionInputSchema>;

/** ¿Se puede calificar sola? (las de opción, verdadero/falso y las cortas con respuestas aceptadas) */
export function isAutoGradable(content: Pick<QuestionContent, "type" | "answerKey">): boolean {
  if (content.type === "LONG_ANSWER") return false;
  if (content.type === "SHORT_ANSWER") return (content.answerKey as { accepted: string[] }).accepted.length > 0;
  return true;
}

/** Identificador corto para una opción nueva (en el navegador o el servidor). */
export function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}
