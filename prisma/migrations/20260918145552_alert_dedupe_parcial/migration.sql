-- Garante no nível do banco que existe no máximo UM alerta aberto por dedupeKey.
-- A deduplicação não pode depender de a lógica da aplicação estar correta:
-- duas execuções simultâneas do worker precisam colidir aqui, não no Telegram.
-- Prisma não expressa índice parcial no schema, por isso esta migration é SQL cru.
CREATE UNIQUE INDEX "alerts_dedupe_key_open_unique"
  ON "alerts" ("dedupeKey")
  WHERE "closedAt" IS NULL;
