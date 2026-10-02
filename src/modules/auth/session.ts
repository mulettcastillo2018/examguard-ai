import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { can, isRole, ROLE_HOME, type Permission, type Role } from "@/modules/rbac";
import { getAuth } from "./auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  institutionId: string;
  isMinor: boolean;
  mustChangePassword: boolean;
}

/** Usuario de la petición actual (una sola consulta por render gracias a `cache`). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // headers() va primero: marca la ruta como dinámica antes de tocar la configuración,
  // así `next build` no necesita los secretos para prerenderizar.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const { user } = session;
  if (!isRole(user.role) || user.active === false) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: user.isMinor ?? false,
    mustChangePassword: user.mustChangePassword ?? false,
  };
});

interface RequireOptions {
  roles?: readonly Role[];
  permission?: Permission;
}

function isAllowed(user: CurrentUser, { roles, permission }: RequireOptions): boolean {
  if (roles && !roles.includes(user.role)) return false;
  if (permission && !can(user.role, permission)) return false;
  return true;
}

/**
 * Para páginas y layouts: sin sesión lleva al inicio de sesión; con otro rol lleva a
 * la sección propia; con contraseña temporal obliga a cambiarla primero.
 */
export async function requirePageUser(
  options: RequireOptions & { allowPendingPasswordChange?: boolean } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowPendingPasswordChange) redirect("/account/password");
  if (!isAllowed(user, options)) redirect(ROLE_HOME[user.role]);
  return user;
}

/** Para Route Handlers y servicios: lanza errores con su código HTTP en vez de redirigir. */
export async function requireActor(options: RequireOptions = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!isAllowed(user, options)) throw new ForbiddenError();
  return user;
}
