import { describe, expect, it } from "vitest";
import { isAnswered, parseAnswerValue } from "@/modules/attempts/answers";
import { gradeAnswer, normalizeText, summarizeGrades } from "@/modules/attempts/grading";
import { computeDeadline, isPastDeadline, isWindowOpen, SAVE_GRACE_MS } from "@/modules/attempts/timing";

const single = { type: "SINGLE_CHOICE" as const, points: 2, answerKey: { correctOptionIds: ["b"] } };
const multiple = { type: "MULTIPLE_CHOICE" as const, points: 1.5, answerKey: { correctOptionIds: ["a", "c"] } };
const trueFalse = { type: "TRUE_FALSE" as const, points: 1, answerKey: { value: false } };
const short = { type: "SHORT_ANSWER" as const, points: 1, answerKey: { accepted: ["Bogotá", "Bogotá D.C."] } };
const shortManual = { type: "SHORT_ANSWER" as const, points: 1, answerKey: { accepted: [] } };
const long = { type: "LONG_ANSWER" as const, points: 3, answerKey: { rubric: "" } };

describe("forma de las respuestas", () => {
  it("valida según el tipo de pregunta", () => {
    expect(parseAnswerValue("SINGLE_CHOICE", { optionId: "b" }).success).toBe(true);
    expect(parseAnswerValue("SINGLE_CHOICE", { optionIds: ["b"] }).success).toBe(false);
    expect(parseAnswerValue("SHORT_ANSWER", { text: "x".repeat(201) }).success).toBe(false);
    expect(parseAnswerValue("LONG_ANSWER", { text: "x".repeat(10_000) }).success).toBe(true);
  });

  it("distingue respondida de vacía", () => {
    expect(isAnswered("SINGLE_CHOICE", { optionId: null })).toBe(false);
    expect(isAnswered("MULTIPLE_CHOICE", { optionIds: [] })).toBe(false);
    expect(isAnswered("TRUE_FALSE", { value: false })).toBe(true);
    expect(isAnswered("LONG_ANSWER", { text: "   " })).toBe(false);
    expect(isAnswered("SHORT_ANSWER", "basura")).toBe(false);
  });
});

describe("calificación automática", () => {
  it("opción única y verdadero o falso", () => {
    expect(gradeAnswer(single, { optionId: "b" })).toBe(2);
    expect(gradeAnswer(single, { optionId: "a" })).toBe(0);
    expect(gradeAnswer(trueFalse, { value: false })).toBe(1);
    expect(gradeAnswer(trueFalse, { value: true })).toBe(0);
  });

  it("opción múltiple es todo o nada", () => {
    expect(gradeAnswer(multiple, { optionIds: ["c", "a"] })).toBe(1.5);
    expect(gradeAnswer(multiple, { optionIds: ["a"] })).toBe(0);
    expect(gradeAnswer(multiple, { optionIds: ["a", "b", "c"] })).toBe(0);
  });

  it("respuesta corta sin mayúsculas, tildes ni espacios de más", () => {
    expect(normalizeText("  Bogotá   D.C. ")).toBe("bogota d.c");
    expect(gradeAnswer(short, { text: "bogota" })).toBe(1);
    expect(gradeAnswer(short, { text: "BOGOTÁ d.c." })).toBe(1);
    expect(gradeAnswer(short, { text: "Medellín" })).toBe(0);
  });

  it("deja para el docente las abiertas y las cortas sin respuestas aceptadas", () => {
    expect(gradeAnswer(long, { text: "Mi ensayo" })).toBeNull();
    expect(gradeAnswer(shortManual, { text: "algo" })).toBeNull();
  });

  it("sin responder vale 0 y no pasa por la cola manual", () => {
    expect(gradeAnswer(long, { text: "" })).toBe(0);
    expect(gradeAnswer(single, undefined)).toBe(0);
    expect(gradeAnswer(multiple, { optionIds: [] })).toBe(0);
  });

  it("la nota queda pendiente mientras falte calificar a mano", () => {
    expect(summarizeGrades([2, 0, 1.5])).toEqual({ score: 3.5, pending: 0 });
    expect(summarizeGrades([2, null, 1])).toEqual({ score: null, pending: 1 });
    expect(summarizeGrades([])).toEqual({ score: 0, pending: 0 });
  });
});

describe("tiempo del examen", () => {
  const startedAt = new Date("2026-10-10T13:00:00Z");
  const endsAt = new Date("2026-10-10T15:00:00Z");

  it("la hora límite suma duración y tiempo extra sin pasar del cierre", () => {
    expect(computeDeadline(startedAt, 60, 0, endsAt).toISOString()).toBe("2026-10-10T14:00:00.000Z");
    expect(computeDeadline(startedAt, 60, 15, endsAt).toISOString()).toBe("2026-10-10T14:15:00.000Z");
    // Quien empieza tarde no recibe más tiempo que el cierre.
    expect(computeDeadline(new Date("2026-10-10T14:30:00Z"), 60, 0, endsAt).toISOString()).toBe(endsAt.toISOString());
  });

  it("acepta guardados dentro del margen de red", () => {
    const deadline = new Date("2026-10-10T14:00:00Z");
    expect(isPastDeadline(deadline, new Date(deadline.getTime() + SAVE_GRACE_MS))).toBe(false);
    expect(isPastDeadline(deadline, new Date(deadline.getTime() + SAVE_GRACE_MS + 1))).toBe(true);
  });

  it("la ventana se abre en el inicio y se cierra en el fin", () => {
    expect(isWindowOpen({ startsAt: startedAt, endsAt }, startedAt)).toBe(true);
    expect(isWindowOpen({ startsAt: startedAt, endsAt }, endsAt)).toBe(false);
    expect(isWindowOpen({ startsAt: null, endsAt }, startedAt)).toBe(false);
  });
});
