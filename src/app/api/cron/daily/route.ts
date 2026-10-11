import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { finalizeExpiredAttempts } from "@/modules/attempts/attempts";
import { demoSettings } from "@/modules/demo/demo";
import { seedDemoInstitution } from "@/modules/demo/seed";
import { purgeExpiredEvidence, purgeStaleRateLimits } from "@/modules/maintenance/retention";

// Tarea diaria (vercel.json): entrega los intentos vencidos que nadie volvió a abrir y borra
// la evidencia cuya retención terminó; en la demo pública, además, restablece los datos de
// ejemplo. Solo la llama quien conoce CRON_SECRET.

// Restablecer la demo tarda unos segundos (crea cuentas, cursos y exámenes).
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado.", code: "UNAUTHORIZED" }, { status: 401 });
  const now = new Date();
  try {
    const finalized = await finalizeExpiredAttempts({}, now);
    const purged = await purgeExpiredEvidence(now);
    const rateLimits = await purgeStaleRateLimits(now);
    const demo = demoSettings();
    const demoReset = demo ? Boolean(await seedDemoInstitution(demo.password)) : false;
    logger.info("Tarea diaria terminada", { finalized, purged, rateLimits, demoReset });
    return NextResponse.json({ finalized, purged, rateLimits, demoReset }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Falló la tarea diaria", { error });
    return NextResponse.json({ error: "Ocurrió un error inesperado.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
