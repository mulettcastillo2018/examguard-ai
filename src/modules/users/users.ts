import "server-only";
import { prisma } from "@/lib/db";
import { assertCan } from "@/modules/rbac";
import type { CurrentUser } from "@/modules/auth/session";

/** Usuarios de la institución del administrador (nunca de otra institución). */
export async function listInstitutionUsers(actor: CurrentUser) {
  assertCan(actor, "users:manage");
  return prisma.user.findMany({
    where: { institutionId: actor.institutionId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, isMinor: true, active: true },
  });
}
