// Convierte el reporte JSON de ESLint en anotaciones de GitHub Actions: cada problema
// aparece en la línea exacta del pull request y en la API pública del check.
// Uso: npx eslint . -f json -o eslint-report.json; node scripts/ci/eslint-annotations.mjs eslint-report.json
import fs from "node:fs";
import path from "node:path";

const reportPath = process.argv[2] ?? "eslint-report.json";
const results = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const escape = (text) => String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

let errors = 0;
let warnings = 0;
for (const result of results) {
  const file = path.relative(process.cwd(), result.filePath).replace(/\\/g, "/");
  for (const message of result.messages) {
    const level = message.severity === 2 ? "error" : "warning";
    if (level === "error") errors++;
    else warnings++;
    const title = message.ruleId ?? "eslint";
    console.log(`::${level} file=${file},line=${message.line ?? 1},col=${message.column ?? 1},title=${escape(title)}::${escape(message.message)}`);
    console.log(`${file}:${message.line}:${message.column} ${level} ${title} ${message.message}`);
  }
}

console.log(`ESLint: ${errors} errores, ${warnings} advertencias.`);
process.exit(errors > 0 ? 1 : 0);
