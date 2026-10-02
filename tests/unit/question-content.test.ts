import { describe, expect, it } from "vitest";
import { formatPoints, isAutoGradable, newOptionId, parsePoints, questionInputSchema } from "@/modules/question-bank/content";

const options = [
  { id: "opta0001", label: "París" },
  { id: "optb0002", label: "Lima" },
  { id: "optc0003", label: "Bogotá" },
];

const issues = (input: unknown) => {
  const parsed = questionInputSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

describe("contenido de las preguntas", () => {
  it("acepta una pregunta de opción única válida y normaliza categoría y etiquetas", () => {
    const parsed = questionInputSchema.parse({
      type: "SINGLE_CHOICE",
      prompt: "¿Capital de Colombia?",
      points: 1.5,
      options,
      answerKey: { correctOptionIds: ["optc0003"] },
      category: "  ",
      tags: ["Geografía", "geografía", "capitales"],
    });
    expect(parsed.category).toBeNull();
    expect(parsed.tags).toEqual(["geografía", "capitales"]);
  });

  it("opción única exige exactamente una correcta; múltiple, al menos una", () => {
    expect(issues({ type: "SINGLE_CHOICE", prompt: "Pregunta", points: 1, options, answerKey: { correctOptionIds: ["opta0001", "optb0002"] } })).toContain("oneCorrect");
    expect(issues({ type: "MULTIPLE_CHOICE", prompt: "Pregunta", points: 1, options, answerKey: { correctOptionIds: [] } })).toContain("atLeastOneCorrect");
    expect(issues({ type: "MULTIPLE_CHOICE", prompt: "Pregunta", points: 1, options, answerKey: { correctOptionIds: ["opta0001", "optc0003"] } })).toEqual([]);
  });

  it("la respuesta correcta debe ser una de las opciones", () => {
    expect(issues({ type: "SINGLE_CHOICE", prompt: "Pregunta", points: 1, options, answerKey: { correctOptionIds: ["noexiste"] } })).toContain("unknownCorrectOption");
  });

  it("rechaza opciones repetidas, de menos o de más", () => {
    expect(issues({ type: "SINGLE_CHOICE", prompt: "Pregunta", points: 1, options: [options[0]], answerKey: { correctOptionIds: ["opta0001"] } })).toContain("minOptions");
    expect(
      issues({ type: "SINGLE_CHOICE", prompt: "Pregunta", points: 1, options: [options[0], { id: "optz0009", label: "parís" }], answerKey: { correctOptionIds: ["opta0001"] } }),
    ).toContain("duplicateOptions");
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `opt${i}aaaa`, label: `Opción ${i}` }));
    expect(issues({ type: "MULTIPLE_CHOICE", prompt: "Pregunta", points: 1, options: many, answerKey: { correctOptionIds: ["opt0aaaa"] } })).toContain("maxOptions");
  });

  it("los puntajes van en múltiplos de 0,25 entre 0,25 y 100", () => {
    const tf = (points: number) => ({ type: "TRUE_FALSE", prompt: "Pregunta", points, answerKey: { value: true } });
    expect(issues(tf(0.75))).toEqual([]);
    expect(issues(tf(0.3))).toContain("points");
    expect(issues(tf(0))).toContain("points");
    expect(issues(tf(101))).toContain("points");
  });

  it("verdadero/falso, corta y larga no llevan opciones", () => {
    expect(issues({ type: "TRUE_FALSE", prompt: "Pregunta", points: 1, options, answerKey: { value: false } }).length).toBeGreaterThan(0);
    expect(issues({ type: "SHORT_ANSWER", prompt: "Pregunta", points: 1, answerKey: { accepted: ["Bogotá"] } })).toEqual([]);
    expect(issues({ type: "LONG_ANSWER", prompt: "Explica la fotosíntesis", points: 5, answerKey: { rubric: "Menciona luz y clorofila" } })).toEqual([]);
  });

  it("sabe cuáles se califican solas", () => {
    expect(isAutoGradable({ type: "TRUE_FALSE", answerKey: { value: true } })).toBe(true);
    expect(isAutoGradable({ type: "SHORT_ANSWER", answerKey: { accepted: [] } })).toBe(false);
    expect(isAutoGradable({ type: "SHORT_ANSWER", answerKey: { accepted: ["4"] } })).toBe(true);
    expect(isAutoGradable({ type: "LONG_ANSWER", answerKey: { rubric: "" } })).toBe(false);
  });

  it("genera identificadores de opción válidos", () => {
    for (let i = 0; i < 50; i++) expect(newOptionId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("lee los puntos con coma o punto decimal y rechaza lo que no es número", () => {
    expect(parsePoints("1,5")).toBe(1.5);
    expect(parsePoints("1.5")).toBe(1.5);
    expect(parsePoints(" 2 ")).toBe(2);
    expect(parsePoints("0,25")).toBe(0.25);
    for (const invalid of ["", "abc", "1,5,0", "-1", "1e2", "1.000,5"]) expect(parsePoints(invalid)).toBeNaN();
    // NaN no pasa el esquema: el formulario muestra el error de puntos en lugar de guardar otro valor.
    expect(questionInputSchema.safeParse({ type: "TRUE_FALSE", prompt: "Pregunta", points: parsePoints("x"), answerKey: { value: true } }).success).toBe(false);
    expect(formatPoints(1.5)).toBe("1,5");
    expect(formatPoints(3)).toBe("3");
  });
});
