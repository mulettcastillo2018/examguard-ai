// Datos de demostración, todos ficticios: una institución, su rectora, dos docentes,
// ocho estudiantes (seis menores de edad), tres cursos y un banco de preguntas por docente. Los correos usan el dominio
// reservado .test. La contraseña de las cuentas sale de SEED_PASSWORD, nunca del código.
//
// Uso: npm run db:seed  (vuelve a crear la institución de demostración desde cero)
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createCredentialUser } from "@/modules/auth/credentials";
import { questionInputSchema, type QuestionInput } from "@/modules/question-bank/content";

const DEMO_SLUG = "demo-los-andes";
const EMAIL_DOMAIN = "losandes.test";

const TEACHERS = [
  { key: "mat", name: "Carlos Mejía", email: "cmejia" },
  { key: "cie", name: "Diana Ospina", email: "dospina" },
] as const;

const STUDENTS = [
  { name: "Santiago Gómez", email: "sgomez", isMinor: true },
  { name: "Valentina Ríos", email: "vrios", isMinor: true },
  { name: "Mateo Cárdenas", email: "mcardenas", isMinor: false },
  { name: "Isabella Quintero", email: "iquintero", isMinor: true },
  { name: "Samuel Herrera", email: "sherrera", isMinor: true },
  { name: "Mariana López", email: "mlopez", isMinor: false },
  { name: "Juan Pablo Vélez", email: "jpvelez", isMinor: true },
  { name: "Sofía Arango", email: "sarango", isMinor: true },
] as const;

const COURSES = [
  { code: "MAT-11A", name: "Matemáticas 11A", teacher: "mat", students: [0, 1, 2, 3, 4, 5] },
  { code: "FIS-11A", name: "Física 11A", teacher: "cie", students: [0, 1, 2, 3, 4, 5] },
  { code: "QUI-10B", name: "Química 10B", teacher: "cie", students: [6, 7] },
] as const;

const PERIOD = "2026-2";

// Una pregunta de cada tipo para cada docente, con categorías y etiquetas para probar los filtros.
const QUESTIONS: Record<(typeof TEACHERS)[number]["key"], QuestionInput[]> = {
  mat: [
    {
      type: "SINGLE_CHOICE",
      prompt: "¿Cuál es la derivada de f(x) = 3x²?",
      points: 1,
      options: [
        { id: "mat1a", label: "3x" },
        { id: "mat1b", label: "6x" },
        { id: "mat1c", label: "6x²" },
        { id: "mat1d", label: "x³" },
      ],
      answerKey: { correctOptionIds: ["mat1b"] },
      category: "Cálculo",
      tags: ["derivadas"],
    },
    {
      type: "MULTIPLE_CHOICE",
      prompt: "¿Cuáles de estos números son primos?",
      points: 1.5,
      options: [
        { id: "mat2a", label: "2" },
        { id: "mat2b", label: "9" },
        { id: "mat2c", label: "13" },
        { id: "mat2d", label: "21" },
      ],
      answerKey: { correctOptionIds: ["mat2a", "mat2c"] },
      category: "Aritmética",
      tags: ["primos"],
    },
    {
      type: "TRUE_FALSE",
      prompt: "La suma de los ángulos internos de un triángulo es 180°.",
      points: 0.5,
      answerKey: { value: true },
      category: "Geometría",
      tags: ["triángulos"],
    },
    {
      type: "SHORT_ANSWER",
      prompt: "Escribe el valor de x en la ecuación 2x + 6 = 14.",
      points: 1,
      answerKey: { accepted: ["4", "x = 4", "x=4"] },
      category: "Álgebra",
      tags: ["ecuaciones"],
    },
    {
      type: "LONG_ANSWER",
      prompt: "Explica con tus palabras qué representa la pendiente de una recta y da un ejemplo de la vida diaria.",
      points: 3,
      answerKey: { rubric: "Relaciona la pendiente con la razón de cambio; el ejemplo debe ser coherente (velocidad, precios, rampas)." },
      category: "Álgebra",
      tags: ["funciones"],
    },
  ],
  cie: [
    {
      type: "SINGLE_CHOICE",
      prompt: "¿Cuál es la unidad de fuerza en el Sistema Internacional?",
      points: 1,
      options: [
        { id: "cie1a", label: "Joule" },
        { id: "cie1b", label: "Newton" },
        { id: "cie1c", label: "Pascal" },
      ],
      answerKey: { correctOptionIds: ["cie1b"] },
      category: "Física",
      tags: ["unidades"],
    },
    {
      type: "TRUE_FALSE",
      prompt: "El agua pura es una mezcla homogénea.",
      points: 0.5,
      answerKey: { value: false },
      category: "Química",
      tags: ["materia"],
    },
    {
      type: "SHORT_ANSWER",
      prompt: "¿Cuál es el símbolo químico del sodio?",
      points: 1,
      answerKey: { accepted: ["Na"] },
      category: "Química",
      tags: ["tabla periódica"],
    },
    {
      type: "LONG_ANSWER",
      prompt: "Describe la diferencia entre masa y peso.",
      points: 2,
      answerKey: { rubric: "Masa: cantidad de materia (kg), no cambia. Peso: fuerza de gravedad sobre la masa (N), depende del lugar." },
      category: "Física",
      tags: ["conceptos"],
    },
  ],
};

async function removeDemoInstitution() {
  const existing = await prisma.institution.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (!existing) return;
  const institutionId = existing.id;
  // Orden inverso a las dependencias; sesiones y cuentas caen en cascada con el usuario.
  await prisma.auditLog.deleteMany({ where: { institutionId } });
  await prisma.question.deleteMany({ where: { institutionId } });
  await prisma.course.deleteMany({ where: { institutionId } });
  await prisma.user.deleteMany({ where: { institutionId } });
  await prisma.policy.deleteMany({ where: { institutionId } });
  await prisma.institution.delete({ where: { id: institutionId } });
}

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Define SEED_PASSWORD (mínimo 10 caracteres) para crear las cuentas de demostración.");
  }

  await removeDemoInstitution();

  const institution = await prisma.institution.create({
    data: {
      name: "Institución Educativa Los Andes (demo)",
      slug: DEMO_SLUG,
      policy: {
        create: {
          evidenceRetentionDays: 30,
          ruleThresholds: {} as Prisma.InputJsonValue,
        },
      },
    },
  });

  // Las cuentas de demostración no exigen cambiar la contraseña, para que la demo funcione
  // con una sola contraseña compartida. Las cuentas reales sí lo exigen (valor por defecto).
  const common = { institutionId: institution.id, password, mustChangePassword: false };

  await createCredentialUser({ ...common, name: "Laura Restrepo", email: `rectoria@${EMAIL_DOMAIN}`, role: "ADMIN" });

  const teacherIds = new Map<string, string>();
  for (const teacher of TEACHERS) {
    const user = await createCredentialUser({ ...common, name: teacher.name, email: `${teacher.email}@${EMAIL_DOMAIN}`, role: "TEACHER" });
    teacherIds.set(teacher.key, user.id);
  }

  const studentIds: string[] = [];
  for (const student of STUDENTS) {
    const user = await createCredentialUser({
      ...common,
      name: student.name,
      email: `${student.email}@${EMAIL_DOMAIN}`,
      role: "STUDENT",
      isMinor: student.isMinor,
    });
    studentIds.push(user.id);
  }

  for (const course of COURSES) {
    const teacherId = teacherIds.get(course.teacher);
    if (!teacherId) throw new Error(`Docente desconocido: ${course.teacher}`);
    await prisma.course.create({
      data: {
        institutionId: institution.id,
        code: course.code,
        name: course.name,
        period: PERIOD,
        teachers: { create: { teacherId } },
        enrollments: {
          create: course.students.map((index) => {
            const studentId = studentIds[index];
            if (!studentId) throw new Error(`Estudiante desconocido: ${index}`);
            return { studentId };
          }),
        },
      },
    });
  }

  let questionCount = 0;
  for (const [key, questions] of Object.entries(QUESTIONS)) {
    const ownerId = teacherIds.get(key);
    if (!ownerId) throw new Error(`Docente desconocido: ${key}`);
    for (const input of questions) {
      // Se valida con el mismo esquema de la aplicación para que la demo nunca tenga datos inválidos.
      const question = questionInputSchema.parse(input);
      await prisma.question.create({
        data: {
          institutionId: institution.id,
          ownerId,
          type: question.type,
          prompt: question.prompt,
          options: question.options as Prisma.InputJsonValue,
          answerKey: question.answerKey as Prisma.InputJsonValue,
          points: question.points,
          category: question.category,
          tags: question.tags,
        },
      });
      questionCount++;
    }
  }

  console.log(
    `Demo lista: ${institution.name} · 1 rectora, ${TEACHERS.length} docentes, ${STUDENTS.length} estudiantes, ${COURSES.length} cursos, ${questionCount} preguntas.\n` +
      `Cuentas: rectoria@${EMAIL_DOMAIN}, ${TEACHERS.map((t) => `${t.email}@${EMAIL_DOMAIN}`).join(", ")}, ` +
      `${STUDENTS[0].email}@${EMAIL_DOMAIN} (y demás estudiantes). Contraseña: la de SEED_PASSWORD.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
