import { expect, test, type Page } from "@playwright/test";

// Criterio de la Fase 3: el estudiante presenta y el docente publica notas.
// Usa el "Taller de repaso" del seed, abierto desde la siembra.
const password = process.env.E2E_PASSWORD ?? "";

async function login(page: Page, email: string, home: RegExp) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(home);
}

test("el estudiante presenta, el docente califica y publica, y el estudiante ve su nota", async ({ page }) => {
  // 1) La estudiante presenta el taller.
  await login(page, "mlopez@losandes.test", /\/student$/);
  await page.goto("/student/exams");
  await page.getByTestId("student-exam").filter({ hasText: "Taller de repaso" }).getByRole("link", { name: "Ir al examen" }).click();
  await expect(page.getByTestId("compatibility")).toContainText("Navegador");
  await page.getByRole("checkbox", { name: "Leí este aviso" }).check();
  await page.getByRole("button", { name: "Empezar examen" }).click();
  await expect(page).toHaveURL(/\/take\/[a-z0-9]+$/);
  await expect(page.getByTestId("time-left")).not.toHaveText("--:--");

  await page.getByRole("radio", { name: "6x", exact: true }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("checkbox", { name: "2", exact: true }).check();
  await page.getByRole("checkbox", { name: "13", exact: true }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("radio", { name: "Verdadero" }).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("textbox").fill("4");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("textbox").fill("La pendiente dice cuánto cambia y por cada unidad que avanza x, como la velocidad.");
  await expect(page.getByTestId("progress")).toHaveText("5 de 5 respondidas");
  await expect(page.getByTestId("save-state")).toHaveText("Todo guardado", { timeout: 15_000 });

  await page.getByRole("complementary").getByRole("button", { name: "Entregar examen" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Respondiste todas las preguntas.");
  await page.getByRole("alertdialog").getByRole("button", { name: "Entregar" }).click();
  await expect(page).toHaveURL(/\/student\/exams\/[a-z0-9]+$/);
  await expect(page.getByText(/Entregaste este examen/)).toBeVisible();

  // 2) El docente cierra el taller, califica la respuesta abierta y publica.
  await login(page, "cmejia@losandes.test", /\/teacher$/);
  await page.goto("/teacher/exams");
  await page.getByRole("link", { name: "Taller de repaso" }).click();
  await page.getByRole("link", { name: "Resultados" }).click();
  await expect(page).toHaveURL(/\/results$/);
  await expect(page.getByTestId("results-problems")).toContainText("Calificar las respuestas pendientes.");

  await page.getByRole("button", { name: "Cerrar el examen ahora" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cerrar examen" }).click();
  await expect(page.getByTestId("results-problems")).not.toContainText("Que el examen cierre");

  const pending = page.getByTestId("pending-answer").filter({ hasText: "Mariana López" });
  await pending.getByLabel("Puntos (de 3)").fill("2,5");
  await pending.getByLabel("Comentario para el estudiante (opcional)").fill("Buen ejemplo; faltó mencionar la fórmula.");
  await pending.getByRole("button", { name: "Guardar calificación" }).click();
  await expect(page.getByText("No hay respuestas por calificar.")).toBeVisible();

  await page.getByRole("button", { name: "Publicar notas" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText(/^Notas publicadas el /)).toBeVisible();

  // 3) La estudiante ve su nota y el comentario, sin la clave.
  await login(page, "mlopez@losandes.test", /\/student$/);
  await page.goto("/student/results");
  await page.getByRole("link", { name: "Ver resultado" }).click();
  await expect(page.getByTestId("result-score")).toHaveText("6,5 de 7 puntos");
  await expect(page.getByText("Buen ejemplo; faltó mencionar la fórmula.")).toBeVisible();
});
