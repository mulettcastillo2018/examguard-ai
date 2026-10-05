"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { runAction, type ActionResult } from "@/lib/action";
import { startAttempt, type StartInput } from "@/modules/attempts/attempts";
import { requireActor } from "@/modules/auth/session";
import { parseUserAgent } from "@/modules/proctoring/proctoring";

export async function startAttemptAction(examId: string, input: StartInput): Promise<ActionResult<{ attemptId: string }>> {
  return runAction(async () => {
    const actor = await requireActor({ permission: "exams:take" });
    const device = parseUserAgent((await headers()).get("user-agent"));
    const attemptId = await startAttempt(actor, examId, { ...input, device });
    revalidatePath("/student/exams");
    return { attemptId };
  });
}
