#!/bin/sh
set -e
# As migrations são aplicadas pelo serviço "migrate" do compose, que usa a
# imagem do worker (node_modules completo, com o CLI do Prisma). O app
# standalone carrega só o necessário para servir.
echo "[app] subindo Next na :3000"
exec node server.js
