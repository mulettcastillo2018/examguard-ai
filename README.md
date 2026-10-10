# ExamGuard AI

Plataforma de exámenes en línea para colegios y universidades, con supervisión asistida por IA.

> **La IA no decide que un estudiante hizo trampa.** Detecta eventos (cambios de pestaña, inactividad, desconexiones), los organiza en señales con una explicación factual y recomienda revisar. La decisión siempre es de una persona.

## Estado

En construcción por fases (ver [roadmap](docs/ANALISIS.md#13-roadmap-ajustado)).

- **Fase 0 — Análisis:** [docs/ANALISIS.md](docs/ANALISIS.md) y [decisiones técnicas](docs/DECISIONES.md).
- **Fase 1 — Plataforma base:** Next.js 16, TypeScript estricto, Tailwind 4 y shadcn/ui; Prisma con PostgreSQL (Neon); Better Auth; roles y permisos; paneles por rol; auditoría; seed de demostración; pruebas e integración continua.
- **Fase 2 — Administración y exámenes:** usuarios (manual y por CSV), cursos y matrículas, banco de preguntas y constructor de exámenes (cinco tipos, borrador y publicación congelada, ajustes por estudiante).
- **Fase 3 — Examen del estudiante:** compatibilidad, consentimiento, tiempo del servidor, guardado automático, un dispositivo activo, entrega automática, calificación automática y manual, publicación de notas.
- **Fase 4 — Supervisión básica:** detectores del navegador, ingesta por lotes, catálogo de eventos, simulador ("modo demostración") y monitoreo en vivo del docente.
- **Fase 5 — Agentes y reglas:** agentes de dominio, motor de reglas con umbrales por institución, agente de riesgo, señales con explicación factual y resumen para quien revisa (Claude, con barreras de lenguaje y plantilla de respaldo).
- **Fase 6 — Revisión humana:** cola de sesiones por revisar, revisión con línea de tiempo filtrable (cada evento marca la señal que lo cita), decisión con observaciones y auditoría, y "Mis datos de supervisión" para el estudiante.
- **Siguen:** cámara y audio reales (Fase 7) y producción (Fase 8).

## Stack

| Capa | Tecnologías |
|---|---|
| Aplicación | Next.js 16 (App Router, Route Handlers, `proxy.ts`), React 19, TypeScript estricto |
| Interfaz | Tailwind CSS 4, shadcn/ui (Radix), lucide, next-intl (español, preparado para más idiomas) |
| Datos | PostgreSQL (Neon), Prisma |
| Autenticación | Better Auth (correo y contraseña, sin registro público), roles ADMIN / TEACHER / STUDENT |
| Calidad | Vitest (unitarias e integración), Playwright (E2E), ESLint, GitHub Actions |

## Correr en local

Requisitos: Node.js 20.9+ y una base PostgreSQL (por ejemplo, un proyecto gratuito de [Neon](https://neon.tech)).

```bash
cp .env.example .env      # DATABASE_URL, BETTER_AUTH_SECRET, SEED_PASSWORD...
npm install
npm run db:migrate        # aplica las migraciones
npm run db:seed           # institución de demostración con datos ficticios
npm run dev               # http://localhost:3000
```

Cuentas de demostración (contraseña: la de `SEED_PASSWORD`):

| Rol | Correo |
|---|---|
| Rectora (administración) | `rectoria@losandes.test` |
| Docentes | `cmejia@losandes.test`, `dospina@losandes.test` |
| Estudiantes | `sgomez@losandes.test` (menor de edad), `mcardenas@losandes.test`, … |

## Pruebas

```bash
npm run typecheck          # TypeScript
npm test                   # unitarias
npm run test:integration   # contra la base de datos (crean y borran sus propios datos)
npm run test:e2e           # Playwright, contra el build de producción y el seed
```

En GitHub Actions corren todas, además del lint y la verificación de que el esquema coincide con las migraciones, contra una base PostgreSQL nueva.

### Detrás de un proxy corporativo

Este proyecto se desarrolla en una red que bloquea algunos paquetes con binarios. Lo que cambia está explicado en [docs/DECISIONES.md](docs/DECISIONES.md):

- Comandos que descargan algo (npm, `next build` con Google Fonts): `NODE_OPTIONS=--use-system-ca`.
- Motores de Prisma descargados a mano, indicados en `.env`.
- ESLint y Playwright solo corren en CI.

## Documentación

- [Análisis y propuesta técnica](docs/ANALISIS.md): revisión crítica de la especificación, arquitectura, modelo de datos, agentes, privacidad, riesgos y roadmap.
- [Decisiones técnicas](docs/DECISIONES.md).
- [Especificación original](docs/especificacion-original.md).
