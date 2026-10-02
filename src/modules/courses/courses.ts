import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { assertCan, assertRole } from "@/modules/rbac";

const courseSummary = {
  id: true,
  code: true,
  name: true,
  period: true,
  teachers: { select: { teacher: { select: { id: true, name: true } } } },
  _count: { select: { enrollments: true } },
} as const;

export const courseInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "invalidCode"),
  name: z.string().trim().min(3).max(120),
  period: z
    .string()
    .trim()
    .regex(/^\d{4}-[12]$/, "invalidPeriod"),
});
export type CourseInput = z.input<typeof courseInputSchema>;

function parseCourse(input: unknown) {
  const parsed = courseInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      undefined,
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

function duplicateCourse(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictError("Ya existe un curso con ese código en el mismo periodo.");
  }
  throw error;
}

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

/** Curso con sus docentes y estudiantes, y las personas disponibles para asignar. */
export async function getCourseForAdmin(actor: CurrentUser, courseId: string) {
  assertCan(actor, "courses:manage");
  const course = await prisma.course.findFirst({
    where: { id: courseId, institutionId: actor.institutionId },
    select: {
      id: true,
      code: true,
      name: true,
      period: true,
      teachers: { select: { teacherId: true } },
      enrollments: { select: { studentId: true } },
    },
  });
  if (!course) throw new NotFoundError("El curso no existe en tu institución.");

  const people = await prisma.user.findMany({
    where: { institutionId: actor.institutionId, role: { in: ["TEACHER", "STUDENT"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, isMinor: true },
  });
  return {
    course: { id: course.id, code: course.code, name: course.name, period: course.period },
    teacherIds: course.teachers.map((t) => t.teacherId),
    studentIds: course.enrollments.map((e) => e.studentId),
    teachers: people.filter((p) => p.role === "TEACHER"),
    students: people.filter((p) => p.role === "STUDENT"),
  };
}

export async function createCourse(actor: CurrentUser, input: CourseInput) {
  assertCan(actor, "courses:manage");
  const data = parseCourse(input);
  const course = await prisma.course
    .create({ data: { ...data, institutionId: actor.institutionId } })
    .catch(duplicateCourse);
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "COURSE_CREATED",
    entityType: "Course",
    entityId: course.id,
    metadata: { code: course.code, period: course.period },
  });
  return course;
}

export async function updateCourse(actor: CurrentUser, courseId: string, input: CourseInput) {
  assertCan(actor, "courses:manage");
  const data = parseCourse(input);
  const existing = await prisma.course.findFirst({ where: { id: courseId, institutionId: actor.institutionId } });
  if (!existing) throw new NotFoundError("El curso no existe en tu institución.");
  const course = await prisma.course.update({ where: { id: courseId }, data }).catch(duplicateCourse);
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: "COURSE_UPDATED",
    entityType: "Course",
    entityId: course.id,
  });
  return course;
}

/**
 * Reemplaza los docentes o los estudiantes de un curso. Solo acepta personas activas de
 * la misma institución y con el rol correspondiente.
 */
export async function setCourseMembers(
  actor: CurrentUser,
  courseId: string,
  kind: "teachers" | "students",
  userIds: string[],
) {
  assertCan(actor, "courses:manage");
  const course = await prisma.course.findFirst({ where: { id: courseId, institutionId: actor.institutionId } });
  if (!course) throw new NotFoundError("El curso no existe en tu institución.");

  const role = kind === "teachers" ? "TEACHER" : "STUDENT";
  const ids = [...new Set(userIds)];
  const valid = await prisma.user.count({
    where: { id: { in: ids }, institutionId: actor.institutionId, role, active: true },
  });
  if (valid !== ids.length) {
    throw new ValidationError("Algunas personas no pertenecen a la institución o no tienen el rol adecuado.");
  }

  await prisma.$transaction(
    kind === "teachers"
      ? [
          prisma.courseTeacher.deleteMany({ where: { courseId } }),
          prisma.courseTeacher.createMany({ data: ids.map((teacherId) => ({ courseId, teacherId })) }),
        ]
      : [
          prisma.enrollment.deleteMany({ where: { courseId } }),
          prisma.enrollment.createMany({ data: ids.map((studentId) => ({ courseId, studentId })) }),
        ],
  );
  await recordAudit({
    institutionId: actor.institutionId,
    actorId: actor.id,
    action: kind === "teachers" ? "COURSE_TEACHERS_UPDATED" : "COURSE_ENROLLMENTS_UPDATED",
    entityType: "Course",
    entityId: courseId,
    metadata: { count: ids.length },
  });
}
