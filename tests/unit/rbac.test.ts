import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { assertCan, assertRole, can, isRole, PERMISSIONS, permissionsOf, roleForPath, ROLES } from "@/modules/rbac";

describe("permisos por rol", () => {
  it("el estudiante solo presenta exámenes y ve sus resultados", () => {
    expect(permissionsOf("STUDENT")).toEqual(["exams:take", "results:read-own"]);
    expect(can("STUDENT", "exams:manage")).toBe(false);
    expect(can("STUDENT", "events:read")).toBe(false);
    expect(can("STUDENT", "users:manage")).toBe(false);
  });

  it("el docente gestiona exámenes y revisa sesiones, pero no administra la institución", () => {
    expect(can("TEACHER", "exams:manage")).toBe(true);
    expect(can("TEACHER", "questions:manage")).toBe(true);
    expect(can("TEACHER", "sessions:review")).toBe(true);
    expect(can("TEACHER", "users:manage")).toBe(false);
    expect(can("TEACHER", "policies:manage")).toBe(false);
    expect(can("TEACHER", "audit:read")).toBe(false);
  });

  it("la administración gobierna la institución y consulta, pero no presenta ni crea exámenes", () => {
    for (const permission of ["institution:manage", "users:manage", "courses:manage", "policies:manage", "audit:read"] as const) {
      expect(can("ADMIN", permission)).toBe(true);
    }
    expect(can("ADMIN", "exams:take")).toBe(false);
    expect(can("ADMIN", "exams:manage")).toBe(false);
  });

  it("todo permiso pertenece al menos a un rol", () => {
    for (const permission of PERMISSIONS) {
      expect(ROLES.some((role) => can(role, permission))).toBe(true);
    }
  });

  it("assertCan y assertRole lanzan 403", () => {
    expect(() => assertCan({ role: "STUDENT" }, "audit:read")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "ADMIN" }, "audit:read")).not.toThrow();
    expect(() => assertRole({ role: "TEACHER" }, "STUDENT")).toThrow(ForbiddenError);
    expect(() => assertRole({ role: "TEACHER" }, "ADMIN", "TEACHER")).not.toThrow();
  });

  it("isRole valida valores desconocidos", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("SUPERADMIN")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("sección por ruta", () => {
  it("asigna cada prefijo a su rol", () => {
    expect(roleForPath("/admin")).toBe("ADMIN");
    expect(roleForPath("/admin/users")).toBe("ADMIN");
    expect(roleForPath("/teacher")).toBe("TEACHER");
    expect(roleForPath("/student/exam/123")).toBe("STUDENT");
  });

  it("no confunde rutas que solo comparten el inicio", () => {
    expect(roleForPath("/administrator")).toBeNull();
    expect(roleForPath("/students")).toBeNull();
    expect(roleForPath("/login")).toBeNull();
  });
});
