import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-redirect";
import { validatePasswordChange } from "@/modules/auth/password-rules";

describe("redirección segura después de iniciar sesión", () => {
  it("acepta rutas internas", () => {
    expect(safeInternalPath("/teacher")).toBe("/teacher");
    expect(safeInternalPath("/admin/users?page=2")).toBe("/admin/users?page=2");
  });

  it("rechaza destinos externos o raros", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "teacher", "/ok\r\nSet-Cookie: x", undefined, ["/a"]]) {
      expect(safeInternalPath(value)).toBe("/");
    }
  });

  it("usa el valor por defecto indicado", () => {
    expect(safeInternalPath(null, "/login")).toBe("/login");
  });
});

describe("reglas de la contraseña nueva", () => {
  const base = { currentPassword: "Temporal-2026", newPassword: "Nueva-clave-segura", confirmation: "Nueva-clave-segura" };

  it("acepta una contraseña válida", () => {
    expect(validatePasswordChange(base)).toBeNull();
  });

  it("exige al menos 10 caracteres", () => {
    expect(validatePasswordChange({ ...base, newPassword: "corta", confirmation: "corta" })).toBe("tooShort");
  });

  it("exige que la confirmación coincida", () => {
    expect(validatePasswordChange({ ...base, confirmation: "Otra-clave-distinta" })).toBe("mismatch");
  });

  it("no permite repetir la actual", () => {
    expect(validatePasswordChange({ ...base, newPassword: base.currentPassword, confirmation: base.currentPassword })).toBe("sameAsCurrent");
  });
});
