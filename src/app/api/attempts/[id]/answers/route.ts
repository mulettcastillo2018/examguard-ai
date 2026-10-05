import { z } from "zod";
import { jsonPost } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { saveAnswer } from "@/modules/attempts/attempts";
import { requireActor } from "@/modules/auth/session";

const bodySchema = z.object({
  clientId: z.string().min(1).max(64),
  examQuestionId: z.string().min(1).max(40),
  value: z.unknown(),
  version: z.number().int().min(1),
});

// Guardado automático de una respuesta. La respuesta incluye la hora del servidor para
// que el navegador corrija su reloj.
export const POST = jsonPost<{ id: string }>(async (body, { id }) => {
  const actor = await requireActor({ permission: "exams:take" });
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError("Solicitud inválida.");
  const saved = await saveAnswer(actor, id, parsed.data);
  return { ...saved, serverNow: new Date().toISOString() };
});
