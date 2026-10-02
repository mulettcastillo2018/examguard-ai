import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, toErrorResponse, UnauthorizedError, ValidationError } from "@/lib/errors";

describe("errores de la aplicación", () => {
  it("cada error lleva su código HTTP", () => {
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ValidationError().status).toBe(400);
    expect(new ConflictError().status).toBe(409);
  });

  it("no filtra detalles de errores inesperados", () => {
    const response = toErrorResponse(new Error("connection refused at 10.0.0.5:5432"));
    expect(response.status).toBe(500);
    expect(response.body.error).not.toContain("10.0.0.5");
  });

  it("conserva el mensaje de los errores conocidos", () => {
    expect(toErrorResponse(new ForbiddenError("Solo docentes"))).toEqual({
      status: 403,
      body: { error: "Solo docentes", code: "FORBIDDEN" },
    });
  });
});

describe("variables de entorno del servidor", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("explica qué variables faltan", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it("exige un secreto de al menos 32 caracteres", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.BETTER_AUTH_SECRET = "corto";
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/32 caracteres/);
  });

  it("acepta una configuración válida y completa los valores por defecto", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.BETTER_AUTH_SECRET = "x".repeat(40);
    delete process.env.BETTER_AUTH_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AUTH_SIGNIN_MAX_PER_MINUTE; // el CI la define para las pruebas E2E
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AUTH_SIGNIN_MAX_PER_MINUTE).toBe(5);
  });

  it("el límite de inicios de sesión se puede subir para las pruebas, pero no a cero", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.BETTER_AUTH_SECRET = "x".repeat(40);
    process.env.AUTH_SIGNIN_MAX_PER_MINUTE = "100";
    const first = await import("@/lib/env");
    expect(first.getServerEnv().AUTH_SIGNIN_MAX_PER_MINUTE).toBe(100);

    vi.resetModules();
    process.env.AUTH_SIGNIN_MAX_PER_MINUTE = "0";
    const second = await import("@/lib/env");
    expect(() => second.getServerEnv()).toThrow(/AUTH_SIGNIN_MAX_PER_MINUTE/);
  });
});
