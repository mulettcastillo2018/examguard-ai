import { z } from "zod";
import { jsonPost } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { claimAttempt } from "@/modules/attempts/attempts";
import { requireActor } from "@/modules/auth/session";

const bodySchema = z.object({ clientId: z.string().min(1).max(64) });

// La pestaña que abre (o retoma) el examen pasa a ser la activa.
export const POST = jsonPost<{ id: string }>(async (body, { id }) => {
  const actor = await requireActor({ permission: "exams:take" });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError("Solicitud inválida.");
  const attempt = await claimAttempt(actor, id, parsed.data.clientId);
  return { status: attempt.status, deadlineAt: attempt.deadlineAt.toISOString(), serverNow: new Date().toISOString() };
});
