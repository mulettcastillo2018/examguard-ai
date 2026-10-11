// Datos de demostración (todos ficticios): vuelve a crear la institución de demostración
// desde cero. La contraseña de las cuentas sale de SEED_PASSWORD, nunca del código.
//
// Uso: npm run db:seed
import { prisma } from "@/lib/db";
import { seedDemoInstitution } from "@/modules/demo/seed";

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Define SEED_PASSWORD (mínimo 10 caracteres) para crear las cuentas de demostración.");
  }
  const demo = await seedDemoInstitution(password);
  console.log(
    `Demo lista: ${demo.institution} · 1 rectora, ${demo.teachers} docentes, ${demo.students} estudiantes, ${demo.courses} cursos, ${demo.questions} preguntas, ${demo.exams} exámenes.
` +
      `Cuentas: ${demo.accounts.join(", ")} (y demás estudiantes). Contraseña: la de SEED_PASSWORD.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
