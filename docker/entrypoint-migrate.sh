#!/bin/sh
set -e
echo "[migrate] aplicando migrations..."
./node_modules/.bin/prisma migrate deploy
echo "[migrate] concluído"
