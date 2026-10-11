# syntax=docker/dockerfile:1
# Imagen de producción de ExamGuard AI: Next.js en modo standalone, usuario sin privilegios
# y migraciones al arrancar. Se construye y se prueba en GitHub Actions (job "docker").

FROM node:22-bookworm-slim AS base
# OpenSSL para los motores de Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_OUTPUT=standalone: solo aquí (Vercel y "next start" usan la salida normal).
# El prebuild copia el WASM de MediaPipe a public/mediapipe.
RUN npx prisma generate && NEXT_OUTPUT=standalone npm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Para "prisma migrate deploy" al arrancar: el esquema, las migraciones y la CLI.
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
