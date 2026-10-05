import { jsonPost } from "@/lib/api";
import { requireActor } from "@/modules/auth/session";
import { ingestEvents } from "@/modules/proctoring/proctoring";

// Lote de eventos de supervisión de la pantalla del examen. Un lote vacío es una señal de
// vida para el monitoreo en vivo del docente.
export const POST = jsonPost<{ id: string }>(async (body, { id }) => {
  const actor = await requireActor({ permission: "exams:take" });
  return ingestEvents(actor, id, body);
});
