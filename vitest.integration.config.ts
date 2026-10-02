import path from "node:path";
import { defineConfig } from "vitest/config";

// Pruebas de integración: servicios y autenticación contra una base PostgreSQL real
// (la del CI o una rama de pruebas de Neon). Crean sus propios datos y los borran.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/support/empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/support/integration-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
