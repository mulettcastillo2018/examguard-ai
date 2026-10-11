import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Antes de renderizar cada página:
// 1. Política de seguridad de contenido con un nonce por solicitud: solo corren los scripts
//    del propio sitio (Next.js pone el nonce en los suyos). El WASM de la detección de rostros
//    necesita 'wasm-unsafe-eval', que no habilita eval de JavaScript.
// 2. Filtro rápido de las secciones privadas: sin cookie de sesión, al inicio de sesión. No
//    consulta la base, así que no decide permisos: el rol, la institución y la vigencia de la
//    sesión se verifican en el servidor, en cada layout (requirePageUser) y en cada servicio.

const PRIVATE_PREFIXES = ["/admin", "/teacher", "/student", "/account", "/take"];

export function contentSecurityPolicy(nonce: string, { development, secure }: { development: boolean; secure: boolean }) {
  return [
    "default-src 'self'",
    // En desarrollo, React y la recarga en caliente usan eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    // Estilos en línea: los usan los componentes (posiciones, anchos de barras).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Solo detrás de HTTPS (en local y en CI se sirve por http://localhost).
    ...(secure ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPrivate = PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isPrivate && !getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === "development",
    secure: request.nextUrl.protocol === "https:",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Todas las páginas; no las APIs (JSON) ni los archivos estáticos y modelos. Las precargas
  // del enrutador no necesitan una política propia.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|models|mediapipe).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
