import { ForbiddenError } from "@/lib/errors";
import { can, type Permission, type Role } from "./permissions";

/** Lanza 403 si el rol no tiene el permiso. Úsalo al inicio de cada servicio. */
export function assertCan(actor: { role: Role }, permission: Permission): void {
  if (!can(actor.role, permission)) throw new ForbiddenError();
}

/** Lanza 403 si el actor no tiene uno de los roles indicados. */
export function assertRole(actor: { role: Role }, ...roles: Role[]): void {
  if (!roles.includes(actor.role)) throw new ForbiddenError();
}
