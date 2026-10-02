import { expect, test, type Page } from "@playwright/test";

// Administración de usuarios y cursos (Fase 2) con la cuenta de la rectora del seed.
const password = process.env.E2E_PASSWORD ?? "";
const suffix = Date.now().toString(36);

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("rectoria@losandes.test");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("la rectora crea una estudiante menor de edad y ve su contraseña temporal una sola vez", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Nuevo usuario" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre completo").fill("Estudiante E2E");
  await dialog.getByLabel("Correo electrónico").fill(`e2e.${suffix}@losandes.test`);
  await dialog.getByLabel("Es menor de edad").check();
  await dialog.getByRole("button", { name: "Crear usuario" }).click();

  await expect(page.getByTestId("temporary-password")).toHaveText(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
  await page.getByRole("button", { name: "Listo" }).click();

  const row = page.getByRole("row", { name: /Estudiante E2E/ });
  await expect(row).toContainText("Menor de edad");
  await expect(row).toContainText("Contraseña temporal");
});

test("la importación crea las filas válidas y explica las inválidas", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/users/import");
  await page.getByLabel("Contenido de la planilla").fill(
    [
      "nombre;correo;rol;menor_de_edad;cursos",
      `Importada E2E;imp.${suffix}@losandes.test;estudiante;sí;MAT-11A`,
      "Santiago Repetido;sgomez@losandes.test;estudiante;sí;",
      "Sin Correo;no-es-correo;estudiante;no;",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByTestId("import-summary")).toHaveText("1 creado · 1 ya existía · 1 con error");
  await expect(page.getByText("Correo inválido.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar credenciales (CSV)" })).toBeVisible();
});

test("la rectora crea un curso y le asigna una docente", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/courses");
  await page.getByRole("button", { name: "Nuevo curso" }).click();

  const dialog = page.getByRole("dialog");
  const code = `E2E-${suffix.slice(-4).toUpperCase()}`;
  await dialog.getByLabel("Código").fill(code);
  await dialog.getByLabel("Nombre").fill("Curso E2E");
  await dialog.getByRole("button", { name: "Crear curso" }).click();
  await expect(page).toHaveURL(/\/admin\/courses\/[a-z0-9]+$/);

  await page.getByText("Diana Ospina").click();
  await page.getByRole("button", { name: "Guardar cambios" }).first().click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();

  await page.goto("/admin/courses");
  await expect(page.getByRole("row", { name: new RegExp(code) })).toContainText("Diana Ospina");
});
