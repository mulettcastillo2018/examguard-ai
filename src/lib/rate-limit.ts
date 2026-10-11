import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { TooManyRequestsError } from "./errors";

// Límites de uso de las APIs de la aplicación: ventanas fijas en la tabla RateLimit (la
// misma que usa Better Auth para el inicio de sesión), para que valgan entre instancias.
// Una sola sentencia atómica por solicitud: cuenta y, si la ventana venció, la reinicia.

export interface Limit {
  /** Solicitudes permitidas por ventana. */
  max: number;
  windowSec: number;
}

export const LIMITS = {
  // La pantalla del examen manda un lote cada pocos segundos y guarda al escribir.
  events: { max: 60, windowSec: 60 },
  answers: { max: 240, windowSec: 60 },
  // El resumen con IA cuesta: pocas veces por docente.
  aiSummary: { max: 6, windowSec: 600 },
  userImport: { max: 20, windowSec: 3600 },
} satisfies Record<string, Limit>;

/** Cuenta una solicitud; devuelve si se permite y en cuántos segundos se reinicia la ventana. */
export async function consumeRateLimit(key: string, limit: Limit, now = Date.now()) {
  const windowStart = BigInt(now - limit.windowSec * 1000);
  const current = BigInt(now);
  const [row] = await prisma.$queryRaw<{ count: number; lastRequest: bigint }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${`app:${key}`}, 1, ${current})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" <= ${windowStart} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" <= ${windowStart} THEN ${current} ELSE "RateLimit"."lastRequest" END
    RETURNING "count", "lastRequest"`;
  const count = Number(row?.count ?? 1);
  const resetsInSec = Math.max(1, Math.ceil((Number(row?.lastRequest ?? current) + limit.windowSec * 1000 - now) / 1000));
  return { allowed: count <= limit.max, count, resetsInSec };
}

/** Lanza 429 si se pasó del límite. */
export async function enforceRateLimit(key: string, limit: Limit, now = Date.now()) {
  const result = await consumeRateLimit(key, limit, now);
  if (!result.allowed) throw new TooManyRequestsError(undefined, result.resetsInSec);
}
