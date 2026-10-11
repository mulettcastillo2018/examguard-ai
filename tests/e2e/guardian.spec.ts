import { expect, test, type Page } from "@playwright/test";

// Criterio de la Fase 7 para menores: la rectora registra la autorización del acudiente y la
// estudiante menor solo puede activar lo autorizado; al revocarla, presenta sin cámara.
// Isabella Quintero (menor, Matemáticas 11A) no la usa ninguna otra prueba.
const password = process.env.E2E_PASSWORD ?? "";

async function login(page: Page, email: string, home: RegExp) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(home);
}

async function openLobby(page: Page) {
  await page.goto("/student/exams");
  await page.getByTestId("student-exam").filter({ hasText: "Taller de repaso" }).getByRole("link", { name: "Ir al examen" }).click();
  await expect(page.getByTestId("compatibility")).toContainText("Navegador");
}

test("la autorización del acudiente habilita solo lo autorizado y se puede revocar", async ({ page }) => {
  // 1) La rectora abre la autorización desde la lista de usuarios (si quedó una vigente de una
  // pasada anterior de la prueba, la revoca para empezar de cero).
  await login(page, "rectoria@losandes.test", /\/admin$/);
  await page.goto("/admin/users");
  const row = page.getByRole("row", { name: /Isabella Quintero/ });
  await row.getByRole("button", { name: /Acciones/ }).click();
  await page.getByRole("menuitem", { name: "Autorización del acudiente" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[a-z0-9]+\/guardian$/);
  const guardianUrl = page.url();
  const status = page.getByTestId("guardian-status");
  if (await page.getByRole("button", { name: "Revocar autorización" }).isVisible()) {
    await page.getByRole("button", { name: "Revocar autorización" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revocar" }).click();
  }
  await expect(status).toContainText("Sin autorización registrada");

  // 2) Sin autorización, la menor no ve la opción de cámara ni de micrófono.
  await login(page, "iquintero@losandes.test", /\/student$/);
  await openLobby(page);
  await expect(page.getByTestId("minor-consent")).toContainText("Como aún no está registrada, presentarás sin ellos");
  await expect(page.getByRole("checkbox", { name: "Autorizo el uso de la cámara durante este examen" })).toHaveCount(0);

  // 3) La rectora la registra: solo la cámara.
  await login(page, "rectoria@losandes.test", /\/admin$/);
  await page.goto("/admin/users");
  await expect(page.getByRole("row", { name: /Isabella Quintero/ })).toContainText("Sin autorización del acudiente");
  await page.goto(guardianUrl);
  const form = page.getByTestId("guardian-form");
  await form.getByRole("button", { name: "Registrar autorización" }).click();
  await expect(form).toContainText("Escribe el nombre completo del acudiente");
  await expect(form).toContainText("Marca al menos la cámara o el micrófono");
  await form.getByLabel("Nombre del acudiente").fill("Carolina Quintero");
  await form.getByLabel("Parentesco").fill("Madre");
  await form.getByRole("checkbox", { name: "Autoriza la cámara" }).check();
  await form.getByLabel("Soporte (opcional)").fill("Formato firmado, secretaría");
  await form.getByRole("button", { name: "Registrar autorización" }).click();
  await expect(status).toContainText("Vigente");
  await expect(status).toContainText("Autorizó: cámara");
  await expect(status).toContainText("Carolina Quintero (Madre)");
  await expect(page.getByTestId("guardian-history")).toContainText("registró la autorización (cámara)");

  // 4) La menor ya puede activar la cámara, y solo la cámara.
  await login(page, "iquintero@losandes.test", /\/student$/);
  await openLobby(page);
  await expect(page.getByTestId("minor-consent")).toContainText("registró su autorización para la cámara");
  await expect(page.getByRole("checkbox", { name: "Autorizo el uso de la cámara durante este examen" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Autorizo el uso del micrófono durante este examen" })).toHaveCount(0);

  // 5) Revocada, vuelve a presentar sin cámara.
  await login(page, "rectoria@losandes.test", /\/admin$/);
  await page.goto(guardianUrl);
  await page.getByRole("button", { name: "Revocar autorización" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revocar" }).click();
  await expect(status).toContainText("Sin autorización registrada");
  await expect(page.getByTestId("guardian-history")).toContainText("la revocó");

  await login(page, "iquintero@losandes.test", /\/student$/);
  await openLobby(page);
  await expect(page.getByRole("checkbox", { name: "Autorizo el uso de la cámara durante este examen" })).toHaveCount(0);
});
