import "server-only";
import { getServerEnv } from "@/lib/env";
import { ForbiddenError } from "@/lib/errors";

// Modo demostración: qué ve quien visita la demo pública y qué no puede romper.

export const DEMO_EMAIL_DOMAIN = "losandes.test";

/** Cuentas de ejemplo que se ofrecen al iniciar sesión (datos ficticios de la semilla). */
export const DEMO_ACCOUNTS = [
  { key: "admin", email: `rectoria@${DEMO_EMAIL_DOMAIN}` },
  { key: "teacher", email: `cmejia@${DEMO_EMAIL_DOMAIN}` },
  { key: "student", email: `mcardenas@${DEMO_EMAIL_DOMAIN}` },
  { key: "minor", email: `vrios@${DEMO_EMAIL_DOMAIN}` },
] as const;

/** La configuración de la demo, o null si el sitio no está en modo demostración. */
export function demoSettings() {
  const env = getServerEnv();
  return env.DEMO_MODE && env.DEMO_PASSWORD ? { password: env.DEMO_PASSWORD } : null;
}

/** En modo demostración, una cuenta de ejemplo (la comparte todo el que visita la demo). */
export function isDemoAccount(email: string) {
  return getServerEnv().DEMO_MODE && email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Las cuentas de ejemplo no se modifican en la demo: así nadie la deja inservible para los demás. */
export function assertNotDemoAccount(email: string) {
  if (isDemoAccount(email)) {
    throw new ForbiddenError("En la demostración no se cambian las contraseñas ni los datos de las cuentas de ejemplo. Puedes crear tus propias cuentas.");
  }
}
