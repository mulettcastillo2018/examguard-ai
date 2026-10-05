import { NextResponse } from "next/server";

// Hora del servidor para la prueba de compatibilidad: mide la latencia y el desfase del
// reloj del equipo (el tiempo del examen lo controla el servidor de todas formas).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
