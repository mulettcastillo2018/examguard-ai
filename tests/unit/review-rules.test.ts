import { describe, expect, it } from "vitest";
import { highestSeverity, NOTES_MAX, parseQueueFilter, parseTimelineFilters, reviewSchema } from "@/modules/review/rules";

describe("filtros de la revisión", () => {
  it("la cola muestra por defecto lo que está por revisar", () => {
    expect(parseQueueFilter(undefined)).toBe("RECOMMENDED");
    expect(parseQueueFilter("REVIEWED")).toBe("REVIEWED");
    expect(parseQueueFilter("ALL")).toBe("ALL");
    expect(parseQueueFilter("NOT_REQUIRED")).toBe("RECOMMENDED");
    expect(parseQueueFilter(["ALL"])).toBe("RECOMMENDED");
  });

  it("la línea de tiempo acepta solo filtros conocidos y descarta el resto", () => {
    expect(parseTimelineFilters({ category: "VISION", severity: "HIGH", source: "SIMULATION" })).toEqual({
      category: "VISION",
      severity: "HIGH",
      source: "SIMULATION",
    });
    expect(parseTimelineFilters({ category: "vision", severity: "", source: ["BROWSER"], extra: "x" })).toEqual({
      category: undefined,
      severity: undefined,
      source: undefined,
    });
    expect(parseTimelineFilters({})).toEqual({ category: undefined, severity: undefined, source: undefined });
  });

  it("la severidad más alta de una sesión", () => {
    expect(highestSeverity([])).toBeNull();
    expect(highestSeverity(["LOW", "MEDIUM", "LOW"])).toBe("MEDIUM");
    expect(highestSeverity(["MEDIUM", "HIGH"])).toBe("HIGH");
  });
});

describe("decisión de quien revisa", () => {
  const issues = (input: unknown) => {
    const result = reviewSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
  };

  it("sin irregularidades no exige observaciones y las limpia", () => {
    expect(reviewSchema.parse({ outcome: "NO_IRREGULARITY" })).toEqual({ outcome: "NO_IRREGULARITY", notes: "" });
    expect(reviewSchema.parse({ outcome: "NO_IRREGULARITY", notes: "  Todo en orden.  " }).notes).toBe("Todo en orden.");
  });

  it("pedir una investigación exige al menos diez caracteres de observaciones", () => {
    expect(issues({ outcome: "NEEDS_INVESTIGATION" })).toEqual(["notes:notesRequired"]);
    expect(issues({ outcome: "NEEDS_INVESTIGATION", notes: "  corto    " })).toEqual(["notes:notesRequired"]);
    expect(issues({ outcome: "NEEDS_INVESTIGATION", notes: "Revisar el minuto 10." })).toEqual([]);
  });

  it("rechaza resultados desconocidos y observaciones demasiado largas", () => {
    expect(issues({ outcome: "CHEATED" })).toEqual(["outcome:outcome"]);
    expect(issues({})).toEqual(["outcome:outcome"]);
    expect(issues({ outcome: "NO_IRREGULARITY", notes: "x".repeat(NOTES_MAX + 1) })).toEqual(["notes:notesTooLong"]);
    expect(issues({ outcome: "NO_IRREGULARITY", notes: "x".repeat(NOTES_MAX) })).toEqual([]);
  });
});
