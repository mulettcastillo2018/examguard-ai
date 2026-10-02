import { describe, expect, it } from "vitest";
import messages from "../../messages/es.json";
import { NAVIGATION } from "@/components/shell/navigation";
import { AUDIT_ACTIONS } from "@/modules/audit/audit";
import { ROLES } from "@/modules/rbac";

// Evita pantallas con claves sin traducir: todo lo que se elige por código
// (navegación, roles, acciones de auditoría) debe tener su texto.
function lookup(path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
}

describe("textos de la interfaz", () => {
  it("cada rol tiene nombre", () => {
    for (const role of ROLES) expect(typeof lookup(`roles.${role}`)).toBe("string");
  });

  it("cada entrada de la navegación tiene texto y la primera es el inicio de la sección", () => {
    for (const role of ROLES) {
      const items = NAVIGATION[role];
      expect(items[0]?.key).toBe("overview");
      for (const item of items) {
        expect(typeof lookup(`nav.${item.key}`), `nav.${item.key}`).toBe("string");
        expect(Boolean(item.href) !== Boolean(item.phase), `${role}/${item.key}: ruta o fase, no ambas`).toBe(true);
      }
    }
  });

  it("cada acción auditable tiene descripción", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(typeof lookup(`audit.actions.${action}`), action).toBe("string");
    }
  });
});

describe("plurales en español", () => {
  it("los conteos concuerdan en número", async () => {
    const { createTranslator } = await import("next-intl");
    const t = createTranslator({ locale: "es", messages });
    expect(t("admin.import.summary", { created: 2, exists: 1, invalid: 1 })).toBe("2 creados · 1 ya existía · 1 con error");
    expect(t("admin.import.summary", { created: 1, exists: 0, invalid: 3 })).toBe("1 creado · 0 ya existían · 3 con errores");
    expect(t("admin.courses.detail.selected", { count: 1, total: 9 })).toBe("1 seleccionado de 9");
    expect(t("common.students", { count: 1 })).toBe("1 estudiante");
  });
});
