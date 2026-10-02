import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { assertCan } from "@/modules/rbac";
import { listAuditLogs } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";

/** Nombre de la institución del usuario (para el encabezado de la aplicación). */
export const getInstitutionName = cache(async (institutionId: string) => {
  const institution = await prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true },
  });
  return institution?.name ?? "";
});

/** Cifras del panel de administración y la actividad más reciente. */
export async function getInstitutionOverview(actor: CurrentUser) {
  assertCan(actor, "institution:manage");
  const where = { institutionId: actor.institutionId };

  const [byRole, minors, courses, recentActivity] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where, _count: { _all: true } }),
    prisma.user.count({ where: { ...where, role: "STUDENT", isMinor: true } }),
    prisma.course.count({ where }),
    listAuditLogs(actor.institutionId, { take: 5 }),
  ]);

  const countOf = (role: "ADMIN" | "TEACHER" | "STUDENT") =>
    byRole.find((row) => row.role === role)?._count._all ?? 0;

  return {
    users: byRole.reduce((sum, row) => sum + row._count._all, 0),
    teachers: countOf("TEACHER"),
    students: countOf("STUDENT"),
    minors,
    courses,
    recentActivity,
  };
}

/** Bitácora completa de la institución (solo administración). */
export async function getInstitutionAudit(actor: CurrentUser, take = 100) {
  assertCan(actor, "audit:read");
  return listAuditLogs(actor.institutionId, { take });
}
