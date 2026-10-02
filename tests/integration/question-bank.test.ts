import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/modules/auth/session";

// Banco de preguntas contra la base real. Requiere DATABASE_URL.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("banco de preguntas", () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = (name: string) => `${name}.${suffix}@pruebas.test`;

  let db: typeof import("@/lib/db").prisma;
  let bank: typeof import("@/modules/question-bank/question-bank");
  const ids: Record<string, string> = {};
  let teacher: CurrentUser;
  let colleague: CurrentUser;
  let foreignTeacher: CurrentUser;
  let student: CurrentUser;

  const actorOf = (user: { id: string; name: string; email: string; role: CurrentUser["role"]; institutionId: string }): CurrentUser => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    isMinor: false,
    mustChangePassword: false,
  });

  const single = {
    type: "SINGLE_CHOICE" as const,
    prompt: "¿Cuánto es 2 + 2?",
    points: 1.5,
    options: [
      { id: "opta0001", label: "3" },
      { id: "optb0002", label: "4" },
    ],
    answerKey: { correctOptionIds: ["optb0002"] },
    category: "Aritmética",
    tags: ["Básico", "suma", "básico"],
  };

  beforeAll(async () => {
    ({ prisma: db } = await import("@/lib/db"));
    bank = await import("@/modules/question-bank/question-bank");
    const { createCredentialUser } = await import("@/modules/auth/credentials");

    const [a, b] = await Promise.all([
      db.institution.create({ data: { name: "Banco A (pruebas)", slug: `qb-a-${suffix}` } }),
      db.institution.create({ data: { name: "Banco B (pruebas)", slug: `qb-b-${suffix}` } }),
    ]);
    ids.a = a.id;
    ids.b = b.id;
    const password = "Prueba-integracion-2026";
    const base = { password, mustChangePassword: false };
    teacher = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Docente A", email: email("docente-a"), role: "TEACHER" }));
    colleague = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Colega A", email: email("colega-a"), role: "TEACHER" }));
    foreignTeacher = actorOf(await createCredentialUser({ ...base, institutionId: b.id, name: "Docente B", email: email("docente-b"), role: "TEACHER" }));
    student = actorOf(await createCredentialUser({ ...base, institutionId: a.id, name: "Estudiante A", email: email("estudiante-a"), role: "STUDENT" }));
  });

  afterAll(async () => {
    if (!db) return;
    const institutionIds = [ids.a, ids.b].filter((id): id is string => Boolean(id));
    await db.auditLog.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.question.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.user.deleteMany({ where: { institutionId: { in: institutionIds } } });
    await db.institution.deleteMany({ where: { id: { in: institutionIds } } });
    await db.$disconnect();
  });

  it("crea una pregunta normalizando etiquetas y la audita", async () => {
    const question = await bank.createQuestion(teacher, single);
    ids.single = question.id;
    expect(question.points).toBe(1.5);
    expect(question.tags).toEqual(["básico", "suma"]);
    expect(question.answerKey).toEqual({ correctOptionIds: ["optb0002"] });
    expect(await db.auditLog.count({ where: { action: "QUESTION_CREATED", entityId: question.id } })).toBe(1);
  });

  it("rechaza contenido inválido con el código de la regla", async () => {
    await expect(
      bank.createQuestion(teacher, { ...single, answerKey: { correctOptionIds: ["optb0002", "opta0001"] } }),
    ).rejects.toMatchObject({ status: 400, issues: [expect.objectContaining({ message: "oneCorrect" })] });
    await expect(bank.createQuestion(teacher, { ...single, points: 0.3 })).rejects.toMatchObject({ status: 400 });
    await expect(
      bank.createQuestion(teacher, { ...single, answerKey: { correctOptionIds: ["inexistente"] } }),
    ).rejects.toMatchObject({ status: 400, issues: [expect.objectContaining({ message: "unknownCorrectOption" })] });
  });

  it("guarda los otros tipos y marca cuáles se califican a mano", async () => {
    const meta = { points: 1, category: "Ciencias", tags: [] };
    await bank.createQuestion(teacher, { ...meta, type: "TRUE_FALSE", prompt: "El agua hierve a 100 °C al nivel del mar.", answerKey: { value: true } });
    await bank.createQuestion(teacher, { ...meta, type: "SHORT_ANSWER", prompt: "Capital de Colombia", answerKey: { accepted: ["Bogotá"] } });
    const long = await bank.createQuestion(teacher, { ...meta, type: "LONG_ANSWER", prompt: "Explica la fotosíntesis.", answerKey: { rubric: "Menciona luz y clorofila." } });
    ids.long = long.id;

    const { questions, categories, tags } = await bank.listQuestions(teacher);
    expect(questions).toHaveLength(4);
    expect(categories).toEqual(["Aritmética", "Ciencias"]);
    expect(tags).toEqual(["básico", "suma"]);
    expect(questions.find((q) => q.id === long.id)?.autoGradable).toBe(false);
    expect(questions.find((q) => q.id === ids.single)?.autoGradable).toBe(true);
    // La lista no lleva la clave de respuesta.
    expect(questions.every((q) => !("answerKey" in q))).toBe(true);
  });

  it("filtra por texto, tipo, categoría y etiqueta", async () => {
    expect((await bank.listQuestions(teacher, { q: "FOTOSÍNTESIS" })).questions.map((q) => q.id)).toEqual([ids.long]);
    expect((await bank.listQuestions(teacher, { type: "SINGLE_CHOICE" })).questions.map((q) => q.id)).toEqual([ids.single]);
    expect((await bank.listQuestions(teacher, { category: "Ciencias" })).questions).toHaveLength(3);
    expect((await bank.listQuestions(teacher, { tag: "suma" })).questions.map((q) => q.id)).toEqual([ids.single]);
    // Un tipo desconocido se ignora en lugar de romper la consulta.
    expect((await bank.listQuestions(teacher, { type: "OTRO" })).questions).toHaveLength(4);
  });

  it("edita, duplica, archiva y restaura con su registro de auditoría", async () => {
    const id = ids.single as string;
    const updated = await bank.updateQuestion(teacher, id, {
      type: "MULTIPLE_CHOICE",
      prompt: "¿Cuáles son pares?",
      points: 2,
      options: [
        { id: "opta0001", label: "2" },
        { id: "optb0002", label: "3" },
        { id: "optc0003", label: "4" },
      ],
      answerKey: { correctOptionIds: ["opta0001", "optc0003"] },
      category: "",
      tags: [],
    });
    expect(updated.type).toBe("MULTIPLE_CHOICE");
    expect(updated.category).toBeNull();

    const copy = await bank.duplicateQuestion(teacher, id);
    expect(copy.prompt).toBe("¿Cuáles son pares? (copia)");
    expect(copy.answerKey).toEqual({ correctOptionIds: ["opta0001", "optc0003"] });
    const copyAudit = await db.auditLog.findFirst({ where: { action: "QUESTION_CREATED", entityId: copy.id } });
    expect(copyAudit?.metadata).toEqual({ duplicatedFrom: id });

    await bank.setQuestionArchived(teacher, copy.id, true);
    expect((await bank.listQuestions(teacher)).questions.some((q) => q.id === copy.id)).toBe(false);
    expect((await bank.listQuestions(teacher, { archived: true })).questions.map((q) => q.id)).toEqual([copy.id]);
    await bank.setQuestionArchived(teacher, copy.id, false);
    expect((await bank.listQuestions(teacher)).questions.some((q) => q.id === copy.id)).toBe(true);

    const actions = await db.auditLog.findMany({ where: { entityId: { in: [id, copy.id] } }, select: { action: true } });
    expect(actions.map((a) => a.action).sort()).toEqual(
      ["QUESTION_ARCHIVED", "QUESTION_CREATED", "QUESTION_CREATED", "QUESTION_RESTORED", "QUESTION_UPDATED"].sort(),
    );
  });

  it("cada banco es privado de su docente y de su institución", async () => {
    const id = ids.single as string;
    expect((await bank.listQuestions(colleague)).questions).toHaveLength(0);
    expect((await bank.listQuestions(foreignTeacher)).questions).toHaveLength(0);
    await expect(bank.getQuestion(colleague, id)).rejects.toMatchObject({ status: 404 });
    await expect(bank.getQuestion(foreignTeacher, id)).rejects.toMatchObject({ status: 404 });
    await expect(bank.updateQuestion(foreignTeacher, id, single)).rejects.toMatchObject({ status: 404 });
    await expect(bank.duplicateQuestion(colleague, id)).rejects.toMatchObject({ status: 404 });
    await expect(bank.setQuestionArchived(colleague, id, true)).rejects.toMatchObject({ status: 404 });
  });

  it("un estudiante no tiene banco de preguntas", async () => {
    await expect(bank.listQuestions(student)).rejects.toMatchObject({ status: 403 });
    await expect(bank.createQuestion(student, single)).rejects.toMatchObject({ status: 403 });
  });

});
