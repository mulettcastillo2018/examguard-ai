import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { assertCan } from "@/modules/rbac";
import { isAutoGradable, QUESTION_TYPES, questionInputSchema, type QuestionContent, type QuestionInput, type QuestionType } from "./content";

// Banco de preguntas de cada docente. Una pregunta archivada sale del banco pero se
// conserva: los exámenes guardan su propia copia, así que nada de lo presentado cambia.

export interface QuestionFilters {
  q?: string;
  type?: string;
  category?: string;
  tag?: string;
  archived?: boolean;
}

function parseQuestion(input: unknown) {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Revisa los campos marcados.",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

async function findOwnQuestion(actor: CurrentUser, questionId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, ownerId: actor.id, institutionId: actor.institutionId },
  });
  if (!question) throw new NotFoundError("La pregunta no existe en tu banco.");
  return question;
}

export async function listQuestions(actor: CurrentUser, filters: QuestionFilters = {}) {
  assertCan(actor, "questions:manage");
  const type = QUESTION_TYPES.includes(filters.type as QuestionType) ? (filters.type as QuestionType) : undefined;
  const q = filters.q?.trim();

  const [questions, facets] = await Promise.all([
    prisma.question.findMany({
      where: {
        ownerId: actor.id,
        institutionId: actor.institutionId,
        archivedAt: filters.archived ? { not: null } : null,
        ...(type ? { type } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.tag ? { tags: { has: filters.tag } } : {}),
        ...(q ? { prompt: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, type: true, prompt: true, points: true, category: true, tags: true, archivedAt: true, updatedAt: true, answerKey: true },
    }),
    getQuestionFacets(actor),
  ]);

  return {
    // La clave solo sirve para saber si la pregunta se califica sola; no sale del servidor.
    questions: questions.map(({ answerKey, ...question }) => ({
      ...question,
      autoGradable: isAutoGradable({ type: question.type, answerKey } as Pick<QuestionContent, "type" | "answerKey">),
    })),
    ...facets,
  };
}

/** Categorías y etiquetas en uso en el banco activo (para filtros y sugerencias). */
export async function getQuestionFacets(actor: CurrentUser) {
  assertCan(actor, "questions:manage");
  const rows = await prisma.question.findMany({
    where: { ownerId: actor.id, institutionId: actor.institutionId, archivedAt: null },
    select: { category: true, tags: true },
  });
  return {
    categories: [...new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, "es")),
    tags: [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "es")),
  };
}

/** Pregunta completa (con su clave) para editarla. Solo su dueño la ve. */
export async function getQuestion(actor: CurrentUser, questionId: string) {
  assertCan(actor, "questions:manage");
  return findOwnQuestion(actor, questionId);
}

export async function createQuestion(actor: CurrentUser, input: QuestionInput) {
  assertCan(actor, "questions:manage");
  const data = parseQuestion(input);
  const question = await prisma.question.create({
    data: {
      institutionId: actor.institutionId,
      ownerId: actor.id,
      type: data.type,
      prompt: data.prompt,
      options: toJson(data.options),
      answerKey: toJson(data.answerKey),
      points: data.points,
      category: data.category,
      tags: data.tags,
    },
  });
  await recordAudit({ institutionId: actor.institutionId, actorId: actor.id, action: "QUESTION_CREATED", entityType: "Question", entityId: question.id });
  return question;
}

export async function updateQuestion(actor: CurrentUser, questionId: string, input: QuestionInput) {
  assertCan(actor, "questions:manage");
  await findOwnQuestion(actor, questionId);
  const data = parseQuestion(input);
  const question = await prisma.question.update({
    where: { id: questionId },
    data: {
      type: data.type,
      prompt: data.prompt,
      options: toJson(data.options),
      answerKey: toJson(data.answerKey),
      points: data.points,
      category: data.category,
      tags: data.tags,
    },
  });
  await recordAudit({ institutionId: actor.institutionId, actorId: actor.id, action: "QUESTION_UPDATED", entityType: "Question", entityId: question.id });
  return question;
}

export async function duplicateQuestion(actor: CurrentUser, questionId: string) {
  assertCan(actor, "questions:manage");
  const source = await findOwnQuestion(actor, questionId);
  const copy = await prisma.question.create({
    data: {
      institutionId: source.institutionId,
      ownerId: actor.id,
      type: source.type,
      prompt: `${source.prompt} (copia)`,
      options: toJson(source.options),
      answerKey: toJson(source.answerKey),
      points: source.points,
      category: source.category,
      tags: source.tags,
    },
  });
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "QUESTION_CREATED",
    entityType: "Question",
    entityId: copy.id,
    metadata: { duplicatedFrom: source.id },
  });
  return copy;
}

export async function setQuestionArchived(actor: CurrentUser, questionId: string, archived: boolean) {
  assertCan(actor, "questions:manage");
  await findOwnQuestion(actor, questionId);
  await prisma.question.update({ where: { id: questionId }, data: { archivedAt: archived ? new Date() : null } });
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: archived ? "QUESTION_ARCHIVED" : "QUESTION_RESTORED",
    entityType: "Question",
    entityId: questionId,
  });
}
