import "server-only";
import { AppError, ValidationError } from "./errors";
import { logger } from "./logger";

// Resultado de una Server Action: lo que necesita el formulario y nada más (sin trazas
// ni detalles internos). `fields` lista los campos inválidos para marcarlos en la interfaz.
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fields?: string[]; codes?: string[] };

export async function runAction<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    return { ok: true, data } as ActionResult<T>;
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        ok: false,
        error: error.message,
        fields: [...new Set(error.issues.map((issue) => issue.path.split(".")[0] ?? ""))],
        // Códigos de la regla que falló (por ejemplo "oneCorrect"), para mensajes precisos en la interfaz.
        codes: [...new Set(error.issues.map((issue) => issue.message))],
      };
    }
    if (error instanceof AppError) return { ok: false, error: error.message };
    logger.error("Error inesperado en una acción", { error });
    return { ok: false, error: "Ocurrió un error inesperado. Inténtalo de nuevo." };
  }
}

/** Lee un checkbox de un FormData ("on" cuando está marcado). */
export const formFlag = (form: FormData, name: string) => form.get(name) === "on" || form.get(name) === "true";

/** Lee un texto de un FormData (cadena vacía si falta). */
export const formText = (form: FormData, name: string) => String(form.get(name) ?? "");
