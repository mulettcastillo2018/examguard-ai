import "server-only";
import { z } from "zod";

// Variables de entorno del servidor, validadas una sola vez y con mensajes claros.
// Se leen de forma perezosa para que `next build` no exija secretos que solo se usan
// al atender peticiones.
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ message: "DATABASE_URL debe ser la cadena de conexión de PostgreSQL" }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, { message: "BETTER_AUTH_SECRET debe tener al menos 32 caracteres" }),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  // Intentos de inicio de sesión por minuto desde una misma IP (solo en producción).
  // Las pruebas E2E del CI lo suben porque inician sesión muchas veces desde la misma máquina.
  AUTH_SIGNIN_MAX_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(5),
  // Proveedor de IA (Fase 5). Sin llave (o vacía) se usa la plantilla factual.
  ANTHROPIC_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  // Secreto de la tarea programada diaria (Vercel lo envía como "Authorization: Bearer ...").
  // Sin él, la ruta /api/cron/daily no se puede llamar.
  CRON_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(16).optional()),
  // Modo demostración (la demo pública): las cuentas de ejemplo aparecen al iniciar sesión con
  // esta contraseña, no se pueden cambiar sus contraseñas ni su estado, y la tarea diaria
  // restablece los datos de ejemplo. DEMO_PASSWORD es pública: nunca la de una cuenta real.
  DEMO_MODE: z.preprocess((value) => value === "1" || value === "true", z.boolean()),
  DEMO_PASSWORD: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(10).optional()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${detail}`);
  }
  cached = parsed.data;
  return cached;
}
