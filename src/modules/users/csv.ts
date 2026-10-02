// Lectura de la planilla de importación de usuarios. Funciones puras (sin base de datos).
//
// Acepta lo que produce Excel en español: separador ";" (o ","), comillas, BOM y fin de
// línea de Windows. Encabezados en español o inglés; el orden de las columnas no importa.

export const MAX_IMPORT_ROWS = 500;

/** Divide un CSV en filas y celdas respetando comillas ("a;b" es una sola celda). */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

const HEADER_ALIASES: Record<string, "name" | "email" | "role" | "isMinor" | "courses"> = {
  nombre: "name",
  "nombre completo": "name",
  name: "name",
  correo: "email",
  "correo electronico": "email",
  email: "email",
  "e-mail": "email",
  rol: "role",
  role: "role",
  menor: "isMinor",
  "menor de edad": "isMinor",
  menor_de_edad: "isMinor",
  minor: "isMinor",
  curso: "courses",
  cursos: "courses",
  courses: "courses",
};

const ROLE_ALIASES: Record<string, "ADMIN" | "TEACHER" | "STUDENT"> = {
  estudiante: "STUDENT",
  alumno: "STUDENT",
  student: "STUDENT",
  docente: "TEACHER",
  profesor: "TEACHER",
  teacher: "TEACHER",
  administrador: "ADMIN",
  administracion: "ADMIN",
  rector: "ADMIN",
  rectora: "ADMIN",
  admin: "ADMIN",
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export interface ImportRow {
  line: number; // línea de la planilla (la 1 es el encabezado)
  name: string;
  email: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  isMinor: boolean;
  courseCodes: string[];
}

export interface ImportRowError {
  line: number;
  email?: string;
  error: "missingName" | "invalidEmail" | "invalidRole" | "duplicateInFile" | "minorNotStudent";
}

export type ParsedImport =
  | { ok: true; rows: ImportRow[]; errors: ImportRowError[] }
  | { ok: false; error: "empty" | "missingColumns" | "tooManyRows"; missing?: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YES = new Set(["si", "sí", "s", "yes", "y", "true", "1", "x"]);

/** Convierte la planilla en filas válidas y errores por línea. */
export function parseUserImport(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "empty" };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: "tooManyRows" };

  const header = (table[0] ?? []).map((cell) => HEADER_ALIASES[normalize(cell)]);
  const column = (key: string) => header.indexOf(key as never);
  const missing = ["name", "email", "role"].filter((key) => column(key) === -1);
  if (missing.length) return { ok: false, error: "missingColumns", missing };

  const rows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (key: string) => {
      const i = column(key);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };
    const name = get("name").replace(/\s+/g, " ");
    const email = get("email").toLowerCase();
    const role = ROLE_ALIASES[normalize(get("role"))];
    const isMinor = YES.has(normalize(get("isMinor")));

    if (!name) return errors.push({ line, email, error: "missingName" });
    if (!EMAIL.test(email)) return errors.push({ line, email, error: "invalidEmail" });
    if (!role) return errors.push({ line, email, error: "invalidRole" });
    if (isMinor && role !== "STUDENT") return errors.push({ line, email, error: "minorNotStudent" });
    if (seen.has(email)) return errors.push({ line, email, error: "duplicateInFile" });
    seen.add(email);

    const courseCodes = get("courses")
      .split(/[|,]/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    rows.push({ line, name, email, role, isMinor, courseCodes });
  });

  return { ok: true, rows, errors };
}

/** Plantilla que se ofrece para descargar. */
export const IMPORT_TEMPLATE =
  "nombre;correo;rol;menor_de_edad;cursos\n" +
  "Ana María Torres;atorres@colegio.edu.co;estudiante;sí;MAT-11A|FIS-11A\n" +
  "Jorge Rincón;jrincon@colegio.edu.co;docente;no;\n";
