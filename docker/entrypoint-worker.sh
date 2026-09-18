#!/bin/sh
set -e
echo "[worker] aguardando as migrations serem aplicadas..."
until ./node_modules/.bin/prisma migrate status >/dev/null 2>&1; do
  sleep 3
done
echo "[worker] schema pronto, iniciando crons"
exec ./node_modules/.bin/tsx worker/index.ts
