import { z } from "zod";

// Catálogo de eventos de supervisión, compartido por el navegador y el servidor. La
// categoría y la severidad las decide este catálogo, nunca el navegador. Un evento es un
// hecho observable con su hora; ninguno, por sí solo, significa nada.

export type EventCategory = "EXAM" | "ACTIVITY" | "FOCUS" | "VISION" | "AUDIO" | "CONNECTION";
export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type EventSource = "BROWSER" | "SIMULATION" | "SERVER";

interface EventDefinition {
  category: EventCategory;
  severity: Severity;
  /** Quién puede originarlo: el servidor (inicio, entrega...) o la pantalla del examen. */
  origin: "server" | "client";
  /** Requiere cámara o micrófono autorizados en la sesión (también para simularlo). */
  requires?: "camera" | "microphone";
}

export const EVENT_CATALOG = {
  EXAM_STARTED: { category: "EXAM", severity: "LOW", origin: "server" },
  EXAM_SUBMITTED: { category: "EXAM", severity: "LOW", origin: "server" },
  EXAM_AUTO_SUBMITTED: { category: "EXAM", severity: "LOW", origin: "server" },
  DEVICE_SWITCHED: { category: "EXAM", severity: "MEDIUM", origin: "server" },
  LOW_ACTIVITY: { category: "ACTIVITY", severity: "LOW", origin: "client" },
  PASTE: { category: "ACTIVITY", severity: "LOW", origin: "client" },
  WINDOW_BLUR: { category: "FOCUS", severity: "LOW", origin: "client" },
  TAB_SWITCH: { category: "FOCUS", severity: "MEDIUM", origin: "client" },
  FULLSCREEN_EXIT: { category: "FOCUS", severity: "MEDIUM", origin: "client" },
  CONNECTION_LOST: { category: "CONNECTION", severity: "LOW", origin: "client" },
  FACE_NOT_VISIBLE: { category: "VISION", severity: "MEDIUM", origin: "client", requires: "camera" },
  FACE_OUT_OF_FRAME: { category: "VISION", severity: "LOW", origin: "client", requires: "camera" },
  MULTIPLE_FACES: { category: "VISION", severity: "HIGH", origin: "client", requires: "camera" },
  AUDIO_ACTIVITY: { category: "AUDIO", severity: "LOW", origin: "client", requires: "microphone" },
  MICROPHONE_DISCONNECTED: { category: "AUDIO", severity: "LOW", origin: "client", requires: "microphone" },
} as const satisfies Record<string, EventDefinition>;

export type EventType = keyof typeof EVENT_CATALOG;
export const EVENT_TYPES = Object.keys(EVENT_CATALOG) as EventType[];
export const CLIENT_EVENT_TYPES = EVENT_TYPES.filter((type) => EVENT_CATALOG[type].origin === "client");

/** Eventos que ofrece el simulador de la demostración (sección 22 de la especificación). */
export const SIMULATED_EVENTS: { type: EventType; durationSec?: number; confidence?: number }[] = [
  { type: "LOW_ACTIVITY", durationSec: 120 },
  { type: "TAB_SWITCH", durationSec: 15 },
  { type: "FULLSCREEN_EXIT" },
  { type: "FACE_NOT_VISIBLE", durationSec: 40, confidence: 0.9 },
  { type: "MULTIPLE_FACES", durationSec: 8, confidence: 0.92 },
  { type: "AUDIO_ACTIVITY", durationSec: 25, confidence: 0.85 },
  { type: "CONNECTION_LOST", durationSec: 70 },
];

/** Metadatos pequeños y planos: nunca contenido (ni texto pegado, ni imágenes, ni audio). */
const metadataSchema = z
  .record(z.string().max(40), z.union([z.string().max(120), z.number(), z.boolean()]))
  .refine((value) => Object.keys(value).length <= 10, "metadata")
  .default({});

export const clientEventSchema = z.object({
  clientEventId: z.string().min(8).max(64),
  type: z.enum(CLIENT_EVENT_TYPES as [EventType, ...EventType[]]),
  occurredAt: z.iso.datetime(),
  durationSec: z.number().int().min(0).max(86_400).optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: metadataSchema,
  simulated: z.boolean().optional(),
});
export type ClientEvent = z.infer<typeof clientEventSchema>;

export const eventBatchSchema = z.object({
  clientId: z.string().min(1).max(64),
  /** Hora del navegador al enviar: con la del servidor se corrige el reloj de cada evento. */
  sentAt: z.iso.datetime(),
  events: z.array(clientEventSchema).max(50),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;
