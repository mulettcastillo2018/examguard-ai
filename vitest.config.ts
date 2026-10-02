import path from "node:path";
import { defineConfig } from "vitest/config";

// Pruebas unitarias: lógica pura, sin base de datos ni red.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` lanza un error fuera de Next; en las pruebas no aplica.
      "server-only": path.resolve(__dirname, "tests/support/empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Algunas pruebas recargan módulos (vi.resetModules); con todas las suites en paralelo
    // pueden pasar de los 5 s por defecto en equipos lentos.
    testTimeout: 15_000,
  },
});
