import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "./env";
import { ForbiddenError, toErrorResponse, ValidationError } from "./errors";
import { logger } from "./logger";

// Rutas de API que usa la pantalla del examen (guardado automático con reintentos, que
// una Server Action no permite controlar). Las Server Actions ya revisan el origen; estas
// rutas lo hacen a mano para que otro sitio no pueda enviar respuestas con la cookie.

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = new Set([request.nextUrl.origin, new URL(getServerEnv().BETTER_AUTH_URL).origin]);
  if (!origin || !allowed.has(origin)) throw new ForbiddenError("Origen no permitido.");
}

/** Lee el cuerpo JSON con un límite de tamaño (las respuestas largas caben de sobra). */
async function readJson(request: NextRequest, maxBytes = 64_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new ValidationError("La solicitud es demasiado grande.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("La solicitud no es JSON válido.");
  }
}

/** POST con origen verificado, cuerpo JSON y errores convertidos en respuestas seguras. */
export function jsonPost<P>(handler: (body: unknown, params: P) => Promise<unknown>) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(request);
      const result = await handler(await readJson(request), await context.params);
      return NextResponse.json(result ?? {}, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      if (status >= 500) logger.error("Error inesperado en una ruta de API", { error });
      return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}
