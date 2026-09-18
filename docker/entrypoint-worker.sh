#!/bin/sh
set -e
# O app é quem aplica as migrations. O worker espera o schema existir.
echo "[worker] aguardando o banco estar migrado..."
until ./node_modules/.bin/prisma migrate status >/dev/null 2>&1; do
  sleep 3
done
echo "[worker] banco pronto, iniciando crons"
exec ./node_modules/.bin/tsx worker/index.ts
