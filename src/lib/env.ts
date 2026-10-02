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
  // Proveedor de IA (Fase 5). Sin llave se usa el proveedor simulado.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
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
