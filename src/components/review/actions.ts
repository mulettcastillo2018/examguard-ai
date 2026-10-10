"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requireActor } from "@/modules/auth/session";
import { saveReview, type ReviewInput, type ReviewOutcome } from "@/modules/review/review";

/** Guarda la decisión de quien revisa (docente del curso o administrador de la institución). */
export async function saveReviewAction(sessionId: string, input: ReviewInput): Promise<ActionResult<{ outcome: ReviewOutcome }>> {
  return runAction(async () => {
    const result = await saveReview(await requireActor({ permission: "sessions:review" }), sessionId, input);
    // La revisión cambia la cola, el monitoreo, los resultados y "Mis datos" del estudiante.
    revalidatePath("/teacher", "layout");
    revalidatePath("/admin", "layout");
    revalidatePath("/student/my-data", "layout");
    return result;
  });
}
