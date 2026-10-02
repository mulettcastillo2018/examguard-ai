import { expect, test, type Page } from "@playwright/test";

// Banco de preguntas (Fase 2) con el docente del seed.
const password = process.env.E2E_PASSWORD ?? "";
const suffix = Date.now().toString(36);

async function loginAsTeacher(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("cmejia@losandes.test");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

/** Guarda el editor; si no se guarda, la falla dice por qué (el aviso del formulario). */
async function saveQuestion(page: Page) {
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  const saved = page.getByText("Pregunta guardada.");
  // Solo la alerta del formulario: Next.js agrega su propio role="alert" para anunciar rutas.
  const problem = page.locator('form [data-slot="alert"]');
  await expect(saved.or(problem).first()).toBeVisible({ timeout: 15_000 });
  if (await problem.isVisible()) throw new Error(`No se guardó: ${await problem.innerText()}`);
  await expect(page).toHaveURL(/\/teacher\/question-bank$/, { timeout: 15_000 });
}

test("el docente crea una pregunta de opción única y la encuentra con los filtros", async ({ page }) => {
  const prompt = `¿Cuál es la raíz cuadrada de 81? (${suffix})`;
  await loginAsTeacher(page);
  await page.getByRole("link", { name: "Banco de preguntas" }).click();
  await page.getByRole("link", { name: "Nueva pregunta" }).click();

  // Sin respuesta correcta marcada, el formulario lo explica antes de enviar.
  await page.getByLabel("Enunciado").fill(prompt);
  await page.getByLabel("Opción 1", { exact: true }).fill("7");
  await page.getByLabel("Opción 2", { exact: true }).fill("9");
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  await expect(page.getByText("Marca exactamente una respuesta correcta.")).toBeVisible();

  await page.getByLabel("Correcta: Opción 2").check();
  // Con coma decimal, como se escribe en Colombia.
  await page.getByLabel("Puntos").fill("1,5");
  await page.getByLabel("Categoría").fill("Raíces");
  await page.getByLabel("Etiquetas").fill(`e2e-${suffix}`);
  await saveQuestion(page);

  const row = page.getByRole("row", { name: new RegExp(suffix) });
  await expect(row).toContainText("Opción única");
  await expect(row).toContainText("1,5 puntos");

  await page.getByLabel("Etiqueta").selectOption(`e2e-${suffix}`);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page).toHaveURL(new RegExp(`tag=e2e-${suffix}`));
  await expect(page.getByRole("row")).toHaveCount(2);
});

test("una pregunta abierta se marca para calificar a mano y se puede archivar", async ({ page }) => {
  const prompt = `Explica el teorema de Pitágoras (${suffix})`;
  await loginAsTeacher(page);
  await page.goto("/teacher/question-bank/new");
  await page.getByText("Respuesta larga", { exact: true }).click();
  await page.getByLabel("Enunciado").fill(prompt);
  await page.getByLabel("Guía de calificación").fill("Menciona catetos e hipotenusa.");
  await saveQuestion(page);

  const row = page.getByRole("row", { name: new RegExp(`Pitágoras \\(${suffix}\\)`) });
  await expect(row).toContainText("Se califica a mano");

  await row.getByRole("button", { name: /^Acciones:/ }).click();
  await page.getByRole("menuitem", { name: "Archivar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archivar" }).click();
  await expect(row).toHaveCount(0);

  await page.getByLabel("Ver archivadas").check();
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(`Pitágoras \\(${suffix}\\)`) })).toContainText("Archivada");
});
