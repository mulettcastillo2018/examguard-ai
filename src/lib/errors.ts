// Errores de la aplicación con su código HTTP. Los servicios lanzan estos errores y
// las rutas los convierten en respuestas sin filtrar detalles internos.

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Debes iniciar sesión.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No tienes permiso para realizar esta acción.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "No se encontró el recurso.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Los datos enviados no son válidos.",
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class ConflictError extends AppError {
  /** code: motivo preciso para que el cliente reaccione (por ejemplo "otherDevice"). */
  constructor(message = "El recurso ya existe o cambió mientras se editaba.", code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message = "Demasiadas solicitudes seguidas. Espera un momento y vuelve a intentarlo.",
    readonly retryAfterSec = 60,
  ) {
    super(message, 429, "rateLimited");
  }
}

/** Convierte cualquier error en un cuerpo de respuesta seguro para el cliente. */
export function toErrorResponse(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof AppError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: "Ocurrió un error inesperado.", code: "INTERNAL_ERROR" } };
}
