import { expect, test, type Page } from "@playwright/test";

// Constructor de exámenes (Fase 2) con el docente del seed.
const password = process.env.E2E_PASSWORD ?? "";
const suffix = Date.now().toString(36);

async function loginAsTeacher(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("cmejia@losandes.test");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

/** Mañana en Colombia, como lo espera un campo datetime-local ("2026-10-06"). */
function tomorrowInBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
}

test("el docente arma un examen con preguntas del banco y lo publica", async ({ page }) => {
  const title = `Quiz E2E ${suffix}`;
  await loginAsTeacher(page);
  await page.goto("/teacher/exams/new");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Crear borrador" }).click();
  // El constructor, no la página de "nuevo".
  await expect(page).toHaveURL(/\/teacher\/exams\/(?!new$)[a-z0-9]+$/);
  await expect(page.getByTestId("publish-problems")).toContainText("Definir la fecha y hora de apertura y de cierre.");
  await expect(page.getByRole("button", { name: "Publicar examen" })).toBeDisabled();

  await page.getByRole("button", { name: "Agregar del banco" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /derivada de f\(x\)/ }).check();
  await dialog.getByRole("checkbox", { name: /números son primos/ }).check();
  await dialog.getByRole("button", { name: "Agregar 2 preguntas" }).click();
  const questions = page.getByTestId("exam-question");
  await expect(questions).toHaveCount(2);
  await expect(questions.first()).toContainText("derivada");

  // Reordenar: la primera baja al segundo puesto.
  await page.getByRole("button", { name: "Bajar la pregunta 1" }).click();
  await expect(questions.first()).toContainText("números son primos");

  const day = tomorrowInBogota();
  await page.getByLabel("Disponible desde", { exact: true }).fill(`${day}T08:00`);
  await page.getByLabel("Disponible hasta", { exact: true }).fill(`${day}T10:00`);
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByText("Todo listo para publicar.")).toBeVisible();

  await page.getByRole("button", { name: "Publicar examen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText(/^Publicado el /)).toBeVisible();
  // Publicado: configuración y preguntas congeladas.
  await expect(page.getByLabel("Título", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bajar la pregunta 1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Volver a borrador" })).toBeVisible();

  await page.goto("/teacher/exams");
  await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText("Publicado");
});

test("los ajustes por estudiante se guardan con el examen publicado", async ({ page }) => {
  await loginAsTeacher(page);
  await page.goto("/teacher/exams");
  await page.getByRole("link", { name: "Parcial de matemáticas — primer corte" }).click();
  await expect(page).toHaveURL(/\/teacher\/exams\/(?!new$)[a-z0-9]+$/);

  // El seed le dio 15 minutos extra a Isabella.
  await expect(page.getByLabel("Minutos extra de Isabella Quintero", { exact: true })).toHaveValue("15");

  await page.getByLabel("Minutos extra de Santiago Gómez", { exact: true }).fill("20");
  await page.getByLabel("Nota de Santiago Gómez", { exact: true }).fill("Conexión inestable");
  await page.getByRole("button", { name: "Guardar: Santiago Gómez" }).click();
  await expect(page.getByText("Ajuste de Santiago Gómez guardado.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Minutos extra de Santiago Gómez", { exact: true })).toHaveValue("20");
  await expect(page.getByLabel("Nota de Santiago Gómez", { exact: true })).toHaveValue("Conexión inestable");
});
