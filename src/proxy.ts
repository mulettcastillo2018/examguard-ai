import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Filtro rápido antes de renderizar: sin cookie de sesión, las secciones privadas
// llevan al inicio de sesión. No consulta la base de datos, así que no decide permisos:
// el rol, la institución y la vigencia de la sesión se verifican en el servidor, en
// cada layout (requirePageUser) y en cada servicio (requireActor).
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*", "/account/:path*"],
};
