"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { startAttempt, type StartInput } from "@/modules/attempts/attempts";
import { requireActor } from "@/modules/auth/session";

export async function startAttemptAction(examId: string, input: StartInput): Promise<ActionResult<{ attemptId: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "exams:take" });
    const attemptId = await startAttempt(actor, examId, input);
    revalidatePath("/student/exams");
    return { attemptId };
  });
}
