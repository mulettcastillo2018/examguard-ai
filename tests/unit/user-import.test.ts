import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE, MAX_IMPORT_ROWS, parseCsv, parseUserImport } from "@/modules/users/csv";
import { generateTemporaryPassword } from "@/modules/users/temporary-password";

describe("lectura de CSV", () => {
  it("detecta el separador ; de Excel en español y quita el BOM", () => {
    expect(parseCsv("﻿nombre;correo\r\nAna;ana@x.co\r\n")).toEqual([
      ["nombre", "correo"],
      ["Ana", "ana@x.co"],
    ]);
  });

  it("acepta coma como separador", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("respeta comillas, separadores dentro de comillas y comillas escapadas", () => {
    expect(parseCsv('nombre;nota\n"Pérez; Juan";"dice ""hola"""')).toEqual([
      ["nombre", "nota"],
      ["Pérez; Juan", 'dice "hola"'],
    ]);
  });

  it("ignora líneas vacías", () => {
    expect(parseCsv("a;b\n\n1;2\n;\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("importación de usuarios", () => {
  it("la plantilla ofrecida se lee sin errores", () => {
    const result = parseUserImport(IMPORT_TEMPLATE);
    expect(result.ok && result.errors).toEqual([]);
    expect(result.ok && result.rows.map((r) => [r.role, r.isMinor, r.courseCodes])).toEqual([
      ["STUDENT", true, ["MAT-11A", "FIS-11A"]],
      ["TEACHER", false, []],
    ]);
  });

  it("acepta encabezados en otro orden, con tildes o en inglés, y roles en español", () => {
    const result = parseUserImport("Correo electrónico;Rol;Nombre completo\nX@Y.CO;Profesor;  Luis   Mora ");
    expect(result.ok && result.rows[0]).toMatchObject({ email: "x@y.co", role: "TEACHER", name: "Luis Mora", isMinor: false });
  });

  it("informa las columnas obligatorias que faltan", () => {
    expect(parseUserImport("nombre;cursos\nAna;MAT")).toEqual({ ok: false, error: "missingColumns", missing: ["email", "role"] });
  });

  it("reporta errores por línea sin detener las filas válidas", () => {
    const csv = [
      "nombre;correo;rol;menor",
      "Ana;ana@x.co;estudiante;sí",
      ";sin-nombre@x.co;estudiante;no",
      "Beto;no-es-correo;estudiante;no",
      "Caro;caro@x.co;bibliotecaria;no",
      "Dani;dani@x.co;docente;sí",
      "Ana bis;ANA@x.co;estudiante;no",
    ].join("\n");
    const result = parseUserImport(csv);
    expect(result.ok && result.rows.map((r) => r.email)).toEqual(["ana@x.co"]);
    expect(result.ok && result.errors.map((e) => [e.line, e.error])).toEqual([
      [3, "missingName"],
      [4, "invalidEmail"],
      [5, "invalidRole"],
      [6, "minorNotStudent"],
      [7, "duplicateInFile"],
    ]);
  });

  it("rechaza planillas vacías o demasiado grandes", () => {
    expect(parseUserImport("nombre;correo;rol")).toEqual({ ok: false, error: "empty" });
    const big = ["nombre;correo;rol", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `U${i};u${i}@x.co;estudiante`)].join("\n");
    expect(parseUserImport(big)).toEqual({ ok: false, error: "tooManyRows" });
  });
});

describe("contraseña temporal", () => {
  it("es legible, cumple el largo mínimo y no repite", () => {
    const passwords = new Set(Array.from({ length: 200 }, generateTemporaryPassword));
    expect(passwords.size).toBe(200);
    for (const password of passwords) {
      expect(password).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
      expect(password).not.toMatch(/[01OIl]/);
      expect(password.length).toBeGreaterThanOrEqual(10);
    }
  });
});
