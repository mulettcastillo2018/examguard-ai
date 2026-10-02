import { expect, test, type Page } from "@playwright/test";

// Recorridos de la Fase 1 con las cuentas del seed de demostración.
const password = process.env.E2E_PASSWORD ?? "";

test.beforeAll(() => {
  if (!password) throw new Error("Define E2E_PASSWORD (la misma contraseña de SEED_PASSWORD).");
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("la portada explica que la decisión es de una persona", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("revisadas por personas");
  await expect(page.getByText("Una persona decide")).toBeVisible();
});

test("las secciones privadas exigen iniciar sesión", async ({ page }) => {
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/login\?next=%2Fteacher$/);
});

test("una contraseña incorrecta muestra un error genérico", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("rectoria@losandes.test");
  await page.getByLabel("Contraseña").fill("no-es-la-contrasena");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("la rectora entra a la administración y ve usuarios, cursos y auditoría", async ({ page }) => {
  await login(page, "rectoria@losandes.test");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Panel de la institución" })).toBeVisible();

  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("cell", { name: "Carlos Mejía" })).toBeVisible();

  await page.getByRole("link", { name: "Cursos" }).click();
  await expect(page.getByRole("cell", { name: "Matemáticas 11A" })).toBeVisible();

  await page.getByRole("link", { name: "Auditoría" }).click();
  await expect(page.getByRole("cell", { name: "Inició sesión" }).first()).toBeVisible();
});

test("el docente ve solo sus cursos", async ({ page }) => {
  await login(page, "cmejia@losandes.test");
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByRole("heading", { name: "Panel docente" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Matemáticas 11A" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Física 11A" })).toHaveCount(0);
});

test("un estudiante menor de edad ve sus cursos y el aviso para su acudiente", async ({ page }) => {
  await login(page, "sgomez@losandes.test");
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByRole("heading", { name: "Hola, Santiago" })).toBeVisible();
  await expect(page.getByText("la autorización de supervisión la da tu acudiente")).toBeVisible();
  await expect(page.getByText("Matemáticas 11A")).toBeVisible();
});

test("un estudiante no puede entrar a la administración", async ({ page }) => {
  await login(page, "sgomez@losandes.test");
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/student$/);
});

test("cerrar sesión vuelve al inicio de sesión", async ({ page }) => {
  await login(page, "dospina@losandes.test");
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole("button", { name: "Diana Ospina" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/login/);
});
