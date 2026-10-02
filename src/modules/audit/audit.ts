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
  "COURSE_CREATED",
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
