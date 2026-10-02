import fs from "node:fs";

// Carga .env (si existe) para correr las pruebas de integración en local.
if (fs.existsSync(".env")) process.loadEnvFile(".env");

// Secreto solo para pruebas si no hay uno configurado.
process.env.BETTER_AUTH_SECRET ??= "secreto-solo-para-pruebas-de-integracion-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
