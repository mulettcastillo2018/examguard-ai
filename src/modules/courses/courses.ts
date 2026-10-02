import "server-only";
import { prisma } from "@/lib/db";
import { assertCan, assertRole } from "@/modules/rbac";
import type { CurrentUser } from "@/modules/auth/session";

const courseSummary = {
  id: true,
  code: true,
  name: true,
  period: true,
  teachers: { select: { teacher: { select: { id: true, name: true } } } },
  _count: { select: { enrollments: true } },
} as const;

/** Todos los cursos de la institución (administración). */
export async function listInstitutionCourses(actor: CurrentUser) {
  assertCan(actor, "courses:manage");
  return prisma.course.findMany({
    where: { institutionId: actor.institutionId },
    orderBy: [{ period: "desc" }, { code: "asc" }],
    select: courseSummary,
  });
}

/** Cursos que dicta el docente. */
export async function listTeacherCourses(actor: CurrentUser) {
  assertRole(actor, "TEACHER");
  return prisma.course.findMany({
    where: { institutionId: actor.institutionId, teachers: { some: { teacherId: actor.id } } },
    orderBy: [{ period: "desc" }, { code: "asc" }],
    select: courseSummary,
  });
}

/** Cursos en los que está matriculado el estudiante. */
export async function listStudentCourses(actor: CurrentUser) {
  assertRole(actor, "STUDENT");
  return prisma.course.findMany({
    where: { institutionId: actor.institutionId, enrollments: { some: { studentId: actor.id } } },
    orderBy: [{ period: "desc" }, { code: "asc" }],
    select: courseSummary,
  });
}
