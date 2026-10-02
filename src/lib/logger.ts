// Logs estructurados en JSON (una línea por evento), legibles en Vercel y en Docker.
// Nunca se registran contraseñas, tokens ni contenido de respuestas de examen.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): Level {
  if (process.env.LOG_LEVEL && process.env.LOG_LEVEL in LEVEL_ORDER) {
    return process.env.LOG_LEVEL as Level;
  }
  if (process.env.NODE_ENV === "test") return "error";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const { error, ...rest } = context ?? {};
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...rest,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
