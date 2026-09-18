#!/bin/sh
set -e

# Permite rodar um comando pontual no container (seed, prisma studio, scripts):
#   docker compose run --rm worker npm run db:seed
# Sem argumentos, sobe os crons normalmente.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo "[worker] aguardando as migrations serem aplicadas..."
until ./node_modules/.bin/prisma migrate status >/dev/null 2>&1; do
  sleep 3
done

echo "[worker] schema pronto, iniciando crons"
exec ./node_modules/.bin/tsx worker/index.ts
