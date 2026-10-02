import { defineConfig, devices } from "@playwright/test";

// Pruebas de punta a punta contra el build de producción con la base de demostración
// (npm run db:seed). E2E_PASSWORD es la misma contraseña usada en SEED_PASSWORD.
//
// Playwright no se puede instalar detrás del proxy corporativo donde se desarrolla: corre
// en GitHub Actions. En otra red, en local usa el Edge instalado (sin descargar navegadores).
const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "msedge" },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
