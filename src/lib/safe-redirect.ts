/**
 * Devuelve `target` solo si es una ruta interna ("/teacher", "/admin/users?x=1").
 * Evita redirecciones abiertas con valores como "https://otro.sitio" o "//otro.sitio".
 */
export function safeInternalPath(target: unknown, fallback = "/"): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(target)) return fallback;
  return target;
}
