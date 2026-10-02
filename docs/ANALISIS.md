# ExamGuard AI — Análisis inicial y propuesta técnica (Fase 0)

Fecha: 1 de octubre de 2026 · Fuente: `docs/especificacion-original.docx` (31 secciones)

Este documento responde a la sección 27 de la especificación ("NO empieces escribiendo todo el código. Primero analiza el proyecto"). Contiene la revisión crítica de la especificación, las restricciones reales del entorno de desarrollo y la propuesta técnica: arquitectura, carpetas, esquema Prisma, interfaces, flujos, agentes, privacidad, riesgos y roadmap. Al final están las decisiones que deben tomarse antes de la Fase 1.

---

## 1. Veredicto general

La especificación es sólida en lo más difícil de un sistema de supervisión: **separa detección, interpretación y decisión humana**, prohíbe el reconocimiento facial y la inferencia de intenciones, y pone la privacidad desde el diseño. Ese principio es el valor del proyecto y se mantiene intacto.

Tiene vacíos que, de no resolverse antes de programar, obligarían a rehacer partes del sistema:

1. **Menores de edad.** Habla de colegios, pero no de autorización de padres o acudientes ni del régimen de datos de menores en Colombia.
2. **La cámara no puede ser obligatoria.** La ley colombiana no permite condicionar un servicio a que el titular entregue datos sensibles; falta el camino para quien no da permiso.
3. **Calificación.** Hay respuesta corta y larga, pero no existe el flujo de calificación manual ni la publicación de notas.
4. **Integridad del examen.** No dice que el tiempo lo controle el servidor, que las preguntas se congelen al publicar ni que las respuestas correctas nunca lleguen al navegador.
5. **Honestidad técnica.** Todo lo que detecta el navegador se puede evadir (otro dispositivo, herramientas de desarrollo). El producto debe presentarse como disuasión y señales para revisión, no como garantía.
6. **Evidencia audiovisual.** Pide video y audio como evidencia, pero también minimización y procesamiento local. Hay que elegir; grabar tiene costo legal, de almacenamiento y de ancho de banda.
7. **Ajustes razonables y equidad.** No contempla tiempo extra, exención de cámara ni falsos positivos (mala conexión, discapacidad, espacios compartidos).
8. **Stack desactualizado en dos puntos.** Auth.js v5 sigue en beta (5.0.0-beta.32) y Next.js 16 reemplazó `middleware` por `proxy`.

---

## 2. Revisión crítica por tema

| # | Tema | Qué dice la especificación | Qué falta o cambiaría | Recomendación |
|---|---|---|---|---|
| 1 | Menores de edad | Colegios y universidades | Ley 1581 de 2012 (art. 7) y su reglamentación (Decreto 1074 de 2015, compila el 1377 de 2013) exigen que el tratamiento de datos de niños, niñas y adolescentes responda a su interés superior y que la autorización la dé su representante legal | Campo `isMinor` en el estudiante y registro de consentimiento con quién lo otorga (estudiante o acudiente). Validar textos con asesoría legal |
| 2 | Cámara y micrófono | "Cuando exista autorización" | La imagen y la voz son datos personales; usadas para identificar son biométricos (sensibles). No se puede condicionar el examen a entregarlos | Camino alterno sin cámara: el examen sigue, la sesión queda marcada como "sin cámara por decisión del titular" y eso **no** genera señales de riesgo |
| 3 | Calificación | "Resultados automáticos" | Preguntas abiertas sin flujo de calificación; no hay publicación de notas | Calificación automática para preguntas cerradas, cola de calificación manual para abiertas y publicación explícita de resultados por el docente |
| 4 | Tiempo | Temporizador | Si lo controla el navegador se manipula | El servidor fija `deadlineAt` al iniciar; el navegador solo lo muestra. Envío automático al vencer |
| 5 | Preguntas | Banco reutilizable | Si se edita una pregunta del banco, cambian exámenes ya presentados | Al publicar, el examen copia sus preguntas (`ExamQuestion`). El banco se puede editar sin afectar lo ya presentado |
| 6 | Respuestas correctas | — | Si llegan al navegador, se leen con herramientas de desarrollo | El navegador recibe preguntas sin la clave; se califica en el servidor |
| 7 | Evasión | Proctoring en el navegador | Otro dispositivo, máquina virtual o extensiones lo evaden | Decirlo en la documentación y en la interfaz: son señales para revisión. Sumar lo que sí controla el servidor: un solo dispositivo activo por intento, ventana horaria, intentos |
| 8 | Evidencia | Video, audio, eventos, timestamps | Contradice la minimización; grabar implica almacenamiento de objetos, cifrado y costos | MVP sin grabación: el navegador procesa cámara y audio localmente y envía solo eventos. Fotos puntuales al ocurrir un evento como evolución opcional |
| 9 | Equidad | — | Falsos positivos por conexión, discapacidad, ruido o espacio compartido | Ajustes por estudiante (tiempo extra, exención de cámara), umbrales configurables y página donde el estudiante ve qué se registró de su sesión |
| 10 | "Agentes" | Activity, Focus, Vision, Audio, Risk | Casi todos son análisis deterministas; llamar "IA" a todo resta credibilidad técnica | Distinguir **detectores** (navegador) de **agentes** (servidor). El modelo de lenguaje solo se usa donde aporta: el resumen del Risk Agent y, a futuro, un asistente de revisión con herramientas |
| 11 | Tiempo real | "Session active" en el dashboard | Vercel no mantiene websockets | Consulta periódica (polling) cada 5–10 s o Server-Sent Events. Sin servidor de sockets |
| 12 | Envío de eventos | Event Stream | Sin reglas de entrega | Lotes cada pocos segundos, identificador por evento (no duplicar), cola local si se cae la red, `sendBeacon` al cerrar, límite de tamaño y de frecuencia |
| 13 | Dispositivos | — | La pantalla completa no funciona igual en iPhone; los eventos de foco cambian en celulares | Exámenes supervisados solo en computador; la prueba de compatibilidad lo verifica y lo explica |
| 14 | Multi-institución | Institution como raíz | Riesgo de que un usuario vea datos de otra institución | Toda consulta filtrada por `institutionId` desde la capa de servicios, con pruebas que intenten cruzar instituciones |
| 15 | Usuarios | "Crear usuarios" | No hay invitación, restablecimiento de contraseña ni carga masiva | Alta manual y por CSV, contraseña temporal con cambio obligatorio al primer ingreso |
| 16 | Stack | Auth.js, `middleware` | Auth.js v5 en beta; Next 16 usa `proxy.ts` | Better Auth 1.7 (estable, con Prisma y límites de intentos incluidos) y `proxy.ts` |
| 17 | Carpetas | `lib/agents` y `agents/` | Duplicado: no queda claro dónde vive cada cosa | Un solo módulo de agentes (ver sección 5) |

---

## 3. Restricciones del entorno de desarrollo y cómo se resuelven

Verificado en este equipo el 1 de octubre de 2026:

| Necesidad | Situación | Solución |
|---|---|---|
| Docker y Docker Compose | No instalados; sin permisos de administrador ni WSL | Se escriben `Dockerfile` y `docker-compose.yml` y se validan en GitHub Actions: se construye la imagen, se levanta con PostgreSQL y se consulta `/api/health` |
| PostgreSQL | No hay servidor local | Neon (como en los otros proyectos): una rama para desarrollo. En CI, PostgreSQL como servicio |
| Prisma | Versión 7 disponible; los motores binarios se descargaron a mano en los proyectos anteriores por el proxy | Probar primero Prisma 7 (cliente sin motor Rust con `@prisma/adapter-pg`); si `migrate` exige el motor de esquema, repetir la descarga manual |
| Playwright | El CDN de navegadores no responde desde esta red | Usar el Edge instalado (`channel: "msedge"`) en local; Chromium en CI |
| MediaPipe (detección de rostros) | El modelo `blaze_face_short_range.tflite` (229 KB) sí descarga; el WASM viene en el paquete npm | Servir modelo y WASM desde `public/` (sin CDN externo, compatible con una CSP estricta) |
| API de Claude | `api.anthropic.com` responde (401 sin llave) | Funciona con una API key. Sin llave, un proveedor simulado mantiene todo operativo |
| shadcn/ui | El registro responde | Usar la CLI normalmente |
| Lint | En el portafolio, ESLint se retiró por dependencias bloqueadas | Probar ESLint 10 con `NODE_OPTIONS=--use-system-ca`; si falla, Biome |

---

## 4. Arquitectura propuesta

**Monolito modular en Next.js 16**: una sola aplicación desplegable, con la lógica de negocio separada por módulos de dominio que no dependen de React. Las rutas (páginas, Route Handlers y Server Actions) son delgadas: validan con zod, verifican permisos y llaman a un servicio.

```
Navegador
 ├─ Interfaz por rol (admin / docente / estudiante)  ── Server Actions y Route Handlers
 └─ Proctoring SDK (solo durante el examen)
     ├─ Detectores: actividad, foco, pestañas, pantalla completa, conexión,
     │              cámara (rostros, local) y audio (nivel, local)
     ├─ Cola local + envío por lotes ───────────────► POST /api/proctoring/events
     └─ Simulador (modo demo)

Servidor (Next.js)
 ├─ proxy.ts ── redirección gruesa por rol (la verificación real está en cada servicio)
 ├─ Módulos: auth · rbac · institutions · courses · question-bank · exams ·
 │           attempts · grading · proctoring · review · audit · privacy · analytics
 └─ Pipeline de supervisión
     Ingesta (valida, deduplica, guarda eventos)
        → Orquestador (por sesión, cuando llegan eventos nuevos)
        → Agentes de dominio: Activity · Focus · Vision · Audio  (resumen determinista)
        → Rule Engine (umbrales de la política de la institución)  → RiskSignal
        → Risk Agent (combina señales; resumen opcional con LLM y validación)
        → Sesión marcada "revisión recomendada"  → Docente decide

PostgreSQL (Prisma)          AIProvider: Anthropic | simulado
Observabilidad: AgentRun (latencia, modelo, tokens, errores) + logs estructurados
```

Decisiones clave:

- **El Rule Engine no depende del LLM.** Todas las señales salen de reglas deterministas y probadas. El modelo de lenguaje solo redacta un resumen de lo que las reglas ya establecieron.
- **El procesamiento de la sesión es corto y síncrono** al recibir cada lote (reglas baratas). El resumen con LLM se genera al abrir la revisión y queda guardado, para no gastar tokens en sesiones que nadie revisa.
- **Tareas programadas** (vencimiento de intentos, borrado por retención) como rutas protegidas que invoca Vercel Cron o GitHub Actions; en Docker, el mismo endpoint con un cron del contenedor.

---

## 5. Estructura de carpetas

```
examguard-ai/
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── admin/            dashboard, users, courses, policies, audit, metrics
│   │   ├── teacher/          dashboard, exams/new, exams/[id], question-bank,
│   │   │                     grading/[examId], proctoring/session/[id]
│   │   ├── student/          dashboard, exam/[id]/check, exam/[id], results, my-data
│   │   └── api/              auth/[...all], proctoring/events, attempts/..., cron/..., health
│   ├── components/
│   │   ├── ui/               shadcn/ui
│   │   └── dashboard/ exams/ questions/ proctoring/ timeline/ charts/
│   ├── modules/              lógica de negocio por dominio (sin React, sin acceso cruzado a Prisma)
│   │   ├── auth/ rbac/ institutions/ courses/ question-bank/ exams/ attempts/ grading/
│   │   ├── proctoring/       ingesta, catálogo de tipos de evento, sesiones
│   │   ├── rules/            motor + reglas (una por archivo)
│   │   ├── agents/           types.ts, orchestrator.ts, activity/ focus/ vision/ audio/ risk/
│   │   ├── ai/               provider.ts, anthropic.ts, mock.ts, guardrails.ts
│   │   └── review/ audit/ privacy/ analytics/ observability/
│   ├── proctoring-sdk/       código que corre en el navegador del estudiante
│   │   ├── detectors/        activity, focus, fullscreen, connection, camera, audio
│   │   └── queue.ts, transport.ts, simulator.ts
│   ├── lib/                  db.ts, env.ts, logger.ts, errors.ts, time.ts
│   └── proxy.ts
├── prisma/                   schema.prisma, migrations/, seed.ts
├── public/models/            modelo de detección de rostros (y WASM de MediaPipe)
├── tests/                    unit/ integration/ e2e/
├── docker/                   Dockerfile, docker-compose.yml
├── docs/                     este análisis, arquitectura, privacidad, decisiones (ADR)
└── .github/workflows/ci.yml
```

Regla de dependencias: `app/` → `modules/` → `lib/`. Un módulo usa otro solo a través de su archivo `index.ts`. `proctoring-sdk/` no importa nada del servidor; comparte con él únicamente los tipos y el catálogo de eventos (validado con zod en ambos lados).

---

## 6. Esquema Prisma (propuesta)

Los modelos de sesión, cuenta y verificación de Better Auth se generan con su CLI y se integran a este esquema; `User` extiende el suyo con rol e institución.

```prisma
enum Role            { ADMIN TEACHER STUDENT }
enum QuestionType    { SINGLE_CHOICE MULTIPLE_CHOICE TRUE_FALSE SHORT_ANSWER LONG_ANSWER }
enum ExamStatus      { DRAFT PUBLISHED CLOSED ARCHIVED }
enum AttemptStatus   { IN_PROGRESS SUBMITTED AUTO_SUBMITTED }
enum GradingStatus   { PENDING_MANUAL GRADED }
enum Severity        { LOW MEDIUM HIGH }
enum EventCategory   { EXAM ACTIVITY FOCUS VISION AUDIO CONNECTION }
enum EventSource     { BROWSER SIMULATION SERVER }
enum ReviewStatus    { NOT_REQUIRED RECOMMENDED REVIEWED }
enum ReviewOutcome   { NO_IRREGULARITY_OBSERVED NEEDS_FURTHER_INVESTIGATION }
enum ConsentGrantor  { STUDENT GUARDIAN }
enum AgentRunStatus  { SUCCESS ERROR SKIPPED }

model Institution {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  policy    Policy?
  users     User[]
  courses   Course[]
  exams     Exam[]
  auditLogs AuditLog[]
}

model Policy {
  id                    String      @id @default(cuid())
  institutionId         String      @unique
  institution           Institution @relation(fields: [institutionId], references: [id])
  evidenceRetentionDays Int         @default(30)   // 7, 30, 90 o personalizado
  ruleThresholds        Json                       // umbrales del Rule Engine
  consentTextVersion    String
  updatedAt             DateTime    @updatedAt
}

model User {                                       // extiende el usuario de Better Auth
  id            String       @id @default(cuid())
  name          String
  email         String       @unique
  emailVerified Boolean      @default(false)
  role          Role
  institutionId String
  institution   Institution  @relation(fields: [institutionId], references: [id])
  isMinor       Boolean      @default(false)
  active        Boolean      @default(true)
  mustChangePassword Boolean @default(true)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  teaching      CourseTeacher[]
  enrollments   Enrollment[]
  questions     Question[]
  attempts      ExamAttempt[]
  reviews       Review[]
  @@index([institutionId, role])
}

model Course {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  name          String
  code          String
  period        String                         // ej. "2026-2"
  teachers      CourseTeacher[]
  enrollments   Enrollment[]
  exams         Exam[]
  @@unique([institutionId, code, period])
}

model CourseTeacher {
  courseId  String
  teacherId String
  course    Course @relation(fields: [courseId], references: [id])
  teacher   User   @relation(fields: [teacherId], references: [id])
  @@id([courseId, teacherId])
}

model Enrollment {
  courseId  String
  studentId String
  course    Course   @relation(fields: [courseId], references: [id])
  student   User     @relation(fields: [studentId], references: [id])
  createdAt DateTime @default(now())
  @@id([courseId, studentId])
}

model Question {                                 // banco de preguntas
  id            String       @id @default(cuid())
  institutionId String
  ownerId       String
  owner         User         @relation(fields: [ownerId], references: [id])
  type          QuestionType
  prompt        String
  points        Decimal      @default(1)
  category      String?
  tags          String[]
  archivedAt    DateTime?
  options       QuestionOption[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  @@index([institutionId, ownerId])
}

model QuestionOption {
  id         String   @id @default(cuid())
  questionId String
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  label      String
  isCorrect  Boolean  @default(false)
  position   Int
}

model Exam {
  id                 String     @id @default(cuid())
  institutionId      String
  institution        Institution @relation(fields: [institutionId], references: [id])
  courseId           String
  course             Course     @relation(fields: [courseId], references: [id])
  createdById        String
  title              String
  description        String?
  instructions       String?
  status             ExamStatus @default(DRAFT)
  startsAt           DateTime
  endsAt             DateTime
  durationMinutes    Int
  maxAttempts        Int        @default(1)
  shuffleQuestions   Boolean    @default(false)
  proctoringConfig   Json       // cámara, micrófono, pantalla completa: requerido / opcional / apagado
  publishedAt        DateTime?
  resultsPublishedAt DateTime?
  questions          ExamQuestion[]
  attempts           ExamAttempt[]
  accommodations     Accommodation[]
  @@index([courseId, status])
}

model ExamQuestion {                             // copia congelada al publicar
  id               String       @id @default(cuid())
  examId           String
  exam             Exam         @relation(fields: [examId], references: [id], onDelete: Cascade)
  sourceQuestionId String?
  position         Int
  type             QuestionType
  prompt           String
  options          Json         // [{ id, label, isCorrect }]: la clave nunca sale al navegador
  points           Decimal
  answers          Answer[]
  @@unique([examId, position])
}

model Accommodation {                            // ajustes razonables por estudiante
  examId       String
  studentId    String
  exam         Exam    @relation(fields: [examId], references: [id])
  extraMinutes Int     @default(0)
  cameraExempt Boolean @default(false)
  note         String?
  @@id([examId, studentId])
}

model ExamAttempt {
  id             String        @id @default(cuid())
  examId         String
  exam           Exam          @relation(fields: [examId], references: [id])
  studentId      String
  student        User          @relation(fields: [studentId], references: [id])
  number         Int
  status         AttemptStatus @default(IN_PROGRESS)
  startedAt      DateTime      @default(now())
  deadlineAt     DateTime                      // lo fija el servidor
  submittedAt    DateTime?
  activeClientId String?                       // un solo dispositivo activo
  score          Decimal?
  gradingStatus  GradingStatus?
  answers        Answer[]
  consent        ConsentRecord?
  proctoring     ProctoringSession?
  @@unique([examId, studentId, number])
  @@index([examId, status])
}

model Answer {
  id             String       @id @default(cuid())
  attemptId      String
  attempt        ExamAttempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  examQuestionId String
  examQuestion   ExamQuestion @relation(fields: [examQuestionId], references: [id])
  value          Json
  version        Int          @default(1)      // evita que un guardado viejo pise uno nuevo
  savedAt        DateTime     @updatedAt
  pointsAwarded  Decimal?
  gradedById     String?
  feedback       String?
  @@unique([attemptId, examQuestionId])
}

model ConsentRecord {
  id          String         @id @default(cuid())
  attemptId   String         @unique
  attempt     ExamAttempt    @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  textVersion String
  camera      Boolean
  microphone  Boolean
  grantedBy   ConsentGrantor
  grantedAt   DateTime       @default(now())
}

model ProctoringSession {
  id                String       @id @default(cuid())
  attemptId         String       @unique
  attempt           ExamAttempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  browser           String?
  os                String?
  device            String?
  cameraEnabled     Boolean      @default(false)
  microphoneEnabled Boolean      @default(false)
  reviewStatus      ReviewStatus @default(NOT_REQUIRED)
  startedAt         DateTime     @default(now())
  endedAt           DateTime?
  events            ProctoringEvent[]
  signals           RiskSignal[]
  agentRuns         AgentRun[]
  review            Review?
}

model ProctoringEvent {
  id            String            @id @default(cuid())
  sessionId     String
  session       ProctoringSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  clientEventId String                          // generado en el navegador: deduplica reintentos
  type          String                          // validado contra el catálogo (zod)
  category      EventCategory
  severity      Severity
  occurredAt    DateTime                        // reloj del navegador, corregido con el desfase
  receivedAt    DateTime          @default(now())
  durationSec   Int?
  confidence    Float?
  metadata      Json
  source        EventSource       @default(BROWSER)
  @@unique([sessionId, clientEventId])
  @@index([sessionId, occurredAt])
}

model RiskSignal {
  id          String            @id @default(cuid())
  sessionId   String
  session     ProctoringSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type        String
  severity    Severity
  confidence  Float
  explanation String                            // hechos observables, nunca intenciones
  ruleId      String
  eventIds    String[]                          // trazabilidad hacia los eventos
  createdAt   DateTime          @default(now())
  @@index([sessionId])
}

model AgentRun {
  id           String            @id @default(cuid())
  sessionId    String
  session      ProctoringSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  agent        String
  status       AgentRunStatus
  provider     String?
  model        String?
  latencyMs    Int
  inputTokens  Int?
  outputTokens Int?
  error        String?
  output       Json?
  createdAt    DateTime          @default(now())
  @@index([agent, createdAt])
}

model Review {
  id         String            @id @default(cuid())
  sessionId  String            @unique
  session    ProctoringSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  reviewerId String
  reviewer   User              @relation(fields: [reviewerId], references: [id])
  outcome    ReviewOutcome
  notes      String?
  reviewedAt DateTime          @default(now())
}

model AuditLog {
  id            String      @id @default(cuid())
  institutionId String
  institution   Institution @relation(fields: [institutionId], references: [id])
  actorId       String?
  action        String       // ej. EXAM_PUBLISHED, SESSION_REVIEWED, RETENTION_PURGE
  entityType    String
  entityId      String?
  metadata      Json?
  ip            String?
  createdAt     DateTime    @default(now())
  @@index([institutionId, createdAt])
}
```

---

## 7. Interfaces principales

```ts
// Catálogo compartido navegador/servidor (validado con zod en ambos lados)
type EventCategory = "EXAM" | "ACTIVITY" | "FOCUS" | "VISION" | "AUDIO" | "CONNECTION";
type Severity = "low" | "medium" | "high";

interface ProctoringEvent {
  id: string;
  clientEventId: string;          // deduplicación de reintentos
  sessionId: string;
  type: string;                   // LOW_ACTIVITY, WINDOW_BLUR, TAB_SWITCH, FULLSCREEN_EXIT, FACE_NOT_VISIBLE...
  category: EventCategory;
  timestamp: Date;
  severity: Severity;
  durationSec?: number;
  confidence?: number;            // solo en detectores estadísticos (visión, audio)
  source: "browser" | "simulation" | "server";
  metadata: Record<string, unknown>;
}

interface RiskSignal {
  id: string;
  sessionId: string;
  type: string;
  severity: Severity;
  confidence: number;
  explanation: string;            // "Se registraron 4 cambios de pestaña entre 09:12 y 09:20."
  ruleId: string;
  eventIds: string[];
}

// Navegador
interface Detector {
  name: string;
  start(emit: (event: DetectedEvent) => void): Promise<void>;
  stop(): void;
}

// Servidor
interface AgentContext {
  session: { id: string; startedAt: Date; endedAt?: Date; cameraEnabled: boolean; microphoneEnabled: boolean };
  events: ProctoringEvent[];      // ordenados por tiempo
  thresholds: RuleThresholds;     // de la política de la institución
  now: Date;
}

interface AgentResult {
  agent: string;
  findings: Finding[];            // resúmenes factuales: conteos, duraciones, ventanas
  signals?: RiskSignalDraft[];
  usage?: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

interface Agent {
  name: string;
  analyze(context: AgentContext): Promise<AgentResult>;
}

interface Rule {
  id: string;
  appliesTo: EventCategory[];
  evaluate(findings: Finding[], thresholds: RuleThresholds): RiskSignalDraft[];
}

interface AIProvider {
  name: string;
  generate(input: AIInput): Promise<AIResult>;   // AIResult incluye texto, modelo y uso de tokens
}
```

---

## 8. Flujo de autenticación

1. **Sin registro público.** La institución es cerrada: el administrador crea usuarios uno a uno o por CSV, con contraseña temporal.
2. **Better Auth** con correo y contraseña; sesión en base de datos y cookie `httpOnly`. Al primer ingreso se obliga a cambiar la contraseña (`mustChangePassword`).
3. **Límite de intentos** de inicio de sesión (incluido en Better Auth) y registro en auditoría de ingresos exitosos y fallidos.
4. **`proxy.ts`** redirige por prefijo (`/admin`, `/teacher`, `/student`) según el rol. Es solo comodidad: **cada servicio vuelve a verificar** rol, institución y propiedad (`requireUser({ roles })`).
5. **Aislamiento entre instituciones** en la capa de servicios, con pruebas que intentan leer datos de otra institución.
6. **Cuentas de demostración** creadas por el seed con una contraseña tomada de variable de entorno, nunca escrita en el código.

---

## 9. Flujo del examen

```
Docente publica  →  se congelan las preguntas (ExamQuestion)
Estudiante entra en la ventana [startsAt, endsAt) y le quedan intentos
  → Prueba de compatibilidad (navegador, conexión, cámara, micrófono, pantalla completa)
  → Consentimiento: qué se recopila, para qué, cuánto tiempo, quién accede y qué pasa si no autoriza
  → Inicio: el servidor crea ExamAttempt + ProctoringSession y fija
       deadlineAt = mín(inicio + duración + minutos extra, endsAt)
  → Respuestas: guardado automático por pregunta (1–2 s después de escribir) con número de versión;
       sin red, se encolan en el navegador y se reenvían al reconectar
  → Eventos de supervisión en lotes; el tiempo sigue corriendo durante una desconexión
  → Envío manual, o envío automático al vencer deadlineAt (al primer request vencido y por tarea programada)
  → Calificación automática de preguntas cerradas; las abiertas pasan a la cola del docente
  → El docente revisa sesiones con "revisión recomendada" y publica resultados
```

Reglas de integridad: un intento activo por estudiante y examen; un solo dispositivo activo (si aparece otro, se registra el evento y el docente decide); las respuestas correctas nunca salen al navegador.

---

## 10. Arquitectura de agentes

**Detectores (navegador)** — producen eventos crudos:

| Detector | Señales | Cómo |
|---|---|---|
| Actividad | LOW_ACTIVITY | Sin mouse, teclado ni desplazamiento durante N segundos |
| Foco | WINDOW_BLUR, TAB_SWITCH | `visibilitychange`, `blur` / `focus` |
| Pantalla completa | FULLSCREEN_EXIT | Fullscreen API |
| Conexión | CONNECTION_LOST / RESTORED | `online` / `offline` y fallos de envío |
| Cámara | FACE_NOT_VISIBLE, MULTIPLE_FACES, FACE_OUT_OF_FRAME | Detección de rostros de MediaPipe, en el navegador, 1–2 cuadros por segundo. Solo cuenta rostros y su posición: sin identificación, sin guardar imágenes |
| Audio | AUDIO_ACTIVITY, MICROPHONE_DISCONNECTED | Nivel de señal con Web Audio. Sin grabar ni identificar voces |

**Agentes (servidor)** — cada uno con una sola responsabilidad:

- **Activity, Focus, Vision y Audio Agents**: resumen determinista de los eventos de su categoría (conteos, duraciones, ventanas de tiempo) en `findings`.
- **Rule Engine**: aplica los umbrales de la política de la institución y crea `RiskSignal` con explicación factual y los eventos que la sustentan.
- **Risk Agent**: combina señales. Por ejemplo, una señal alta, o dos de categorías distintas en 15 minutos, marcan `REVIEW_RECOMMENDED`. Nunca produce un "hizo trampa". Con LLM, redacta un resumen para el docente a partir de las señales.
- **Orquestador**: corre los agentes de la sesión cuando llegan eventos nuevos y registra cada ejecución en `AgentRun`.

Reglas iniciales (configurables por institución):

| Regla | Condición | Señal | Severidad |
|---|---|---|---|
| Inactividad | ≥ 300 s acumulados sin interacción | LOW_ACTIVITY | baja |
| Foco | ≥ 3 cambios de foco o pestaña en 10 min | FOCUS_CHANGES | media |
| Pantalla completa | ≥ 2 salidas | FULLSCREEN_EXITS | media |
| Rostro | ≥ 30 s sin rostro visible | FACE_UNAVAILABLE | media |
| Varios rostros | MULTIPLE_FACES con confianza ≥ 0,8 | MULTIPLE_FACES | alta |
| Audio | ≥ 20 s acumulados de actividad | AUDIO_ACTIVITY | baja |
| Conexión | Desconexión > 60 s | CONNECTION_GAPS | baja |
| Combinación | 1 señal alta, o 2+ señales de categorías distintas en 15 min | REVIEW_RECOMMENDED | — |

**Barreras del LLM** (módulo `ai/guardrails.ts`):

- Recibe solo señales y conteos, nunca datos personales ni nombres (la sesión va con identificador).
- La respuesta debe citar los identificadores de las señales que usa.
- Se rechaza si contiene afirmaciones de intención o culpa ("trampa", "copió", "intentó", "deshonesto", "cheating"…) o menciones de identidad o emociones. Si se rechaza o el proveedor falla, se usa una plantilla factual.
- Cada llamada queda en `AgentRun` con modelo, latencia, tokens y resultado.

---

## 11. Estrategia de privacidad

- **Minimización por diseño:** cámara y audio se procesan en el navegador. Al servidor solo llegan eventos con metadatos (tipo, hora, duración, confianza). El MVP no graba video ni audio.
- **Consentimiento informado y versionado:** el texto tiene versión y se guarda qué se autorizó, quién lo autorizó (estudiante o acudiente) y cuándo. Negarse a la cámara no impide presentar el examen ni genera señales.
- **Menores de edad:** el estudiante marcado como menor requiere el consentimiento de su acudiente, registrado por la institución.
- **Acceso por rol:** el docente solo ve sesiones de sus cursos; el estudiante solo las suyas. Toda revisión y toda exportación quedan en auditoría.
- **Transparencia:** página "Mis datos de supervisión" donde el estudiante ve los eventos registrados de sus sesiones.
- **Retención configurable** (7, 30 o 90 días, o personalizada) con borrado automático por tarea programada; el borrado queda en auditoría. La nota del examen se conserva; los eventos se eliminan.
- **Sin biometría:** detección de rostros (cuántos y dónde), no reconocimiento; no se guardan imágenes ni vectores faciales.
- **Seguridad:** TLS, cifrado en reposo del proveedor de base de datos, cabeceras de seguridad y CSP estricta. Los modelos de visión se sirven desde el propio sitio.
- **Asesoría legal:** los textos de consentimiento y la política de tratamiento deben validarse con un abogado antes de usarse con estudiantes reales.

---

## 12. Riesgos técnicos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Falsos positivos de visión (luz, cámara mala, lentes) | Alto: afecta a estudiantes | Umbrales conservadores, confianza mínima, la señal solo recomienda revisión y el estudiante puede ver sus eventos |
| Evasión del proctoring desde el navegador | Medio | Decirlo con transparencia; controles del servidor (tiempo, dispositivo único, ventana horaria) |
| Pérdida de respuestas por desconexión | Alto | Guardado por pregunta con versión, cola local, reintentos e idempotencia |
| Reloj del navegador manipulado o desfasado | Medio | El servidor fija `deadlineAt`; se calcula el desfase y se usa la hora de recepción como respaldo |
| Exposición de datos entre instituciones | Alto | Filtro por institución en los servicios y pruebas de aislamiento |
| Volumen de eventos | Medio | Lotes, límites por sesión y por minuto, índices y retención |
| Tiempo de cómputo de visión en equipos lentos | Medio | 1–2 cuadros por segundo, modelo corto (229 KB) y modo sin cámara |
| Costo y disponibilidad del LLM | Bajo | Solo para resúmenes bajo demanda y guardados; proveedor simulado como respaldo |
| Prisma o Playwright bloqueados por el proxy | Medio | Rutas alternas ya identificadas (sección 3) |
| Docker no verificable en local | Bajo | Validación en GitHub Actions |
| Aspectos legales (menores, datos sensibles) | Alto si se usa con personas reales | Proyecto de portafolio con datos ficticios; documentación legal explícita |

---

## 13. Roadmap ajustado

El orden cambia respecto a la especificación: **el pipeline de eventos → reglas → revisión se termina antes que la cámara.** Así la demostración completa (sección 26 de la especificación) existe pronto con el simulador, y la parte de mayor riesgo técnico y legal (cámara y audio) llega sobre una base probada.

| Fase | Entregable | Listo cuando |
|---|---|---|
| 0 | Este análisis y las decisiones de la sección 14 | Decisiones tomadas |
| 1 | Plataforma base: Next 16, TypeScript estricto, Tailwind 4, shadcn/ui, Prisma + Neon, Better Auth, RBAC, layouts por rol, auditoría básica, seed de demostración, CI | Ingreso por rol funcionando; pruebas, tipos, lint y build en verde en CI |
| 2 | Administración y exámenes: usuarios (manual y CSV), cursos, matrículas, banco de preguntas, constructor (5 tipos, reordenar, duplicar, borrador y publicación con copia congelada), ajustes por estudiante | El docente crea y publica un examen de punta a punta |
| 3 | Examen del estudiante: compatibilidad, consentimiento, tiempo del servidor, guardado automático, recuperación, envío y envío automático, calificación automática y manual, publicación de resultados | Prueba E2E: el estudiante presenta y el docente publica notas |
| 4 | Supervisión básica: detectores de navegador, ingesta por lotes, catálogo de eventos, simulador, monitoreo en vivo del docente | Los eventos simulados y reales aparecen en vivo |
| 5 | Agentes y Rule Engine: interfaz común, orquestador, reglas, Risk Agent, AIProvider (Anthropic y simulado), barreras, AgentRun | Pruebas unitarias de cada regla y agente; la sesión pasa a "revisión recomendada" |
| 6 | Revisión: línea de tiempo con filtros, formulario de revisión, auditoría, "Mis datos de supervisión" | Demo completa de la sección 26 con el simulador |
| 7 | Cámara y audio: detección de rostros local con MediaPipe, nivel de audio, flujo de consentimiento y camino sin cámara | Mismos eventos que el simulador, con cámara real |
| 8 | Producción: Docker, retención automática, métricas, endurecimiento (CSP, límites), E2E completo, documentación, despliegue, README de vitrina y caso de estudio en el portafolio | Demo pública; CI en verde |

Al cerrar cada fase: pruebas, TypeScript, lint, corrección de errores, documentación actualizada y commit. No se avanza con errores importantes abiertos.

---

## 14. Decisiones tomadas (1 de octubre de 2026)

| # | Tema | Decisión | Consecuencia para el diseño |
|---|---|---|---|
| 1 | Evidencia audiovisual | **No se graba en el MVP.** Cámara y audio se procesan en el navegador; solo se envían eventos | Sin almacenamiento de archivos ni cifrado de medios en las primeras fases. La revisión usa la línea de tiempo y las señales. Fotos puntuales quedan como evolución opcional |
| 2 | Menores de edad | **Se contemplan desde la Fase 1** | `User.isMinor`; el consentimiento de un menor lo otorga su acudiente (`ConsentGrantor.GUARDIAN`). La institución registra al acudiente |
| 3 | Proveedor de IA | **Claude (API de Anthropic)**, con proveedor simulado como respaldo | `AIProvider` con dos implementaciones. La API key se necesita en la Fase 5; sin ella, todo funciona con plantillas |
| 4 | Idioma | **Español, preparado para inglés** | Todos los textos de la interfaz en archivos de mensajes desde el inicio; el inglés se agrega al final sin tocar componentes |
| 5 | Autenticación | **Better Auth** (estable) en lugar de Auth.js v5 (beta) | Modelos de sesión, cuenta y verificación generados por su CLI |
| 6 | Base de datos y despliegue | **Proyecto nuevo en Neon**, demo en Vercel; Docker validado en GitHub Actions | Se necesita la cadena de conexión de Neon para las migraciones de la Fase 1 |
| 7 | Repositorio | **Público en GitHub**, como los otros proyectos | Revisión de secretos antes del primer push |
