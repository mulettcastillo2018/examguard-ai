@AGENTS.md

# ExamGuard AI — guía para trabajar en este repositorio

- **Principio que no se negocia:** detección → interpretación → decisión humana. El sistema nunca afirma que alguien hizo trampa; solo produce eventos, señales con explicación factual (citando eventos) y `REVIEW_RECOMMENDED`. Nada de reconocimiento facial, biometría, emociones ni intenciones.
- **Documentación:** `docs/ANALISIS.md` (arquitectura, modelo, roadmap por fases, decisiones de producto) y `docs/DECISIONES.md` (decisiones técnicas y restricciones del entorno). Actualízalas al cerrar cada fase.
- **Capas:** `src/app` (rutas delgadas) → `src/modules/<dominio>` (lógica, sin React; verifican permisos con `assertCan`/`requireActor` y filtran por `institutionId`) → `src/lib`. Ningún texto de interfaz escrito en componentes: todo va en `messages/es.json`.
- **Al cerrar cada fase:** `npm run typecheck`, `npm test`, `npm run test:integration` (con base de datos), `npm run build`; corregir errores y actualizar la documentación antes de avanzar.
- **Entorno con proxy corporativo:** usar `NODE_OPTIONS=--use-system-ca` para npm y `next build`. No agregar dependencias con binarios sin comprobar que se instalan (`npm pack <paquete>`); ESLint y Playwright corren solo en CI.
- **Migraciones nuevas:** con la base ya al día, `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` y guardar el SQL en `prisma/migrations/<fecha>_<nombre>/migration.sql`; luego `npm run db:migrate` y `npm run db:check`. **Nunca** pases `DATABASE_URL` ni `DIRECT_URL` como `--shadow-database-url`: Prisma vacía la base espejo antes de usarla.
