"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requireActor } from "@/modules/auth/session";
import type { QuestionInput } from "@/modules/question-bank/content";
import {
  createQuestion,
  duplicateQuestion,
  setQuestionArchived,
  updateQuestion,
} from "@/modules/question-bank/question-bank";

// El formulario envía la pregunta como objeto; el servicio la vuelve a validar con el
// mismo esquema que usa el navegador.
export async function saveQuestionAction(questionId: string | null, input: QuestionInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "questions:manage" });
    const question = questionId ? await updateQuestion(actor, questionId, input) : await createQuestion(actor, input);
    revalidatePath("/teacher/question-bank");
    return { id: question.id };
  });
}

export async function duplicateQuestionAction(questionId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "questions:manage" });
    const copy = await duplicateQuestion(actor, questionId);
    revalidatePath("/teacher/question-bank");
    return { id: copy.id };
  });
}

export async function archiveQuestionAction(questionId: string, archived: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "questions:manage" });
    await setQuestionArchived(actor, questionId, archived);
    revalidatePath("/teacher/question-bank");
    return undefined;
  });
}
