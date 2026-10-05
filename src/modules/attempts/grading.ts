import type { QuestionType } from "@/modules/question-bank/content";
import { isAnswered, parseAnswerValue } from "./answers";

// Calificación automática. Reglas (docs/DECISIONES.md):
// - Opción única y verdadero/falso: puntos completos si acierta.
// - Opción múltiple: todo o nada (exactamente las correctas).
// - Respuesta corta: se compara sin mayúsculas, tildes ni espacios de más con las
//   respuestas aceptadas; si el docente no definió ninguna, se califica a mano.
// - Respuesta larga: siempre a mano.
// - Sin responder: 0 puntos, sin pasar por la cola manual.

export interface GradableQuestion {
  type: QuestionType;
  points: number;
  answerKey: unknown;
}

/** Texto comparable: minúsculas, sin tildes, sin espacios repetidos ni puntuación final. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?¡¿]+$/u, "")
    .trim();
}

/** Puntos de la respuesta, o null si la debe calificar el docente. */
export function gradeAnswer(question: GradableQuestion, value: unknown): number | null {
  if (!isAnswered(question.type, value)) return 0;
  const key = (question.answerKey ?? {}) as Record<string, unknown>;
  const parsed = parseAnswerValue(question.type, value);
  if (!parsed.success) return 0;
  const answer = parsed.data as Record<string, unknown>;

  switch (question.type) {
    case "SINGLE_CHOICE": {
      const correct = (key.correctOptionIds as string[] | undefined) ?? [];
      return correct.includes(answer.optionId as string) ? question.points : 0;
    }
    case "MULTIPLE_CHOICE": {
      const correct = new Set((key.correctOptionIds as string[] | undefined) ?? []);
      const chosen = new Set(answer.optionIds as string[]);
      const exact = chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
      return exact ? question.points : 0;
    }
    case "TRUE_FALSE":
      return answer.value === key.value ? question.points : 0;
    case "SHORT_ANSWER": {
      const accepted = ((key.accepted as string[] | undefined) ?? []).map(normalizeText);
      if (accepted.length === 0) return null;
      return accepted.includes(normalizeText(answer.text as string)) ? question.points : 0;
    }
    case "LONG_ANSWER":
      return null;
  }
}

/**
 * Nota del intento a partir de los puntos de cada pregunta (null = falta calificar a
 * mano). Mientras falte alguna, la nota queda pendiente.
 */
export function summarizeGrades(points: (number | null)[]): { score: number | null; pending: number } {
  const pending = points.filter((value) => value === null).length;
  if (pending > 0) return { score: null, pending };
  return { score: points.reduce<number>((sum, value) => sum + (value ?? 0), 0), pending: 0 };
}
