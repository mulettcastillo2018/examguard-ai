// Identificador de esta pestaña del navegador. El servidor deja guardar solo a la pestaña
// activa del intento; otra pestaña (o dispositivo) tiene otro identificador.
const KEY = "examguard:client-id";

export function getClientId(): string {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(KEY, created);
    return created;
  } catch {
    // Sin sessionStorage (modo muy restringido): uno por carga de página.
    return crypto.randomUUID();
  }
}
