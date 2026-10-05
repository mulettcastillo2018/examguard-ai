import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Ingesta de eventos de supervisión contra la base real. Requiere DATABASE_URL.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("supervisión: sesiones y eventos", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;
  const at = (minutes: number) => new Date(Date.UTC(2032, 4, 10, 13, 0) + minutes * 60_000);

  let db: typeof import("@/lib/db").prisma;
  let attempts: typeof import("@/modules/attempts/attempts");
  let proctoring: typeof import("@/modules/proctoring/proctoring");
  const ids: Record<string, string> = {};
  let teacher: CurrentUser;
  let ana: CurrentUser; // autoriza la cámara
  let beto: CurrentUser; // no autoriza nada

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });
  const event = (id: string, type: string, occurredAt: Date, extra: Record<string, unknown> = {}) => ({
    clientEventId: `${id}-${suffix}`,
    type,
    occurredAt: occurredAt.toISOString(),
    ...extra,
  });
  const sessionOf = (attemptId: string) => db.proctoringSession.findUniqueOrThrow({ where: { attemptId }, include: { events: { orderBy: { occurredAt: "asc" } } } });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    attempts = await import("@/modules/attempts/attempts");
    proctoring = await import("@/modules/proctoring/proctoring");
    const exams = await import("@/modules/exams/exams");
    const bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const institution = await db.institution.create({ data: { name: "Supervisión (pruebas)", slug: `sup-${suffix}` } });
    ids.institution = institution.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    teacher = actorOf(await createCredentialUser({ ...base, name: "Docente", email: email("docente"), role: "TEACHER" }));
    ana = actorOf(await createCredentialUser({ ...base, name: "Ana", email: email("ana"), role: "STUDENT" }));
    beto = actorOf(await createCredentialUser({ ...base, name: "Beto", email: email("beto"), role: "STUDENT" }));
    const course = await db.course.create({
      data: {
        institutionId: institution.id,
        code: `S-${suffix}`,
        name: "Curso",
        period: "2032-1",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: [{ studentId: ana.id }, { studentId: beto.id }] },
      },
    });
    const question = await bank.createQuestion(teacher, { type: "TRUE_FALSE", prompt: "¿Sí?", points: 1, answerKey: { value: true }, tags: [] });
    const make = async (title: string, simulationEnabled: boolean) => {
      const exam = await exams.createExam(teacher, {
        title,
        courseId: course.id,
        startsAt: at(0),
        endsAt: at(240),
        durationMinutes: 60,
        maxAttempts: 1,
        proctoring: { camera: "requested" },
        simulationEnabled,
      });
      await exams.addQuestionsFromBank(teacher, exam.id, [question.id]);
      await exams.publishExam(teacher, exam.id, at(-10));
      return exam.id;
    };
    ids.demo = await make("Con simulador", true);
    ids.real = await make("Sin simulador", false);
  });

  afterAll(async () => {
    if (!db || !ids.institution) return;
    await db.auditLog.deleteMany({ where: { institutionId: ids.institution } });
    await db.exam.deleteMany({ where: { institutionId: ids.institution } });
    await db.question.deleteMany({ where: { institutionId: ids.institution } });
    await db.course.deleteMany({ where: { institutionId: ids.institution } });
    await db.user.deleteMany({ where: { institutionId: ids.institution } });
    await db.institution.delete({ where: { id: ids.institution } });
    await db.$disconnect();
  });

  it("al empezar se crea la sesión con lo autorizado, el equipo y el evento de inicio", async () => {
    const device = { browser: "Edge", os: "Windows", device: "desktop" };
    ids.ana = await attempts.startAttempt(ana, ids.demo as string, { clientId: "pc-ana", consent: { camera: true, microphone: false }, device }, at(1));
    ids.beto = await attempts.startAttempt(beto, ids.demo as string, { clientId: "pc-beto", consent: { camera: false, microphone: false } }, at(1));
    const session = await sessionOf(ids.ana);
    expect(session).toMatchObject({ cameraEnabled: true, microphoneEnabled: false, fullscreenRequested: true, ...device, eventCount: 1 });
    expect(session.events.map((e) => [e.type, e.source])).toEqual([["EXAM_STARTED", "SERVER"]]);
  });

  it("corrige el reloj del navegador, toma categoría y severidad del catálogo y no duplica", async () => {
    // El reloj del equipo va 10 minutos atrasado: el servidor recibe a los 20 y el navegador dice 10.
    const batch = {
      clientId: "pc-ana",
      sentAt: at(10).toISOString(),
      events: [event("e1", "TAB_SWITCH", at(9), { durationSec: 14 }), event("e2", "PASTE", at(9.5), { metadata: { length: 42 } })],
    };
    expect(await proctoring.ingestEvents(ana, ids.ana as string, batch, at(20))).toMatchObject({ accepted: 2 });
    expect(await proctoring.ingestEvents(ana, ids.ana as string, batch, at(20.1))).toMatchObject({ accepted: 0 });
    const session = await sessionOf(ids.ana as string);
    expect(session.eventCount).toBe(3);
    const tab = session.events.find((e) => e.type === "TAB_SWITCH")!;
    expect(tab).toMatchObject({ category: "FOCUS", severity: "MEDIUM", durationSec: 14, source: "BROWSER" });
    expect(tab.occurredAt.toISOString()).toBe(at(19).toISOString());
    expect(session.events.find((e) => e.type === "PASTE")?.metadata).toEqual({ length: 42 });
  });

  it("solo simula cámara si está autorizada y solo en modo demostración", async () => {
    const simulated = (attemptId: string, actor: CurrentUser, clientId: string, key: string) =>
      proctoring.ingestEvents(
        actor,
        attemptId,
        { clientId, sentAt: at(30).toISOString(), events: [event(key, "MULTIPLE_FACES", at(30), { confidence: 0.92, simulated: true, durationSec: 8 })] },
        at(30),
      );
    expect(await simulated(ids.ana as string, ana, "pc-ana", "s1")).toMatchObject({ accepted: 1 });
    expect((await sessionOf(ids.ana as string)).events.find((e) => e.type === "MULTIPLE_FACES")).toMatchObject({
      source: "SIMULATION",
      severity: "HIGH",
      confidence: 0.92,
    });
    // Beto no autorizó la cámara: negarse nunca genera eventos de cámara, ni simulados.
    expect(await simulated(ids.beto as string, beto, "pc-beto", "s2")).toMatchObject({ accepted: 0 });

    const realAttempt = await attempts.startAttempt(beto, ids.real as string, { clientId: "pc-beto", consent: { camera: true, microphone: false } }, at(31));
    expect(
      await proctoring.ingestEvents(
        beto,
        realAttempt,
        { clientId: "pc-beto", sentAt: at(32).toISOString(), events: [event("s3", "TAB_SWITCH", at(32), { simulated: true })] },
        at(32),
      ),
    ).toMatchObject({ accepted: 0 });
  });

  it("un lote vacío es señal de vida y un cambio de dispositivo queda registrado", async () => {
    await proctoring.ingestEvents(beto, ids.beto as string, { clientId: "pc-beto", sentAt: at(40).toISOString(), events: [] }, at(40));
    expect((await sessionOf(ids.beto as string)).lastSeenAt?.toISOString()).toBe(at(40).toISOString());
    await attempts.claimAttempt(beto, ids.beto as string, "tablet-beto", at(41));
    expect((await sessionOf(ids.beto as string)).events.map((e) => e.type)).toContain("DEVICE_SWITCHED");
  });

  it("al entregar cierra la sesión y deja de aceptar eventos", async () => {
    await attempts.submitAttempt(ana, ids.ana as string, "pc-ana", at(50));
    let session = await sessionOf(ids.ana as string);
    expect(session.endedAt?.toISOString()).toBe(at(50).toISOString());
    expect(session.events.at(-1)?.type).toBe("EXAM_SUBMITTED");

    // El lote en vuelo se acepta, pero lo ocurrido después de entregar no cuenta.
    const late = {
      clientId: "pc-ana",
      sentAt: at(50.5).toISOString(),
      events: [event("t1", "WINDOW_BLUR", at(49.9)), event("t2", "WINDOW_BLUR", at(50.4))],
    };
    expect(await proctoring.ingestEvents(ana, ids.ana as string, late, at(50.5))).toMatchObject({ accepted: 1 });
    await expect(proctoring.ingestEvents(ana, ids.ana as string, { ...late, events: [] }, at(52))).rejects.toMatchObject({ status: 409 });
    session = await sessionOf(ids.ana as string);
    expect(session.events.filter((e) => e.type === "WINDOW_BLUR")).toHaveLength(1);
  });

  it("valida el lote y el alcance", async () => {
    await expect(proctoring.ingestEvents(beto, ids.beto as string, { clientId: "x", sentAt: "ayer", events: [] }, at(60))).rejects.toMatchObject({
      status: 400,
    });
    await expect(proctoring.ingestEvents(beto, ids.ana as string, { clientId: "x", sentAt: at(60).toISOString(), events: [] }, at(60))).rejects.toMatchObject({
      status: 404,
    });
    await expect(proctoring.ingestEvents(teacher, ids.beto as string, { clientId: "x", sentAt: at(60).toISOString(), events: [] }, at(60))).rejects.toMatchObject({
      status: 403,
    });
  });
});
