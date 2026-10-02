# ExamGuard AI

> Transcripción del documento original (Word) con el que se planteó el proyecto. El contenido es el mismo; se publica en Markdown para no incluir los metadatos del archivo.

Plataforma de exámenes online con supervisión inteligente mediante IA

Documento de producto, arquitectura y especificación técnica

Versión: 1.0

Tipo: Proyecto de portafolio / MVP SaaS educativo

Tecnologías principales: Next.js, React, TypeScript, PostgreSQL, Prisma, Docker, IA generativa y agentes especializados

## 1. Resumen ejecutivo

ExamGuard AI es una plataforma web para que colegios y universidades puedan realizar exámenes online cuando una evaluación presencial no sea posible.

El sistema tendrá tres tipos principales de usuarios:

- Administrador / Rector
- Docente
- Estudiante

El docente podrá crear exámenes, asignarlos a cursos y supervisar los resultados.

Los estudiantes podrán realizar los exámenes desde el navegador, con mecanismos de recuperación automática, temporizador y seguimiento de la sesión.

Una característica diferencial será un sistema de supervisión asistida por IA capaz de detectar señales potencialmente relevantes durante un examen.

Estas señales pueden incluir:

- cambios de pestaña;
- pérdida de foco;
- salida del modo pantalla completa;
- períodos prolongados de inactividad;
- ausencia del rostro del encuadre;
- presencia de múltiples rostros;
- actividad de audio;
- desconexiones;
- otros eventos técnicos.

La IA no determinará automáticamente que un estudiante hizo trampa.

En su lugar, el sistema generará señales, eventos y recomendaciones para que un docente autorizado pueda revisar el contexto y tomar la decisión correspondiente.

## 2. Problema

Los colegios y universidades pueden necesitar realizar evaluaciones remotas debido a:

- emergencias;
- problemas de infraestructura;
- suspensión de clases presenciales;
- estudiantes remotos;
- educación híbrida;
- situaciones climáticas;
- problemas de transporte;
- contingencias institucionales.

Las plataformas tradicionales de formularios permiten realizar preguntas, pero normalmente no ofrecen una experiencia integrada de:

- creación de exámenes;
- gestión de cursos;
- autenticación;
- temporizador;
- seguimiento de sesiones;
- supervisión;
- análisis de eventos;
- revisión docente;
- auditoría.

ExamGuard AI busca integrar todos estos componentes en una única plataforma.

## 3. Propuesta de valor

La plataforma busca proporcionar:

Para docentes

- creación rápida de exámenes;
- reutilización de preguntas;
- control de tiempos;
- resultados automáticos;
- supervisión asistida;
- revisión de sesiones;
- reportes.

Para estudiantes

- interfaz sencilla;
- examen desde el navegador;
- guardado automático;
- recuperación ante desconexiones;
- instrucciones claras;
- experiencia accesible.

Para administradores

- control institucional;
- usuarios;
- cursos;
- políticas;
- auditoría;
- estadísticas;
- configuración de retención de datos.

## 4. Principio fundamental de la IA

El sistema debe separar:

detección de eventos

de

interpretación

y de

decisión humana.

Ejemplo:

Un estudiante no mueve el mouse durante cinco minutos.

El sistema NO debe decir:

"El estudiante está haciendo trampa."

Debe registrar:

"Se detectó actividad de interacción baja durante 5 minutos."

Posteriormente puede combinarse con otros eventos.

Por ejemplo:

05:01 — baja actividad

05:42 — pérdida de foco

06:13 — rostro fuera del encuadre

06:29 — actividad de audio

El sistema podría generar:

"Se detectaron múltiples señales que podrían requerir revisión manual."

La decisión final corresponde al docente o a la institución.

## 5. Roles

### 5.1 Administrador / Rector

Permisos:

- administrar institución;
- crear usuarios;
- administrar docentes;
- administrar estudiantes;
- crear cursos;
- asignar docentes;
- asignar estudiantes;
- consultar exámenes;
- consultar resultados;
- revisar sesiones;
- consultar eventos;
- configurar políticas;
- configurar retención;
- consultar auditoría.

### 5.2 Docente

Permisos:

- crear exámenes;
- editar exámenes;
- publicar;
- duplicar;
- cerrar;
- crear preguntas;
- administrar banco de preguntas;
- asignar exámenes;
- consultar estudiantes;
- consultar resultados;
- revisar sesiones;
- revisar eventos;
- agregar observaciones;
- exportar información.

### 5.3 Estudiante

Permisos:

- iniciar sesión;
- consultar cursos;
- consultar exámenes;
- realizar pruebas de compatibilidad;
- iniciar examen;
- responder;
- guardar;
- finalizar;
- consultar resultados publicados.

El estudiante no podrá acceder a información de otros estudiantes.

## 6. Arquitectura general

```
                         ┌───────────────────┐
                         │      Usuario      │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │    Next.js App    │
                         └─────────┬─────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
             ▼                     ▼                     ▼
       Authentication          Exam Engine        Proctoring SDK
             │                     │                     │
             │                     │                     ▼
             │                     │              Event Stream
             │                     │                     │
             │                     │                     ▼
             │                     │              Event Processor
             │                     │                     │
             │                     │                     ▼
             │                     │               Rule Engine
             │                     │                     │
             │                     │                     ▼
             │                     │               AI Agents
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   │
                                   ▼
                              PostgreSQL

```

## 7. Arquitectura del Proctoring Engine

```
                    Exam Session
                         │
                         ▼
                 Proctoring SDK
                         │
                         ▼
                  Event Stream
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    Activity Agent   Vision Agent   Audio Agent
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Rule Engine
                         │
                         ▼
                   Risk Agent
                         │
                         ▼
                 Review Signal
                         │
                         ▼
                      Docente

```

## 8. Agentes de IA

Activity Agent

Analiza:

- mouse;
- teclado;
- interacción;
- inactividad;
- desconexiones.

Ejemplo de evento:

```
{
  "type": "LOW_ACTIVITY",
  "duration": 300,
  "severity": "low"
}

```

Focus Agent

Detecta:

- cambio de pestaña;
- pérdida de foco;
- salida de fullscreen;
- navegación fuera del examen.

Eventos:

WINDOW_BLUR

TAB_SWITCH

FULLSCREEN_EXIT

Vision Agent

Cuando exista autorización para utilizar cámara, puede analizar señales como:

- rostro no visible;
- rostro fuera del encuadre;
- múltiples rostros;
- cambios de orientación.

No debe utilizar reconocimiento facial.

No debe identificar personas.

No debe inferir emociones.

No debe afirmar intenciones.

Ejemplo:

```
{
  "type": "FACE_NOT_VISIBLE",
  "duration": 42,
  "confidence": 0.91
}

```

Audio Agent

Puede detectar señales técnicas relacionadas con actividad de audio.

Ejemplos:

AUDIO_ACTIVITY

MICROPHONE_DISCONNECTED

AUDIO_LEVEL_CHANGE

No debe intentar identificar quién habla.

No debe concluir automáticamente que existe colaboración indebida.

## 9. Rule Engine

El Rule Engine funcionará independientemente de los modelos de lenguaje.

Ejemplo:

LOW_ACTIVITY > 300 segundos

```
        ↓
```

Signal

WINDOW_BLUR > 3

```
        ↓
```

Signal

MULTIPLE_FACES

```
        ↓
```

Signal

Después se pueden combinar señales:

3+ focus events

+

face unavailable

+

audio activity

```
        ↓
```

REVIEW_RECOMMENDED

Nunca:

REVIEW_RECOMMENDED

```
        ↓
```

CHEATING = TRUE

## 10. Event Timeline

Cada sesión tendrá una línea de tiempo.

Ejemplo:

09:01:03  🟢 Exam started

09:12:44  🟡 Window lost focus

09:12:51  🟢 Focus restored

09:20:12  🟡 Low interaction detected

09:25:42  🟠 Face unavailable for 42 seconds

09:31:03  🟡 Audio activity detected

09:45:22  🟢 Exam completed

El docente podrá filtrar:

- todos;
- actividad;
- navegador;
- cámara;
- audio;
- severidad;
- eventos revisados.

## 11. Dashboard del docente

Ruta:

/teacher/dashboard

Debe mostrar:

- próximos exámenes;
- exámenes activos;
- exámenes finalizados;
- estudiantes;
- resultados;
- sesiones pendientes de revisión.

Indicadores:

Exámenes creados

Exámenes activos

Estudiantes evaluados

Sesiones pendientes

## 12. Constructor de exámenes

Ruta:

/teacher/exams/new

Campos:

- título;
- descripción;
- instrucciones;
- curso;
- fecha;
- hora;
- duración;
- número de intentos;
- configuración de supervisión.

Tipos de pregunta:

- opción múltiple;
- selección múltiple;
- verdadero/falso;
- respuesta corta;
- respuesta larga.

Funciones:

- agregar;
- eliminar;
- duplicar;
- reordenar;
- guardar;
- publicar;
- guardar borrador.

## 13. Banco de preguntas

Ruta:

/teacher/question-bank

Funciones:

- crear;
- editar;
- eliminar;
- categorizar;
- etiquetar;
- buscar;
- filtrar;
- reutilizar.

## 14. Experiencia del estudiante

Ruta:

/student/exam/[id]

Debe mostrar:

- tiempo restante;
- progreso;
- pregunta actual;
- navegación;
- respuestas;
- siguiente;
- anterior;
- finalizar.

Debe existir:

- autosave;
- recuperación;
- persistencia;
- manejo de reconexiones.

## 15. Preparación antes del examen

Antes de iniciar:

Compatibilidad del navegador       ✓

Conexión                           ✓

Cámara                             ✓

Micrófono                          ✓

Permisos                           ✓

Pantalla completa                  ✓

El sistema debe explicar claramente:

- qué información se recopila;
- para qué se utiliza;
- cuánto tiempo se conserva;
- quién puede acceder;
- qué ocurre si el estudiante no concede determinados permisos.

## 16. Vista de revisión

Ruta:

/teacher/proctoring/session/[id]

Mostrar:

Información

- estudiante;
- examen;
- hora de inicio;
- hora de finalización;
- duración;
- navegador;
- dispositivo.

Timeline

Todos los eventos.

Evidencia

Cuando corresponda y exista autorización:

- video;
- audio;
- eventos;
- timestamps.

Revisión

Opciones:

✓ Revisado

○ Sin irregularidad observada

○ Requiere investigación adicional

Campo:

Observaciones del docente

## 17. Modelo de datos

Entidades principales:

User

Institution

Course

Enrollment

Exam

Question

QuestionOption

ExamAttempt

Answer

ProctoringSession

ProctoringEvent

RiskSignal

AgentRun

Review

AuditLog

Policy

Relación conceptual:

Institution

```
 ├── Users
 ├── Courses
 │     ├── Teacher
 │     └── Students
 │
 └── Exams
       ├── Questions
       └── Attempts
              └── ProctoringSession
                     ├── Events
                     ├── Signals
                     ├── AgentRuns
                     └── Review

```

## 18. API

Ejemplos:

POST /api/exams

GET /api/exams/:id

PUT /api/exams/:id

POST /api/exams/:id/publish

POST /api/exams/:id/start

POST /api/exams/:id/submit

POST /api/proctoring/events

GET /api/proctoring/sessions/:id

GET /api/proctoring/sessions/:id/events

POST /api/proctoring/sessions/:id/review

## 19. Stack tecnológico

Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

Backend

- Next.js API / Route Handlers

Database

- PostgreSQL
- Prisma

Authentication

- Auth.js o solución equivalente

Testing

- Vitest
- React Testing Library
- Playwright

Infraestructura

- Docker
- Docker Compose

IA

Crear una abstracción:

```
interface AIProvider {
  generate(input: AIInput): Promise<AIResult>;
}
```

Esto permitirá cambiar entre diferentes proveedores de modelos.

## 20. Privacidad y seguridad

Este módulo debe diseñarse desde el inicio.

Principios:

- consentimiento;
- minimización de datos;
- acceso basado en roles;
- cifrado;
- auditoría;
- retención configurable;
- eliminación automática;
- procesamiento local cuando sea posible.

Configuración:

Proctoring Evidence Retention

7 days

30 days

90 days

Custom

No crear perfiles biométricos.

No implementar reconocimiento facial.

No almacenar video/audio indefinidamente.

Cuando sea técnicamente posible, procesar señales en el navegador y enviar solamente eventos y metadatos.

## 21. Observabilidad

Registrar:

- ejecuciones de agentes;
- latencia;
- errores;
- modelo utilizado;
- consumo de tokens;
- llamadas a herramientas;
- eventos detectados.

Métricas:

Total sessions

Total events

Review signals

Average agent latency

Agent errors

Manual review rate

## 22. Modo de simulación

Una de las características más importantes para el portafolio será:

Proctoring Simulation

Debe permitir generar eventos artificiales:

Mouse inactivity

Tab switch

Fullscreen exit

Face unavailable

Audio detected

Multiple faces

Connection lost

Así se podrá demostrar todo el sistema sin necesidad de utilizar una cámara real.

## 23. Arquitectura de orquestación

El sistema puede evolucionar hasta convertirse en un verdadero orquestador:

```
                    EXAM SESSION
                         │
                         ▼
                 EVENT ORCHESTRATOR
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
```

   Activity Agent   Vision Agent     Audio Agent

```
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                    Rule Engine
                         │
                         ▼
                    Risk Agent
                         │
                         ▼
                 Human Review
```

Cada agente tiene una responsabilidad específica.

Esto evita crear un único "superprompt" que haga todo.

## 24. Flujo completo

Administrador crea institución

```
             ↓
```

Administrador crea usuarios

```
             ↓
```

Docente crea curso

```
             ↓
```

Docente crea examen

```
             ↓
```

Docente publica examen

```
             ↓
```

Estudiante inicia sesión

```
             ↓
```

Compatibility Check

```
             ↓
```

Consentimiento

```
             ↓
```

Proctoring Session

```
             ↓
```

Comienza examen

```
             ↓
```

Eventos → Event Stream

```
             ↓
```

Agents + Rule Engine

```
             ↓
```

Risk Signals

```
             ↓
```

Finaliza examen

```
             ↓
```

Docente revisa

```
             ↓
```

Resultados

## 25. Roadmap

Fase 0 — Arquitectura

- arquitectura;
- base de datos;
- componentes;
- seguridad;
- privacidad;
- interfaces.

Fase 1 — Plataforma base

- Next.js;
- TypeScript;
- PostgreSQL;
- Prisma;
- Auth;
- RBAC;
- dashboards.

Fase 2 — Exámenes

- cursos;
- estudiantes;
- docentes;
- constructor;
- preguntas;
- banco.

Fase 3 — Examen del estudiante

- timer;
- respuestas;
- autosave;
- recuperación;
- resultados.

Fase 4 — Proctoring básico

- Activity Monitor;
- Focus Monitor;
- fullscreen;
- event system.

Fase 5 — Cámara y audio

- cámara;
- audio;
- abstracción de computer vision;
- eventos.

Fase 6 — Agentes IA

- Agent abstraction;
- Risk Agent;
- Rule Engine;
- explicaciones;
- orchestration.

Fase 7 — Revisión

- timeline;
- evidencia;
- revisión docente;
- auditoría.

Fase 8 — Producción

- Docker;
- tests;
- observabilidad;
- documentación;
- hardening;
- simulador.

## 26. Demo ideal para una entrevista

La demostración debería comenzar con:

"Voy a crear un examen de matemáticas."

El docente crea el examen.

Después:

"Ahora voy a entrar como estudiante."

Comienza el examen.

Durante la sesión se generan eventos.

El dashboard muestra:

Session active

Events:

2 focus changes

1 low activity event

1 fullscreen exit

Luego aparece:

Review recommended

Se abre la sesión.

El entrevistador puede ver:

09:12:44 Window lost focus

09:20:12 Low interaction

09:25:42 Face unavailable

Finalmente:

"La IA no decide que el estudiante hizo trampa. Lo que hace es convertir señales dispersas en información estructurada para que un humano pueda revisarlas."

Esta explicación es una parte importante del valor técnico del proyecto.

## 27. Prompt maestro para Claude Code

Utilizar el siguiente prompt como punto de partida:

PROMPT

Quiero que construyas una aplicación web full-stack llamada ExamGuard AI.

Es una plataforma de exámenes online para colegios y universidades.

Debe existir:

- Administrador/Rector
- Docente
- Estudiante

El docente puede crear y publicar exámenes.

El estudiante puede realizarlos desde el navegador.

La plataforma tendrá un sistema de supervisión asistida por IA.

La IA debe detectar señales potencialmente relevantes durante la sesión:

- cambios de pestaña;
- pérdida de foco;
- salida de fullscreen;
- inactividad;
- ausencia del rostro;
- múltiples rostros;
- actividad de audio;
- desconexiones.

IMPORTANTE:

La IA no debe declarar automáticamente que un estudiante hizo trampa.

Debe producir:

- eventos;
- señales;
- niveles de severidad;
- confianza;
- explicaciones factuales;
- recomendaciones de revisión.

La decisión final siempre corresponde a un humano autorizado.

Stack

Utiliza:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Prisma
- Auth.js o equivalente
- Docker
- Vitest
- React Testing Library
- Playwright

Arquitectura

Crear módulos separados:

Authentication

RBAC

Exam Engine

Question Bank

Exam Session

Proctoring SDK

Event Processor

Rule Engine

AI Agents

Review System

Audit System

Analytics

No crear una aplicación monolítica desordenada.

Agentes

Crear:

ActivityAgent

FocusAgent

VisionAgent

AudioAgent

RiskAgent

Todos deben implementar una interfaz común.

Por ejemplo:

```
interface Agent {
  name: string;
  analyze(
    context: AgentContext
```

  ): Promise<AgentResult>;

```
}

```

Event model

Crear:

```
interface ProctoringEvent {
  id: string;
  sessionId: string;
  type: string;
  timestamp: Date;
  severity: "low" | "medium" | "high";
  metadata: Record<string, unknown>;
}

```

Risk model

Crear:

```
interface RiskSignal {
  id: string;
  sessionId: string;
  type: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  explanation: string;
}
```

La propiedad explanation debe describir hechos observables.

Evitar afirmaciones sobre intención.

Proctoring

Implementar primero:

- mouse activity;
- keyboard activity;
- tab visibility;
- window focus;
- fullscreen;
- connection status.

Después crear abstracciones para:

- camera;
- audio;
- computer vision.

Cámara

Cuando exista consentimiento:

detectar señales técnicas como:

- face unavailable;
- multiple faces;
- face outside frame.

No utilizar:

- reconocimiento facial;
- identificación biométrica;
- identificación de personas;
- análisis de emociones;
- inferencias de intención.

Audio

Detectar únicamente actividad técnica relevante.

No identificar voces.

No intentar identificar personas.

No afirmar automáticamente que hablar significa hacer trampa.

Rule Engine

Debe ser independiente del LLM.

Ejemplo:

LOW_ACTIVITY > 300s

→ LOW_ACTIVITY signal

WINDOW_BLUR > 3

→ FOCUS signal

MULTIPLE_FACES

→ VISION signal

Después combinar señales para determinar:

REVIEW_RECOMMENDED

No convertirlo en:

CHEATING_CONFIRMED

Dashboard

Crear dashboards específicos para:

- admin;
- docente;
- estudiante.

El docente debe poder:

- crear examen;
- editar;
- publicar;
- revisar resultados;
- revisar sesiones;
- revisar eventos.

Student exam

Implementar:

- timer;
- autosave;
- recuperación;
- navegación;
- progreso;
- submit;
- manejo de reconexión.

Review

Crear una timeline:

09:01 Exam started

09:12 Window blur

09:20 Low activity

09:25 Face unavailable

09:31 Audio activity

09:45 Exam completed

El docente puede revisar y agregar observaciones.

Privacy

Implementar:

- consentimiento;
- RBAC;
- audit logs;
- retención configurable;
- eliminación;
- minimización;
- acceso restringido.

No guardar datos audiovisuales indefinidamente.

Demo

Crear:

Proctoring Simulation

Debe poder generar:

- tab switch;
- low activity;
- fullscreen exit;
- face unavailable;
- audio;
- multiple faces;
- connection lost.

Calidad

Quiero código profesional.

Utiliza:

- TypeScript strict;
- validación;
- manejo de errores;
- logging;
- tests;
- componentes reutilizables;
- servicios desacoplados;
- separación de responsabilidades.

No crear archivos gigantes.

No colocar lógica de negocio compleja dentro de componentes React.

Proceso

NO empieces escribiendo todo el código.

Primero analiza el proyecto.

Después presenta:

- arquitectura;
- estructura de carpetas;
- esquema Prisma;
- componentes;
- interfaces;
- flujo de autenticación;
- flujo del examen;
- arquitectura de agentes;
- estrategia de privacidad;
- riesgos técnicos;
- roadmap.

Después comienza con Fase 1.

Al terminar cada fase:

- ejecutar tests;
- ejecutar TypeScript;
- ejecutar lint;
- corregir errores;
- actualizar documentación.

No avances si existen errores importantes.

## 28. Estructura de carpetas propuesta

examguard-ai/

```
│
├── app/
│   ├── (auth)/
│   ├── admin/
│   ├── teacher/
│   ├── student/
│   ├── exam/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── exams/
│   ├── questions/
│   ├── proctoring/
│   └── charts/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── exams/
│   ├── proctoring/
│   ├── agents/
│   ├── rules/
│   └── audit/
│
├── agents/
│   ├── activity/
│   ├── focus/
│   ├── vision/
│   ├── audio/
│   └── risk/
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── public/
│
├── docker/
│
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md

```

## 29. Resultado final esperado

El proyecto terminado debe poder demostrar:

Full Stack

```
     +
```

AI Agents

```
     +
```

Agent Orchestration

```
     +
```

Computer Vision

```
     +
```

Audio Processing

```
     +
```

Event Driven Architecture

```
     +
```

Human-in-the-loop

```
     +
```

Security

```
     +
```

Privacy

```
     +
```

Observability

El objetivo no es únicamente construir una plataforma de exámenes.

El objetivo es demostrar la capacidad de diseñar y construir un sistema de IA complejo, modular y orientado a producción.

## 30. Posible evolución futura

Una segunda versión podría incorporar:

- generación automática de preguntas;
- generación de diferentes versiones del examen;
- adaptación de dificultad;
- análisis de resultados;
- generación de retroalimentación;
- detección de preguntas problemáticas;
- análisis de rendimiento por tema;
- RAG sobre material educativo;
- asistente para docentes;
- generación automática de rúbricas;
- integración con LMS;
- integración con Google Classroom;
- integración con Moodle.

La arquitectura inicial debe permitir añadir estas capacidades sin tener que reconstruir completamente el sistema.

## 31. Mensaje principal del proyecto

ExamGuard AI no pretende reemplazar al docente.

Su propósito es proporcionar herramientas para:

crear, administrar, supervisar y revisar evaluaciones online utilizando automatización e inteligencia artificial, manteniendo al humano responsable de las decisiones importantes.

Esto debe reflejarse tanto en la interfaz como en la arquitectura y documentación del proyecto.
