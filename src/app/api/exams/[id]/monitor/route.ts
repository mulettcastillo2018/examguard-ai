import { jsonGet } from "@/lib/api";
import { requireActor } from "@/modules/auth/session";
import { getExamMonitor } from "@/modules/proctoring/monitor";

// Estado en vivo de un examen para el docente (lo consulta la pantalla cada 5 segundos).
export const GET = jsonGet<{ id: string }>(async ({ id }) => {
  const actor = await requireActor({ permission: "exams:manage" });
  return getExamMonitor(actor, id);
});
