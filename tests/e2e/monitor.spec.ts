import { expect, test, type Page } from "@playwright/test";

// Criterio de las fases 4 y 5: los eventos aparecen en vivo para el docente, las reglas los
// interpretan (señales con explicación) y quien revisa obtiene un resumen factual.
// Dos navegadores a la vez: el estudiante presenta el "Taller de repaso" (modo demostración)
// y el docente lo mira en el monitoreo, que se actualiza solo.
const password = process.env.E2E_PASSWORD ?? "";

async function login(page: Page, email: string, home: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(home);
}

test("los eventos simulados aparecen en vivo en el monitoreo del docente", async ({ browser }) => {
  const studentContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  const student = await studentContext.newPage();
  const teacher = await teacherContext.newPage();

  // El estudiante (adulto) autoriza la cámara y empieza.
  await login(student, "mcardenas@losandes.test", /\/student$/);
  await student.goto("/student/exams");
  await student.getByTestId("student-exam").filter({ hasText: "Taller de repaso" }).getByRole("link", { name: "Ir al examen" }).click();
  await expect(student.getByTestId("compatibility")).toContainText("Navegador");
  await student.getByRole("checkbox", { name: "Autorizo el uso de la cámara durante este examen" }).check();
  await student.getByRole("checkbox", { name: "Leí este aviso" }).check();
  await student.getByRole("button", { name: "Empezar examen" }).click();
  await expect(student).toHaveURL(/\/take\/[a-z0-9]+$/);
  await expect(student.getByTestId("time-left")).not.toHaveText("--:--");

  // El docente abre el monitoreo: el estudiante aparece presentando y conectado.
  await login(teacher, "cmejia@losandes.test", /\/teacher$/);
  await teacher.goto("/teacher/exams");
  await teacher.getByRole("link", { name: "Taller de repaso" }).click();
  await teacher.getByRole("link", { name: "Monitoreo en vivo" }).click();
  const row = teacher.getByTestId("monitor-row").filter({ hasText: "Mateo Cárdenas" });
  await expect(row).toContainText("Presentando");
  await expect(row).toContainText("Conectado", { timeout: 15_000 });

  // El estudiante simula dos eventos desde el panel de la demostración.
  await student.getByRole("button", { name: "Abrir simulador" }).click();
  await student.getByRole("button", { name: "Más de un rostro en la cámara" }).click();
  await student.getByRole("button", { name: "Salió de la pestaña del examen" }).click();

  // Sin recargar, el monitoreo los muestra (consulta cada 5 s).
  // La cámara del navegador de pruebas no muestra un rostro: puede sumar sus propios eventos.
  await expect(row).toContainText(/Cámara \d/, { timeout: 20_000 });
  await row.getByRole("button", { name: /Ver eventos de Mateo/ }).click();
  const events = teacher.getByTestId("monitor-events");
  await expect(events).toContainText("Más de un rostro en la cámara");
  await expect(events).toContainText("Salió de la pestaña del examen");
  await expect(events).toContainText("Simulado");

  // Las reglas lo interpretan: un rostro adicional (severidad alta) basta para recomendar revisión.
  await expect(row).toContainText("Revisión recomendada", { timeout: 20_000 });
  await expect(teacher.getByTestId("signal-list")).toContainText("La cámara detectó más de un rostro");

  // Al entregar, el monitoreo lo refleja (y el taller queda libre para la prueba de resultados).
  await student.getByRole("complementary").getByRole("button", { name: "Entregar examen" }).click();
  await student.getByRole("alertdialog").getByRole("button", { name: "Entregar" }).click();
  await expect(student).toHaveURL(/\/student\/exams\/[a-z0-9]+$/);
  await expect(row).toContainText("Entregó", { timeout: 20_000 });

  // En los resultados, la supervisión del intento: señales etiquetadas y resumen (sin clave
  // de IA en CI, la plantilla factual).
  await teacher.goto(teacher.url().replace(/\/monitor$/, "/results"));
  const resultRow = teacher.getByRole("row").filter({ hasText: "Mateo Cárdenas" });
  await expect(resultRow).toContainText("Revisión recomendada");
  await resultRow.getByRole("link", { name: "Mateo Cárdenas" }).click();
  const supervision = teacher.getByTestId("supervision-card");
  await expect(supervision).toContainText("Revisión recomendada");
  await expect(supervision.getByTestId("signal-list")).toContainText("S1");
  await expect(supervision).toContainText("Eventos simulados (modo demostración).");
  await supervision.getByRole("button", { name: "Generar resumen" }).click();
  await expect(supervision.getByTestId("risk-summary")).toContainText("[S1] La cámara detectó más de un rostro");
  await expect(supervision.getByRole("button", { name: "Volver a generar" })).toBeVisible();

  // Criterio de la Fase 6: quien revisa abre la sesión, filtra la línea de tiempo y decide.
  await supervision.getByRole("link", { name: "Abrir la revisión" }).click();
  await expect(teacher).toHaveURL(/\/teacher\/reviews\/[a-z0-9]+$/);
  await expect(teacher.getByRole("heading", { name: "Revisión de Mateo Cárdenas" })).toBeVisible();
  await expect(teacher.getByTestId("review-signals")).toContainText("La cámara detectó más de un rostro");
  const timeline = teacher.getByTestId("review-timeline");
  await expect(timeline.getByTestId("event-item").filter({ hasText: "Más de un rostro en la cámara" })).toContainText("S1");
  await expect(timeline).toContainText("Salió de la pestaña del examen");

  await teacher.getByLabel("Categoría").selectOption("VISION");
  await teacher.getByRole("button", { name: "Filtrar" }).click();
  await expect(teacher).toHaveURL(/category=VISION/);
  await expect(timeline).toContainText("Más de un rostro en la cámara");
  await expect(timeline).not.toContainText("Salió de la pestaña del examen");
  await teacher.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(timeline).toContainText("Salió de la pestaña del examen");

  // Pedir una investigación exige explicar por qué.
  const decision = teacher.getByTestId("review-decision");
  await decision.getByRole("radio", { name: "Requiere investigación adicional" }).click();
  await decision.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(decision.getByRole("alert")).toContainText("mínimo 10 caracteres");
  await decision.getByLabel("Observaciones").fill("Conversar con el estudiante sobre el segundo rostro que registró la cámara.");
  await decision.getByRole("button", { name: "Guardar revisión" }).click();
  await expect(teacher.getByText("Revisión guardada.")).toBeVisible();
  await expect(teacher.getByTestId("review-history")).toContainText("marcó «Requiere investigación adicional»");
  await expect(decision.getByRole("button", { name: "Actualizar revisión" })).toBeVisible();

  // La sesión sale de la cola y queda entre las revisadas (la más reciente primero: un
  // reintento de la prueba deja otra sesión de Mateo).
  await teacher.goto("/teacher/reviews?status=REVIEWED");
  await expect(teacher.getByTestId("review-queue").getByRole("listitem").filter({ hasText: "Mateo Cárdenas" }).first()).toContainText(
    "Requiere investigación adicional",
  );

  // El estudiante ve sus hechos registrados y que un docente revisó, pero no el resultado.
  await student.getByRole("link", { name: "Mis datos de supervisión" }).first().click();
  await expect(student).toHaveURL(/\/student\/my-data$/);
  const mine = student.getByTestId("my-data-list").getByRole("listitem").filter({ hasText: "Taller de repaso" }).first();
  await expect(mine).toContainText("Revisada por un docente");
  await mine.getByRole("link", { name: "Ver detalle: Taller de repaso" }).click();
  const myEvents = student.getByTestId("my-data-events");
  await expect(myEvents).toContainText("Más de un rostro en la cámara");
  await expect(myEvents).toContainText("Salió de la pestaña del examen");
  await expect(student.getByRole("main")).not.toContainText("Requiere investigación adicional");
  await expect(student.getByRole("main")).not.toContainText("segundo rostro");

  await studentContext.close();
  await teacherContext.close();
});
