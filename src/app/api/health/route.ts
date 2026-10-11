import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Salud del servicio para el monitoreo externo y el contenedor: responde si la base contesta.
// No expone versiones ni detalles internos.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
