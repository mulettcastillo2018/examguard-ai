#!/bin/sh
# Aplica las migraciones pendientes (RUN_MIGRATIONS=0 lo omite, p. ej. con varias réplicas)
# y arranca el servidor de Next.js.
set -e
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  node node_modules/prisma/build/index.js migrate deploy
fi
exec node server.js
