import { describe, expect, it } from "vitest";
import { dateToZonedInput, zonedInputToDate } from "@/lib/time";
import {
  accommodationSchema,
  examSettingsSchema,
  getPublishProblems,
  isEmptyAccommodation,
  readProctoringConfig,
} from "@/modules/exams/settings";

const base = {
  title: "Parcial de derivadas",
  courseId: "curso-1",
  durationMinutes: 60,
  maxAttempts: 1,
  proctoring: {},
};

const issues = (input: unknown) => {
  const parsed = examSettingsSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

describe("fechas en la hora de Colombia", () => {
  it("convierte la fecha y hora del formulario a UTC y de vuelta", () => {
    const date = zonedInputToDate("2026-10-10T08:00");
    // Colombia está en UTC-5 todo el año.
    expect(date?.toISOString()).toBe("2026-10-10T13:00:00.000Z");
    expect(dateToZonedInput(new Date("2026-10-10T13:00:00.000Z"))).toBe("2026-10-10T08:00");
    // Cerca de la medianoche cambia el día.
    expect(dateToZonedInput(new Date("2026-10-11T03:30:00.000Z"))).toBe("2026-10-10T22:30");
  });

  it("sirve para otras zonas horarias, con horario de verano", () => {
    expect(zonedInputToDate("2026-07-01T12:00", "Europe/Madrid")?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedInputToDate("2026-01-15T12:00", "Europe/Madrid")?.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("rechaza textos que no son fechas", () => {
    for (const value of ["", "2026-10-10", "mañana", "2026-02-31T10:00", "2026-10-10T25:00"]) {
      expect(zonedInputToDate(value)).toBeNull();
    }
  });
});

describe("configuración del examen", () => {
  it("acepta un borrador sin ventana y normaliza los textos vacíos", () => {
    const parsed = examSettingsSchema.parse({ ...base, description: "  ", instructions: "" });
    expect(parsed.description).toBeNull();
    expect(parsed.instructions).toBeNull();
    expect(parsed.startsAt).toBeNull();
    expect(parsed.proctoring).toEqual({ camera: "requested", microphone: "off", fullscreen: "requested" });
  });

  it("exige que la ventana termine después de empezar", () => {
    const startsAt = new Date("2026-10-10T13:00:00Z");
    expect(issues({ ...base, startsAt, endsAt: startsAt })).toContain("windowOrder");
    expect(issues({ ...base, startsAt, endsAt: new Date("2026-10-10T15:00:00Z") })).toEqual([]);
  });

  it("valida título, duración e intentos", () => {
    expect(issues({ ...base, title: "x" })).toContain("title");
    expect(issues({ ...base, durationMinutes: 2 })).toContain("duration");
    expect(issues({ ...base, durationMinutes: 30.5 })).toContain("duration");
    expect(issues({ ...base, maxAttempts: 9 })).toContain("attempts");
  });

  it("la cámara solo se puede solicitar, nunca exigir", () => {
    expect(issues({ ...base, proctoring: { camera: "required" } })).not.toEqual([]);
    // Una configuración guardada vieja o rota cae en los valores por defecto.
    expect(readProctoringConfig({ camera: "required" })).toEqual({ camera: "requested", microphone: "off", fullscreen: "requested" });
    expect(readProctoringConfig(null).camera).toBe("requested");
  });
});

describe("reglas para publicar", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const window = { startsAt: new Date("2026-10-10T13:00:00Z"), endsAt: new Date("2026-10-10T15:00:00Z") };
  const ok = [{ valid: true }];

  it("un examen completo se puede publicar", () => {
    expect(getPublishProblems({ ...window, durationMinutes: 90 }, ok, now)).toEqual([]);
  });

  it("explica cada cosa que falta", () => {
    expect(getPublishProblems({ startsAt: null, endsAt: null, durationMinutes: 60 }, [], now)).toEqual(["noWindow", "noQuestions"]);
    expect(getPublishProblems({ ...window, durationMinutes: 180 }, ok, now)).toEqual(["durationExceedsWindow"]);
    expect(getPublishProblems({ ...window, durationMinutes: 60 }, ok, new Date("2026-10-10T15:00:00Z"))).toEqual(["windowEnded"]);
    expect(getPublishProblems({ ...window, durationMinutes: 60 }, [{ valid: true }, { valid: false }], now)).toEqual(["invalidQuestion"]);
  });

  it("la duración puede ser exactamente la ventana", () => {
    expect(getPublishProblems({ ...window, durationMinutes: 120 }, ok, now)).toEqual([]);
  });
});

describe("ajustes por estudiante", () => {
  it("valida tiempo extra y nota", () => {
    expect(accommodationSchema.safeParse({ extraMinutes: -5, cameraExempt: false }).success).toBe(false);
    expect(accommodationSchema.safeParse({ extraMinutes: 15.5, cameraExempt: false }).success).toBe(false);
    expect(accommodationSchema.safeParse({ extraMinutes: 30, cameraExempt: true, note: "x".repeat(301) }).success).toBe(false);
  });

  it("un ajuste vacío equivale a no tener ajuste", () => {
    expect(isEmptyAccommodation(accommodationSchema.parse({ extraMinutes: 0, cameraExempt: false, note: "  " }))).toBe(true);
    expect(isEmptyAccommodation(accommodationSchema.parse({ extraMinutes: 15, cameraExempt: false }))).toBe(false);
  });
});
