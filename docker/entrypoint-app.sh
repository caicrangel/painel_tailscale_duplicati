#!/bin/sh
set -e
echo "[app] aplicando migrations..."
./node_modules/.bin/prisma migrate deploy
echo "[app] migrations ok, subindo Next na :3000"
exec node server.js
