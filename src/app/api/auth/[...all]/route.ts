import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/modules/auth/auth";

// Endpoints de Better Auth (/api/auth/*). La instancia se crea en la primera petición,
// así `next build` no necesita los secretos.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
