import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Orquestador de agentes contra la base real: eventos → señales → revisión recomendada.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("agentes y motor de reglas", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;
  const at = (minutes: number) => new Date(Date.UTC(2033, 2, 10, 13, 0) + minutes * 60_000);

  let db: typeof import("@/lib/db").prisma;
  let attempts: typeof import("@/modules/attempts/attempts");
  let proctoring: typeof import("@/modules/proctoring/proctoring");
  const ids: Record<string, string> = {};
  const students: Record<string, CurrentUser> = {};
  let counter = 0;

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });
  const send = (who: string, events: { type: string; minute: number; durationSec?: number; confidence?: number; simulated?: boolean }[], minute: number) =>
    proctoring.ingestEvents(
      students[who]!,
      ids[who]!,
      {
        clientId: `pc-${who}`,
        sentAt: at(minute).toISOString(),
        events: events.map((event) => ({
          clientEventId: `evt-${suffix}-${++counter}`,
          type: event.type,
          occurredAt: at(event.minute).toISOString(),
          durationSec: event.durationSec,
          confidence: event.confidence,
          simulated: event.simulated,
        })),
      },
      at(minute),
    );
  const session = (who: string) =>
    db.proctoringSession.findUniqueOrThrow({ where: { attemptId: ids[who]! }, include: { signals: true, agentRuns: true } });

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    attempts = await import("@/modules/attempts/attempts");
    proctoring = await import("@/modules/proctoring/proctoring");
    const exams = await import("@/modules/exams/exams");
    const bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    // Umbral propio de la institución: una sola salida de pantalla completa ya es señal.
    const institution = await db.institution.create({
      data: { name: "Agentes (pruebas)", slug: `agt-${suffix}`, policy: { create: { ruleThresholds: { fullscreenExits: 1 } } } },
    });
    ids.institution = institution.id;
    const base = { institutionId: institution.id, password: "Prueba-integracion-2026", mustChangePassword: false };
    const teacher = actorOf(await createCredentialUser({ ...base, name: "Docente", email: email("docente"), role: "TEACHER" }));
    for (const name of ["ana", "beto", "caro"]) {
      students[name] = actorOf(await createCredentialUser({ ...base, name, email: email(name), role: "STUDENT" }));
    }
    const course = await db.course.create({
      data: {
        institutionId: institution.id,
        code: `A-${suffix}`,
        name: "Curso",
        period: "2033-1",
        teachers: { create: [{ teacherId: teacher.id }] },
        enrollments: { create: Object.values(students).map((student) => ({ studentId: student.id })) },
      },
    });
    const question = await bank.createQuestion(teacher, { type: "TRUE_FALSE", prompt: "¿Sí?", points: 1, answerKey: { value: true }, tags: [] });
    const exam = await exams.createExam(teacher, {
      title: "Con agentes",
      courseId: course.id,
      startsAt: at(0),
      endsAt: at(240),
      durationMinutes: 120,
      maxAttempts: 1,
      proctoring: { camera: "requested" },
      simulationEnabled: true,
    });
    await exams.addQuestionsFromBank(teacher, exam.id, [question.id]);
    await exams.publishExam(teacher, exam.id, at(-10));
    for (const name of Object.keys(students)) {
      ids[name] = await attempts.startAttempt(students[name]!, exam.id, { clientId: `pc-${name}`, consent: { camera: true, microphone: false } }, at(1));
    }
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

  it("una señal media sola no recomienda revisar; junto a otra de distinta categoría, sí", async () => {
    await send("ana", [
      { type: "TAB_SWITCH", minute: 10, durationSec: 8 },
      { type: "TAB_SWITCH", minute: 12, durationSec: 5 },
      { type: "WINDOW_BLUR", minute: 14, durationSec: 3 },
    ], 15);
    let current = await session("ana");
    expect(current.signals.map((signal) => signal.type)).toEqual(["FOCUS_CHANGES"]);
    expect(current.reviewStatus).toBe("NOT_REQUIRED");
    expect(current.signals[0]?.explanation).toBe(
      "Se registraron 3 salidas de la pestaña o pérdidas de foco de la ventana en menos de 10 minutos, entre las 08:10 y las 08:14.",
    );

    await send("ana", [{ type: "CONNECTION_LOST", minute: 20, durationSec: 90 }], 22);
    current = await session("ana");
    expect(current.signals.map((signal) => signal.type).sort()).toEqual(["CONNECTION_GAPS", "FOCUS_CHANGES"]);
    expect(current.reviewStatus).toBe("RECOMMENDED");
    // Cada análisis registra los cinco agentes, el motor de reglas y el de riesgo.
    expect(current.agentRuns.filter((run) => run.agent === "risk")).toHaveLength(2);
    expect(new Set(current.agentRuns.map((run) => run.agent))).toEqual(new Set(["activity", "focus", "vision", "audio", "connection", "rule-engine", "risk"]));
  });

  it("las señales se actualizan sin duplicarse y el resumen viejo se descarta", async () => {
    await db.proctoringSession.update({ where: { attemptId: ids.ana! }, data: { riskSummary: "Resumen anterior", riskSummaryProvider: "mock" } });
    await send("ana", [{ type: "TAB_SWITCH", minute: 16, durationSec: 4 }], 25);
    const current = await session("ana");
    const focus = current.signals.filter((signal) => signal.type === "FOCUS_CHANGES");
    expect(focus).toHaveLength(1);
    expect(focus[0]?.eventIds).toHaveLength(4);
    expect(current.riskSummary).toBeNull();
  });

  it("una señal alta (varios rostros) basta, y el umbral de la institución se aplica", async () => {
    await send("beto", [{ type: "MULTIPLE_FACES", minute: 30, confidence: 0.93, durationSec: 6, simulated: true }], 31);
    let current = await session("beto");
    expect(current.reviewStatus).toBe("RECOMMENDED");
    expect(current.signals[0]).toMatchObject({ type: "MULTIPLE_FACES", severity: "HIGH" });
    expect(current.signals[0]?.explanation).toContain("Eventos simulados (modo demostración).");

    await send("caro", [{ type: "FULLSCREEN_EXIT", minute: 40 }], 41);
    current = await session("caro");
    expect(current.signals.map((signal) => signal.type)).toEqual(["FULLSCREEN_EXITS"]);
  });

  it("nunca pisa una revisión ya hecha por una persona y analiza de nuevo al entregar", async () => {
    await db.proctoringSession.update({ where: { attemptId: ids.caro! }, data: { reviewStatus: "REVIEWED" } });
    await send("caro", [{ type: "MULTIPLE_FACES", minute: 50, confidence: 0.95 }], 51);
    expect((await session("caro")).reviewStatus).toBe("REVIEWED");

    const before = (await session("beto")).agentRuns.length;
    await attempts.submitAttempt(students.beto!, ids.beto!, "pc-beto", at(60));
    expect((await session("beto")).agentRuns.length).toBeGreaterThan(before);
  });
});
