# Despliegue

La demo pública corre en **Vercel** (aplicación y tarea diaria) con **Neon** (PostgreSQL). También hay una imagen de **Docker** para desplegar en un servidor propio.

| Pieza | Servicio | Plan |
|---|---|---|
| Base de datos | Neon, rama `production` del proyecto, región AWS us-east-2 (Ohio) | Gratis |
| Aplicación | Vercel, funciones en `cle1` (Cleveland, junto a la base) | Hobby |
| Tarea diaria | Vercel Cron, 07:00 UTC (02:00 en Colombia), definida en `vercel.json` | Incluida |

## 1. Base de datos (Neon)

1. En el proyecto de Neon, usa la rama `production` (la de desarrollo queda para pruebas).
2. Copia las dos cadenas de *Connect* (no las pegues en chats ni en el repositorio):
   - `DATABASE_URL`: con *Connection pooling* activado (servidor con `-pooler`), agregando `&pgbouncer=true&connect_timeout=15`.
   - `DIRECT_URL`: sin pooling (el mismo servidor sin `-pooler`), con `&connect_timeout=15`. La usan las migraciones.
3. Aplica las migraciones y crea los datos de demostración, con la contraseña pública de la demo:
   ```bash
   DATABASE_URL="…" DIRECT_URL="…" npx prisma migrate deploy
   DATABASE_URL="…" DIRECT_URL="…" SEED_PASSWORD="<contraseña de la demo>" npm run db:seed
   ```

## 2. Aplicación (Vercel)

1. *Add New → Project*, elige el repositorio `examguard-ai` y nómbralo `examguard-mulett` (queda en `https://examguard-mulett.vercel.app`).
2. Variables de entorno (*Settings → Environment Variables*, entorno *Production*):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La de Neon con pooling |
| `DIRECT_URL` | La de Neon sin pooling |
| `BETTER_AUTH_SECRET` | Aleatorio de 32 o más caracteres: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `BETTER_AUTH_URL` | `https://examguard-mulett.vercel.app` |
| `CRON_SECRET` | Otro aleatorio (Vercel lo envía a la tarea diaria) |
| `DEMO_MODE` | `1` |
| `DEMO_PASSWORD` | La misma `SEED_PASSWORD` del paso 1. Es pública (aparece al iniciar sesión): nunca la de una cuenta real |
| `ANTHROPIC_API_KEY` | Opcional. Sin ella, el resumen para quien revisa usa la plantilla factual |

3. *Deploy*. El build copia el WASM de la detección de rostros (`prebuild`) y Vercel registra la tarea diaria de `vercel.json`.

## 3. Comprobar

- `https://examguard-mulett.vercel.app/api/health` responde `{"ok":true,"db":true}`.
- `/login` muestra las cuentas de demostración y entra con un clic.
- Cámara y micrófono funcionan solo con HTTPS (el dominio de Vercel lo tiene).
- Las cabeceras incluyen `Content-Security-Policy` con nonce y `Permissions-Policy: camera=(self), microphone=(self)`.

## Modo demostración

Con `DEMO_MODE=1` y `DEMO_PASSWORD`:

- El inicio de sesión ofrece las cuentas de ejemplo (rectora, docente, estudiante y una estudiante menor con autorización del acudiente).
- Las cuentas de ejemplo no cambian de contraseña ni de estado (así nadie deja la demo inservible); las cuentas que cree quien visita sí.
- La tarea diaria vuelve a crear la institución de demostración desde cero.

## Docker (servidor propio)

```bash
docker build -t examguard-ai .
docker run -d -p 3000:3000 \
  -e DATABASE_URL=… -e DIRECT_URL=… \
  -e BETTER_AUTH_SECRET=… -e BETTER_AUTH_URL=https://tu-dominio \
  examguard-ai
```

El contenedor aplica las migraciones al arrancar (`RUN_MIGRATIONS=0` lo omite), corre como usuario sin privilegios y expone `/api/health` para su verificación de salud. Con `docker compose up --build` se levanta junto a PostgreSQL en local. La tarea diaria se programa con el cron del servidor: `curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/daily`.
