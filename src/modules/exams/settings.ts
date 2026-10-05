import { z } from "zod";

// Configuración de un examen: la comparten el formulario (navegador) y el servidor.

/**
 * Supervisión por examen. Cámara y micrófono solo se pueden *solicitar*: la ley
 * colombiana no permite condicionar el examen a entregar datos sensibles, así que el
 * estudiante puede negarse y presentar igual, sin que eso genere señales de riesgo.
 * Pantalla completa tampoco se exige: hay equipos (iPhone, por ejemplo) que no la ofrecen.
 */
export const PROCTORING_LEVELS = ["requested", "off"] as const;
export type ProctoringLevel = (typeof PROCTORING_LEVELS)[number];
export const PROCTORING_SIGNALS = ["camera", "microphone", "fullscreen"] as const;

export const proctoringConfigSchema = z.object({
  camera: z.enum(PROCTORING_LEVELS).default("requested"),
  microphone: z.enum(PROCTORING_LEVELS).default("off"),
  fullscreen: z.enum(PROCTORING_LEVELS).default("requested"),
});
export type ProctoringConfig = z.infer<typeof proctoringConfigSchema>;

/** Lee la configuración guardada; un valor viejo o incompleto toma los valores por defecto. */
export function readProctoringConfig(value: unknown): ProctoringConfig {
  const parsed = proctoringConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : proctoringConfigSchema.parse({});
}

const optionalText = (max: number, code: string) =>
  z
    .string()
    .trim()
    .max(max, code)
    .transform((value) => value || null)
    .nullable()
    .default(null);

export const examSettingsSchema = z
  .object({
    title: z.string().trim().min(3, "title").max(200, "title"),
    description: optionalText(2000, "description"),
    instructions: optionalText(4000, "instructions"),
    courseId: z.string().min(1, "course"),
    // La ventana puede quedar vacía en el borrador; se exige al publicar.
    startsAt: z.date().nullable().default(null),
    endsAt: z.date().nullable().default(null),
    durationMinutes: z.number().int("duration").min(5, "duration").max(600, "duration"),
    maxAttempts: z.number().int("attempts").min(1, "attempts").max(5, "attempts"),
    shuffleQuestions: z.boolean().default(false),
    proctoring: proctoringConfigSchema,
  })
  .superRefine((settings, ctx) => {
    if (settings.startsAt && settings.endsAt && settings.endsAt <= settings.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "windowOrder" });
    }
  });
export type ExamSettingsInput = z.input<typeof examSettingsSchema>;
export type ExamSettings = z.output<typeof examSettingsSchema>;

export const PUBLISH_PROBLEMS = ["noWindow", "windowEnded", "durationExceedsWindow", "noQuestions", "invalidQuestion"] as const;
export type PublishProblem = (typeof PUBLISH_PROBLEMS)[number];

/**
 * Qué le falta a un borrador para publicarse. Lista vacía = se puede publicar.
 * La duración no puede pasar de la ventana: nadie alcanzaría a tener el tiempo completo.
 */
export function getPublishProblems(
  exam: { startsAt: Date | null; endsAt: Date | null; durationMinutes: number },
  questions: { valid: boolean }[],
  now: Date,
): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (!exam.startsAt || !exam.endsAt) {
    problems.push("noWindow");
  } else {
    if (exam.endsAt <= now) problems.push("windowEnded");
    if (exam.durationMinutes * 60_000 > exam.endsAt.getTime() - exam.startsAt.getTime()) problems.push("durationExceedsWindow");
  }
  if (questions.length === 0) problems.push("noQuestions");
  if (questions.some((question) => !question.valid)) problems.push("invalidQuestion");
  return problems;
}

export const accommodationSchema = z.object({
  extraMinutes: z.number().int("extraMinutes").min(0, "extraMinutes").max(600, "extraMinutes"),
  cameraExempt: z.boolean(),
  note: z.string().trim().max(300, "note").default(""),
});
export type AccommodationInput = z.input<typeof accommodationSchema>;

/** Un ajuste sin tiempo extra, sin exención y sin nota es lo mismo que no tener ajuste. */
export const isEmptyAccommodation = (value: z.output<typeof accommodationSchema>) =>
  value.extraMinutes === 0 && !value.cameraExempt && value.note === "";
