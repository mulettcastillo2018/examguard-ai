import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

// Acciones auditables. Se amplía en cada fase (exámenes, revisiones, retención...).
export const AUDIT_ACTIONS = [
  "LOGIN_SUCCEEDED",
  "LOGIN_BLOCKED_INACTIVE",
  "PASSWORD_CHANGED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "USER_PASSWORD_RESET",
  "USERS_IMPORTED",
  "COURSE_CREATED",
  "COURSE_UPDATED",
  "COURSE_TEACHERS_UPDATED",
  "COURSE_ENROLLMENTS_UPDATED",
  "QUESTION_CREATED",
  "QUESTION_UPDATED",
  "QUESTION_ARCHIVED",
  "QUESTION_RESTORED",
  "EXAM_CREATED",
  "EXAM_UPDATED",
  "EXAM_QUESTIONS_CHANGED",
  "EXAM_PUBLISHED",
  "EXAM_UNPUBLISHED",
  "EXAM_DELETED",
  "ACCOMMODATION_UPDATED",
  "ATTEMPT_STARTED",
  "ATTEMPT_SUBMITTED",
  "ATTEMPT_AUTO_SUBMITTED",
  "ATTEMPT_DEVICE_CHANGED",
  "ANSWER_GRADED",
  "RESULTS_PUBLISHED",
  "EXAM_CLOSED",
  "SESSION_REVIEWED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  institutionId: string;
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * Registra una acción en la bitácora. Un fallo al auditar no debe tumbar la operación
 * del usuario, pero sí quedar en los logs para revisarlo.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        institutionId: entry.institutionId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    logger.error("No se pudo registrar la auditoría", { action: entry.action, error });
  }
}

export async function listAuditLogs(institutionId: string, { take = 50 }: { take?: number } = {}) {
  return prisma.auditLog.findMany({
    where: { institutionId },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true, email: true, role: true } } },
  });
}
