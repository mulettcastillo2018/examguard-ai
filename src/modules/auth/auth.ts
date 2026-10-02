import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { recordAudit } from "@/modules/audit";

// Configuración de Better Auth. La plataforma es institucional: no hay registro
// público; los usuarios los crea el administrador (ver credentials.ts).
function createAuth() {
  const env = getServerEnv();

  return betterAuth({
    appName: "ExamGuard AI",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    user: {
      // `input: false`: ningún cliente puede fijar estos campos al registrarse o
      // actualizar su perfil; solo el servidor.
      additionalFields: {
        role: { type: "string", required: true, input: false },
        institutionId: { type: "string", required: true, input: false },
        isMinor: { type: "boolean", required: false, defaultValue: false, input: false },
        active: { type: "boolean", required: false, defaultValue: true, input: false },
        mustChangePassword: { type: "boolean", required: false, defaultValue: true, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 8, // una jornada
      updateAge: 60 * 30,
    },
    rateLimit: {
      // Activo en producción (comportamiento por defecto de Better Auth); más estricto al iniciar sesión.
      customRules: { "/sign-in/email": { window: 60, max: env.AUTH_SIGNIN_MAX_PER_MINUTE } },
    },
    databaseHooks: {
      session: {
        create: {
          // Un usuario desactivado no puede iniciar sesión aunque su contraseña sea correcta.
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { active: true, institutionId: true },
            });
            if (!user) return false;
            if (!user.active) {
              await recordAudit({
                institutionId: user.institutionId,
                actorId: session.userId,
                action: "LOGIN_BLOCKED_INACTIVE",
                entityType: "User",
                entityId: session.userId,
                ip: session.ipAddress ?? null,
              });
              return false;
            }
          },
          after: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { institutionId: true },
            });
            if (!user) return;
            await recordAudit({
              institutionId: user.institutionId,
              actorId: session.userId,
              action: "LOGIN_SUCCEEDED",
              entityType: "Session",
              entityId: session.id,
              ip: session.ipAddress ?? null,
              metadata: { userAgent: session.userAgent ?? null },
            });
          },
        },
      },
    },
    hooks: {
      // Al cambiar la contraseña con éxito, se quita la obligación de cambiarla.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/change-password") return;
        if (ctx.context.returned instanceof APIError) return;
        const userId = ctx.context.session?.user.id;
        if (!userId) return;
        const user = await prisma.user.update({
          where: { id: userId },
          data: { mustChangePassword: false },
          select: { institutionId: true },
        });
        await recordAudit({
          institutionId: user.institutionId,
          actorId: userId,
          action: "PASSWORD_CHANGED",
          entityType: "User",
          entityId: userId,
        });
      }),
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Instancia única, creada al primer uso (las variables de entorno se validan ahí). */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
