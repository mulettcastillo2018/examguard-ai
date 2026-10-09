import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import { analyzeSessionSafely } from "@/modules/agents/orchestrator";
import { assertCan } from "@/modules/rbac";
import { EVENT_CATALOG, eventBatchSchema, type EventType } from "./catalog";

// Ingesta de eventos de supervisión. El navegador propone; el servidor decide la
// categoría y la severidad (catálogo), corrige el reloj y descarta lo que no corresponde.

/** Eventos que llegan hasta este tiempo después de la entrega aún se aceptan (lote en vuelo). */
const AFTER_SUBMIT_GRACE_MS = 60_000;

export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  device: string | null;
}

/** Navegador, sistema y tipo de equipo a partir del user agent (sin huellas digitales). */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { browser: null, os: null, device: null };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  const device = /iPad|Tablet/.test(ua) ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "mobile" : "desktop";
  return { browser, os, device };
}

/** Datos de un evento del servidor (inicio, entrega, cambio de dispositivo). */
export function serverEvent(type: EventType, occurredAt: Date, metadata: Record<string, string | number | boolean> = {}) {
  const definition = EVENT_CATALOG[type];
  return {
    clientEventId: `server:${type}:${randomUUID()}`,
    type,
    category: definition.category,
    severity: definition.severity,
    occurredAt,
    metadata: metadata as Prisma.InputJsonValue,
    source: "SERVER" as const,
  };
}

/** Registra un evento del servidor en la sesión del intento (si la tiene). */
export async function recordServerEvent(
  client: Prisma.TransactionClient | typeof prisma,
  attemptId: string,
  type: EventType,
  occurredAt: Date,
  metadata?: Record<string, string | number | boolean>,
) {
  const session = await client.proctoringSession.findUnique({ where: { attemptId }, select: { id: true } });
  if (!session) return;
  await client.proctoringEvent.create({ data: { sessionId: session.id, ...serverEvent(type, occurredAt, metadata) } });
  await client.proctoringSession.update({
    where: { id: session.id },
    data: { eventCount: { increment: 1 }, lastEventAt: occurredAt, ...(type === "EXAM_SUBMITTED" || type === "EXAM_AUTO_SUBMITTED" ? { endedAt: occurredAt } : {}) },
  });
}

/**
 * Guarda un lote de eventos del navegador. Un lote vacío sirve de señal de vida para el
 * monitoreo en vivo. Devuelve cuántos eventos nuevos se guardaron.
 */
export async function ingestEvents(actor: CurrentUser, attemptId: string, input: unknown, now = new Date()) {
  assertCan(actor, "exams:take");
  const parsed = eventBatchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Lote de eventos inválido.");
  const batch = parsed.data;

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, studentId: actor.id },
    select: { status: true, submittedAt: true, exam: { select: { simulationEnabled: true } }, proctoring: true },
  });
  if (!attempt?.proctoring) throw new NotFoundError("La sesión de supervisión no existe.");
  const session = attempt.proctoring;
  const finishedAt = attempt.status === "IN_PROGRESS" ? null : (attempt.submittedAt ?? now);
  if (finishedAt && now.getTime() > finishedAt.getTime() + AFTER_SUBMIT_GRACE_MS) {
    throw new ConflictError("La sesión ya terminó.", "submitted");
  }

  // Desfase del reloj del navegador (la latencia de red queda dentro del margen de error).
  const offset = now.getTime() - new Date(batch.sentAt).getTime();
  const earliest = session.startedAt.getTime() - 60_000;
  const latest = (finishedAt ?? now).getTime();

  const rows: Prisma.ProctoringEventCreateManyInput[] = [];
  for (const event of batch.events) {
    const definition = EVENT_CATALOG[event.type];
    // Simular exige el modo demostración; cámara y micrófono, que la sesión los tenga autorizados.
    if (event.simulated && !attempt.exam.simulationEnabled) continue;
    if ("requires" in definition && definition.requires === "camera" && !session.cameraEnabled) continue;
    if ("requires" in definition && definition.requires === "microphone" && !session.microphoneEnabled) continue;
    const corrected = new Date(event.occurredAt).getTime() + offset;
    if (corrected > latest + 5_000) continue; // Después de entregar: no cuenta.
    rows.push({
      sessionId: session.id,
      clientEventId: event.clientEventId,
      type: event.type,
      category: definition.category,
      severity: definition.severity,
      occurredAt: new Date(Math.min(Math.max(corrected, earliest), latest)),
      receivedAt: now,
      durationSec: event.durationSec ?? null,
      confidence: event.confidence ?? null,
      metadata: event.metadata as Prisma.InputJsonValue,
      source: event.simulated ? "SIMULATION" : "BROWSER",
    });
  }

  const inserted = rows.length ? (await prisma.proctoringEvent.createMany({ data: rows, skipDuplicates: true })).count : 0;
  const lastEventAt = rows.length ? new Date(Math.max(...rows.map((row) => new Date(row.occurredAt).getTime()))) : undefined;
  await prisma.proctoringSession.update({
    where: { id: session.id },
    data: {
      lastSeenAt: finishedAt ? undefined : now,
      ...(inserted ? { eventCount: { increment: inserted } } : {}),
      ...(inserted && lastEventAt && (!session.lastEventAt || lastEventAt > session.lastEventAt) ? { lastEventAt } : {}),
    },
  });
  // Eventos nuevos: el orquestador vuelve a analizar la sesión (reglas baratas, síncronas).
  if (inserted) await analyzeSessionSafely({ sessionId: session.id }, now);
  return { accepted: inserted, serverNow: now.toISOString() };
}
