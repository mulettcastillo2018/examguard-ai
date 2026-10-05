import { revalidatePath } from "next/cache";
import { z } from "zod";
import { jsonPost } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { submitAttempt } from "@/modules/attempts/attempts";
import { requireActor } from "@/modules/auth/session";

const bodySchema = z.object({ clientId: z.string().min(1).max(64), auto: z.boolean().optional() });

export const POST = jsonPost<{ id: string }>(async (body, { id }) => {
  const actor = await requireActor({ permission: "exams:take" });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError("Solicitud inválida.");
  const attempt = await submitAttempt(actor, id, parsed.data.clientId, new Date(), { auto: parsed.data.auto });
  revalidatePath("/student/exams");
  return { status: attempt.status };
});
