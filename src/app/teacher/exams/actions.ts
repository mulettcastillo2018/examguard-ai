"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requireActor } from "@/modules/auth/session";
import {
  addQuestionsFromBank,
  createExam,
  createExamQuestion,
  deleteDraftExam,
  duplicateExam,
  duplicateExamQuestion,
  moveExamQuestion,
  publishExam,
  removeExamQuestion,
  setAccommodation,
  unpublishExam,
  updateExamQuestion,
  updateExamSettings,
} from "@/modules/exams/exams";
import type { AccommodationInput, ExamSettingsInput } from "@/modules/exams/settings";
import type { QuestionInput } from "@/modules/question-bank/content";

const manager = () => requireActor({ permission: "exams:manage" });

function refresh(examId?: string) {
  revalidatePath("/teacher/exams");
  revalidatePath("/teacher");
  if (examId) revalidatePath(`/teacher/exams/${examId}`);
}

export async function createExamAction(input: ExamSettingsInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const exam = await createExam(await manager(), input);
    refresh();
    return { id: exam.id };
  });
}

export async function updateExamSettingsAction(examId: string, input: ExamSettingsInput): Promise<ActionResult> {
  return runAction(async () => {
    await updateExamSettings(await manager(), examId, input);
    refresh(examId);
    return undefined;
  });
}

export async function deleteExamAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    await deleteDraftExam(await manager(), examId);
    refresh();
    return undefined;
  });
}

export async function duplicateExamAction(examId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const copy = await duplicateExam(await manager(), examId);
    refresh();
    return { id: copy.id };
  });
}

export async function addQuestionsFromBankAction(examId: string, questionIds: string[]): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    await addQuestionsFromBank(await manager(), examId, questionIds);
    refresh(examId);
    return { count: questionIds.length };
  });
}

/** Lo usa el editor de preguntas: crea (examQuestionId null) o edita la copia del examen. */
export async function saveExamQuestionAction(
  examId: string,
  examQuestionId: string | null,
  input: QuestionInput,
  options: { saveToBank: boolean },
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await manager();
    const question = examQuestionId
      ? await updateExamQuestion(actor, examId, examQuestionId, input)
      : await createExamQuestion(actor, examId, input, { saveToBank: options.saveToBank });
    refresh(examId);
    if (options.saveToBank) revalidatePath("/teacher/question-bank");
    return { id: question.id };
  });
}

export async function duplicateExamQuestionAction(examId: string, examQuestionId: string): Promise<ActionResult> {
  return runAction(async () => {
    await duplicateExamQuestion(await manager(), examId, examQuestionId);
    refresh(examId);
    return undefined;
  });
}

export async function removeExamQuestionAction(examId: string, examQuestionId: string): Promise<ActionResult> {
  return runAction(async () => {
    await removeExamQuestion(await manager(), examId, examQuestionId);
    refresh(examId);
    return undefined;
  });
}

export async function moveExamQuestionAction(examId: string, examQuestionId: string, direction: "up" | "down"): Promise<ActionResult> {
  return runAction(async () => {
    await moveExamQuestion(await manager(), examId, examQuestionId, direction);
    refresh(examId);
    return undefined;
  });
}

export async function publishExamAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    await publishExam(await manager(), examId);
    refresh(examId);
    return undefined;
  });
}

export async function unpublishExamAction(examId: string): Promise<ActionResult> {
  return runAction(async () => {
    await unpublishExam(await manager(), examId);
    refresh(examId);
    return undefined;
  });
}

export async function setAccommodationAction(examId: string, studentId: string, input: AccommodationInput): Promise<ActionResult> {
  return runAction(async () => {
    await setAccommodation(await manager(), examId, studentId, input);
    refresh(examId);
    return undefined;
  });
}
