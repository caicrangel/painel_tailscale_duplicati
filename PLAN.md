# PLAN.md — Painel de monitoramento (Tailscale + Duplicati)

Fase 1 (MVP). Documento de arquitetura e plano de implementação.
Status: **aguardando aprovação** — nenhuma linha de código de aplicação foi escrita ainda.

---

## 1. Decisões fechadas

Respostas dadas na rodada de perguntas, já incorporadas ao desenho:

| Tema | Decisão |
|---|---|
| Frequência esperada do job | Intervalo simples em minutos + tolerância em minutos (sem cron na Fase 1) |
| Fila / cache | Só PostgreSQL. Sem Redis, sem BullMQ. Rate limit e dedupe em tabela |
| Telegram | Um bot + um chat global. `Client.telegramChatId` existe no schema, fica nulo |
| Vínculo device ↔ relatório | Auto-vínculo por hostname dentro do mesmo cliente; senão máquina órfã para vincular na UI |
| Máquina offline + job atrasado | Correlacionado: um alerta de máquina offline que lista os jobs afetados |
| Payload bruto | Retenção total na Fase 1. Job de expurgo existe, desligado por padrão |
| Exposição | Next direto na porta 3000 da tailnet, sem TLS. `secure` do cookie controlado por env |
| Papéis | ADMIN (tudo), OPERATOR (CRUD + reconhecer alerta), VIEWER (leitura, sem token de ingestão) |

Premissas que assumi sem perguntar (diga se alguma estiver errada):

- Timezone da aplicação e do banco: `America/Sao_Paulo`. UI em pt-BR.
- Node 22 LTS, Next.js 15, Prisma 6, PostgreSQL 16.
- Um cliente pode ter N máquinas; uma máquina pertence a no máximo um cliente.
- Nenhum agente instalado na máquina do cliente além do Duplicati e do Tailscale já existentes.

---

## 2. Arquitetura

### 2.1 Containers (docker compose)

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│     app      │        │    worker    │        │   postgres   │
│  Next.js 15  │        │ tsx+node-cron│        │      16      │
│  :3000       │        │  sem porta   │        │  :5432 (int) │
└──────┬───────┘        └──────┬───────┘        └──────┬───────┘
       │                       │                       │
       └───────── Prisma ──────┴──────── Prisma ───────┘
```

- `app`: UI + API de ingestão. Único container com porta publicada, e só na
  interface da tailnet (`127.0.0.1` + IP tailscale, nunca `0.0.0.0` no compose de produção).
- `worker`: processo Node separado, mesmo repositório, mesmo `@prisma/client`.
  Três cron jobs (ver 2.4). Sem servidor HTTP — exceto um `/healthz` opcional interno.
- `postgres`: volume nomeado, sem porta publicada em produção (publicada só no compose de dev).

Migrations rodam em um passo explícito (`prisma migrate deploy`) no start do `app`,
com lock — o worker espera o banco estar migrado.

### 2.2 Fluxo A — status das máquinas (pull, a cada 2 min)

1. Worker pega token OAuth: `POST https://api.tailscale.com/api/v2/oauth/token`
   (`grant_type=client_credentials`). Resposta traz `access_token` e `expires_in` (3600s).
   Cache em memória do processo, renovação quando faltar < 5 min para expirar.
   Sem persistência do token em banco.
2. `GET https://api.tailscale.com/api/v2/tailnet/{tailnet}/devices` com `Authorization: Bearer`.
3. Resposta validada com Zod **em modo tolerante**: campos desconhecidos passam,
   device com shape inesperado é logado e pulado sem derrubar o ciclo.
4. Upsert em `Machine` por `tailscaleDeviceId`, gravando hostname, nome, SO, versão do
   cliente, `addresses`, `tags`, `updateAvailable`, `lastSeen`.
5. Status derivado de `lastSeen` com limiares configuráveis (tabela `Setting`, default
   via env): `ONLINE` < 5 min, `IDLE` 5–60 min, `OFFLINE` > 60 min.
   `UNKNOWN` quando nunca vimos `lastSeen`.
6. Device novo entra com `clientId = null` (não atribuído) e aparece numa fila na UI.
7. Transição de status gera evento para o avaliador de alertas (fluxo D).

Timeout de 15s por request, 3 tentativas com backoff. Falha total do ciclo é registrada
em `SyncLog` e **não** apaga o último estado conhecido das máquinas.

### 2.3 Fluxo B — ingestão do Duplicati (push)

`POST /api/ingest/duplicati/[token]`

1. Rate limit por token+IP (tabela `RateLimitHit`, janela deslizante). Default 60 req/min.
2. Lookup do token em `IngestToken` (ativo, não revogado). Comparação em tempo constante.
   Token inválido → 401 genérico, sem vazar se o cliente existe.
3. Leitura do corpo tolerando três formatos, nesta ordem:
   - `application/json` → corpo é o JSON do relatório;
   - `application/x-www-form-urlencoded` → procura o JSON no campo `message`
     (nome default do `--send-http-message-parameter-name`), e cai para o primeiro
     campo cujo valor pareça JSON;
   - corpo texto puro que comece com `{` → tenta `JSON.parse`.
   Nada disso funcionou → grava mesmo assim como payload bruto com `parseError`, responde 202.
4. **Grava sempre** o bruto em `BackupRun.rawPayload` (jsonb) + `rawContentType`.
5. Parsing defensivo (ver 3.1) de todos os campos conhecidos.
6. Resolve máquina (ver 3.2), faz upsert do `BackupJob` por
   `(machineId, duplicatiBackupId)` e insere o `BackupRun`.
7. Recalcula `BackupJob.lastRunAt`, `nextExpectedAt`, `lastParsedResult`, `status`.
8. Enfileira avaliação de alerta gravando na tabela — o envio ao Telegram é do worker,
   não do request. Resposta 202 em milissegundos.

Idempotência: `BackupRun` tem unique em `(backupJobId, beginTime, endTime)` quando as duas
datas existem. Reenvio do mesmo relatório não duplica a execução.

### 2.4 Fluxo C — detecção de atraso (dead man's switch, a cada 5 min)

Para cada `BackupJob` ativo:

```
nextExpectedAt = lastRunAt + expectedIntervalMinutes
deadline       = nextExpectedAt + toleranceMinutes
atrasado       = now > deadline
```

- Job que nunca reportou usa `createdAt` como âncora (com um período de carência
  configurável, default = um intervalo, para não alertar no dia em que foi cadastrado).
- Job `paused` ou de máquina marcada como "em manutenção" não é avaliado.
- Marca `status = LATE` e dispara o avaliador de alertas.
- Job que volta a reportar sai de `LATE` e fecha o alerta (mensagem de recuperação).

### 2.5 Fluxo D — alertas (a cada 1 min, no worker)

Tipos: `BACKUP_FAILED` (ParsedResult Error/Fatal), `BACKUP_WARNING` (opcional, default off),
`BACKUP_LATE`, `MACHINE_OFFLINE`, `MOUNT_FAILED`, `MOUNT_LATE`.

Deduplicação por `dedupeKey` estável, ex.:
`backup_failed:job:<jobId>`, `backup_late:job:<jobId>`, `machine_offline:machine:<machineId>`,
`mount_failed:machine:<machineId>`, `mount_late:machine:<machineId>`.

Índice único parcial (`WHERE closed_at IS NULL`) garante **um alerta aberto por
dedupeKey** no nível do banco — não depende de lógica da aplicação estar certa.
Isso exige uma migration com SQL cru (Prisma não expressa índice parcial).

Correlação máquina/job: antes de abrir `BACKUP_LATE`, o avaliador checa se a máquina do
job está `OFFLINE` além do limite. Se estiver, o atraso vira `relatedJobIds` dentro do
alerta `MACHINE_OFFLINE` e não gera alerta próprio. Quando a máquina volta, os jobs que
continuarem atrasados ganham seus alertas individuais.

Recuperação: ao detectar que a condição sumiu, fecha o alerta (`closedAt`) e manda uma
mensagem de resolução no Telegram, referenciando o incidente.

Envio: fila simples em `AlertNotification` (pending → sent/failed) com retry. Se o Telegram
estiver fora, o alerta continua registrado na UI — a UI é a fonte da verdade, o Telegram é
notificação best-effort.

### 2.6 Fluxo E — verificação de pontos de montagem (push)

O backup do Duplicati sobe o share do cliente por CIFS/NFS. Com o ponto fora do ar ele
termina "com sucesso" sem copiar nada — o pior tipo de falha, porque parece verde.

A checagem e a remontagem continuam na máquina do cliente (`agentes/check-mounts.sh`):
precisam de root e das syscalls de mount, não têm como sair de lá. O que muda é o destino
do relatório — em vez de mandar direto ao Telegram, o script faz `POST` em
`/api/ingest/mounts/[token]`, reusando o token de ingestão do cliente. Uma credencial a
menos espalhada por máquina, e o histórico passa a existir.

O painel guarda o payload bruto antes de interpretar (regra 2), registra cada ponto com
seu veredito (`OK` / `REMOUNTED` / `FAILED`) e abre alerta em dois casos:

- `MOUNT_FAILED` (CRITICAL) — algum ponto não subiu nem após as tentativas do script.
- `MOUNT_LATE` (WARNING) — a verificação parou de chegar dentro de
  `mountCheckIntervalMinutes + mountCheckToleranceMinutes`. Mesmo princípio do backup
  atrasado: o silêncio é o sintoma. Intervalo nulo desliga a vigilância da máquina.

Máquina offline absorve o `MOUNT_LATE`, como já faz com os jobs atrasados — o alerta de
offline já explica a ausência do relatório.

O dashboard mostra o panorama de todos os clientes com os pontos abertos por máquina,
ordenado por urgência (falha, depois verificação parada): é o que permite decidir num
relance qual share de qual cliente está fora.

---

## 3. Lógica crítica (a que vai ter teste)

### 3.1 Parsing do payload do Duplicati

O relatório varia bastante entre versões. Regras:

- Nenhum acesso direto a campo aninhado. Tudo passa por um leitor seguro
  (`getPath(payload, 'Data.BackendStatistics.BytesUploaded')`) que devolve `undefined`.
- Zod com `.optional()`/`.catch()` em **todos** os campos. Schema nunca rejeita o payload
  inteiro — no pior caso devolve um objeto com tudo `null` e o bruto já está salvo.
- `ParsedResult` normalizado para enum `SUCCESS | WARNING | ERROR | FATAL | UNKNOWN`
  (case-insensitive; valor desconhecido vira `UNKNOWN`, nunca erro).
- Datas: `BeginTime`/`EndTime` podem vir ISO 8601 **ou** em formato de cultura do .NET
  (`8/15/2025 3:00:00 AM`). Parser tenta ISO, depois `M/d/yyyy h:mm:ss tt`, depois
  `Date.parse`; falhou tudo → `null` (e a duração fica `null`).
- `Duration` pode vir como `"00:05:32.1234567"` (TimeSpan). Converter para segundos;
  se ausente, derivar de `EndTime - BeginTime`.
- Números podem vir como string. Coerção explícita com guarda de `NaN`.
- `Messages`/`Warnings`/`Errors` podem ser array de string, string única ou ausente.
  Normalizar sempre para array; guardar contagem em coluna e o conteúdo dentro do bruto.
- Chaves de identificação (`Extra.machine-id`, `Extra.backup-id`, `Extra.backup-name`,
  `Extra.machine-name`) são as mais instáveis — todas opcionais, com fallbacks (3.2).

Testes: fixtures de payload real de versões diferentes, payload truncado, campos com tipo
errado, form-urlencoded, corpo vazio, JSON inválido.

### 3.2 Resolução de máquina e job

Ordem de tentativa:
1. `BackupJob` existente por `(machineId resolvido, Extra.backup-id)`.
2. Máquina por `Extra.machine-id` já visto antes (`Machine.duplicatiMachineId`).
3. Máquina do **mesmo cliente do token** cujo `hostname` ou nome Tailscale bata com
   `Extra.machine-name` (case-insensitive, ignorando sufixo de domínio).
4. Nada bateu → cria `Machine` "órfã" (`source = DUPLICATI`, sem `tailscaleDeviceId`)
   vinculada ao cliente do token, marcada como pendente de vínculo na UI.
   Quando eu vinculo pela UI, as execuções já recebidas migram junto.

Sem `Extra.backup-id`? Cai para `Extra.backup-name`; sem nenhum dos dois, usa
`"default"` e a UI mostra o job como "nome não reportado".

### 3.3 Cálculo de atraso

Função pura `computeJobStatus({ lastRunAt, lastParsedResult, expectedIntervalMinutes, toleranceMinutes, now, graceUntil, paused, machineStatus })`
→ `{ status, nextExpectedAt, isLate, lateBy }`. Testável sem banco. Casos de teste:
sem execução alguma, dentro da janela, dentro da tolerância, estourou, job pausado,
máquina offline, mudança de horário de verão (não temos, mas o teste fixa o comportamento).

### 3.4 Dedupe de alertas

Função pura que recebe o estado atual + alertas abertos e devolve as ações
(`open`, `keep`, `close`). Testes: não abre duas vezes, não reabre no ciclo seguinte,
fecha e manda recuperação uma única vez, correlaciona atraso sob máquina offline,
descorrelaciona quando a máquina volta.

### 3.5 Atraso da verificação de montagens

`avaliarAtrasoMontagem` (`lib/mounts/late.ts`): recebe última verificação, intervalo,
tolerância e agora; devolve se está atrasada e há quantos minutos. Função pura, usada
pelo engine de alertas e pelo dashboard — duas cópias da mesma regra divergem com o tempo.

---

## 4. Modelo de dados (Prisma — proposta com ajustes)

Ajustes que proponho em relação ao seu ponto de partida, com o motivo:

1. **`IngestToken` como tabela própria**, em vez de coluna em `Client`. Permite rotação
   sem downtime (token novo ativo enquanto o antigo ainda funciona), revogação individual
   e histórico de uso (`lastUsedAt`, `useCount`).
   *Tradeoff assumido:* o token fica em texto claro no banco, porque a tela de Clientes
   precisa exibi-lo para copiar/colar. É um segredo de baixo valor gerado por nós,
   revogável, que só dá acesso de escrita a um endpoint de ingestão. Se preferir hash +
   "mostrar só na criação", eu troco — mas aí a UI não consegue mais reexibir.
2. **`Machine.clientId` nulável** — devices não atribuídos precisam existir.
3. **`Machine.source`** (`TAILSCALE | DUPLICATI | MANUAL`) — distingue device vindo da API
   de máquina criada pela ingestão.
4. **Campos denormalizados em `BackupJob`** (`lastRunAt`, `lastParsedResult`,
   `nextExpectedAt`, `status`) — o dashboard precisa responder em uma query, sem varrer
   `BackupRun`. Recalculados na ingestão e no worker de atraso.
5. **`Setting`** (key/value tipado) — limiares de online/idle/offline, tolerâncias default,
   switches de alerta. Configurável sem redeploy, com fallback para env.
6. **`SyncLog`** — cada ciclo do worker registra início/fim/erro. Sem isso não dá para
   saber se o monitoramento parou de monitorar (o "quem vigia o vigia").
7. **`RateLimitHit`** — rate limit em Postgres, já que não teremos Redis.
8. **`AlertNotification`** — separa o incidente (Alert) do envio (Telegram), com retry.

```prisma
enum Role            { ADMIN OPERATOR VIEWER }
enum Plan            { ESSENCIAL PROFISSIONAL CORPORATIVO }
enum MachineStatus   { ONLINE IDLE OFFLINE UNKNOWN }
enum MachineSource   { TAILSCALE DUPLICATI MANUAL }
enum ParsedResult    { SUCCESS WARNING ERROR FATAL UNKNOWN }
enum JobStatus       { OK WARNING ERROR LATE UNKNOWN PAUSED }
enum AlertType       { BACKUP_FAILED BACKUP_WARNING BACKUP_LATE MACHINE_OFFLINE }
enum AlertSeverity   { INFO WARNING CRITICAL }
enum NotifyStatus    { PENDING SENT FAILED }

User          id, email @unique, passwordHash (argon2id), name, role, active,
              lastLoginAt, createdAt, updatedAt
Client        id, name, slug @unique, plan, contactName, contactEmail, contactPhone,
              telegramChatId?, notes, active, createdAt, updatedAt
IngestToken   id, clientId, token @unique, label, active, lastUsedAt, useCount,
              revokedAt?, createdAt
Machine       id, clientId?, source, tailscaleDeviceId? @unique, duplicatiMachineId?,
              hostname, displayName, os, osVersion, tailscaleVersion, addresses String[],
              tags String[], updateAvailable, lastSeen?, status, maintenanceUntil?,
              notes, createdAt, updatedAt
              @@index([clientId, status])
BackupJob     id, machineId, name, duplicatiBackupId, destinationHint?,
              expectedIntervalMinutes, toleranceMinutes, active, paused,
              graceUntil?, lastRunAt?, lastParsedResult?, nextExpectedAt?, status,
              createdAt, updatedAt
              @@unique([machineId, duplicatiBackupId])
              @@index([status, nextExpectedAt])
BackupRun     id, backupJobId, parsedResult, beginTime?, endTime?, durationSeconds?,
              sizeOfExaminedFiles?, examinedFiles?, addedFiles?, deletedFiles?,
              modifiedFiles?, bytesUploaded?, bytesDownloaded?, knownFileSize?,
              warningsCount, errorsCount, messagesCount, duplicatiVersion?,
              rawPayload Json, rawContentType?, parseError?, receivedAt
              @@unique([backupJobId, beginTime, endTime])
              @@index([backupJobId, receivedAt desc])
Alert         id, type, severity, dedupeKey, title, message, clientId?, machineId?,
              backupJobId?, backupRunId?, relatedJobIds String[], context Json?,
              openedAt, closedAt?, acknowledgedAt?, acknowledgedById?
              índice único parcial: (dedupeKey) WHERE closed_at IS NULL  ← SQL cru
AlertNotification id, alertId, channel, kind (OPEN|RECOVERY), status, attempts,
              lastError?, sentAt?, createdAt
AuditLog      id, userId?, action, entityType?, entityId?, metadata Json?, ip?,
              userAgent?, createdAt
Setting       key @id, value Json, updatedAt
SyncLog       id, kind (TAILSCALE|LATE_CHECK|ALERTS|NOTIFY), startedAt, finishedAt?,
              ok, itemsProcessed?, error?
RateLimitHit  id, bucket, identifier, windowStart, count  @@unique([bucket, identifier, windowStart])
```

---

## 5. Segurança

- Senha: `argon2id` via `@node-rs/argon2` (binding nativo, sem compilar).
  Parâmetros: m=19456 KiB, t=2, p=1 (recomendação OWASP).
- Auth.js v5 Credentials + estratégia JWT em cookie `httpOnly`, `sameSite=lax`,
  `secure` ligado por env (`AUTH_COOKIE_SECURE`, default `false` porque rodamos HTTP na tailnet).
- Middleware protege tudo, exceto `/login`, `/api/auth/*` e `/api/ingest/*`.
  Autorização por papel é checada de novo em cada Server Action / route handler —
  middleware sozinho não é autorização.
- Rate limit: login 5 tentativas / 15 min por email+IP; ingestão 60 req/min por token+IP.
  Ambos em Postgres, com limpeza periódica.
- Zod em 100% do input externo: formulários, params de rota, payload do Duplicati,
  resposta da API do Tailscale.
- Segredos só por env. `.env` no `.gitignore`, `.env.example` versionado e sem valores reais.
- Nenhuma credencial de cliente (S3, senha do Duplicati) é armazenada.
- `AuditLog` em login, logout, falha de login, CRUD de cliente/máquina/job/usuário,
  rotação e revogação de token.
- VIEWER não recebe o token de ingestão nem no HTML nem na API — filtrado no servidor,
  não escondido no CSS.

---

## 6. Incrementos de implementação

Cada incremento termina com commit(s) pequeno(s), testes verdes onde aplicável, e
instruções de "como testar" no meu retorno pra você.

| # | Entrega | Testes | Como você valida |
|---|---|---|---|
| 0 | Scaffold: Next 15 + TS + Tailwind + shadcn, ESLint/Prettier, Vitest, `.env.example`, compose (app/worker/postgres), Dockerfiles | smoke | `docker compose up` sobe; `/` responde |
| 1 | Schema Prisma completo + migrations (inclui índice parcial em SQL cru) + seed do admin | — | `npx prisma studio` mostra as tabelas; admin criado |
| 2 | Auth.js v5, tela de login, middleware, papéis, rate limit de login, AuditLog | unit: hash, rate limit | login funciona; rota protegida redireciona |
| 3 | CRUD de Clientes (+ tokens de ingestão) e Máquinas | unit: autorização por papel | criar cliente, ver token e snippet do Duplicati |
| 4 | `POST /api/ingest/duplicati/[token]`: parsing defensivo, upsert de job, insert de run | **unit pesado**: fixtures de payload, form-urlencoded, lixo | `curl` com payload de exemplo; run aparece na UI |
| 5 | Worker Tailscale: OAuth com cache, sync de devices, derivação de status, SyncLog | unit: derivação de status, cache de token | devices reais aparecem em Máquinas |
| 6 | Detecção de atraso: função pura + cron de 5 min | **unit pesado**: matriz de casos | job com intervalo curto vira LATE |
| 7 | Alertas + Telegram: dedupe, correlação, recuperação, fila de envio | **unit pesado**: dedupe/correlação | mensagem chega no chat; segundo ciclo não repete |
| 8 | UI: dashboard, tabelas filtráveis, detalhes, histórico com payload bruto, CRUD de usuários | — | as 6 telas da Fase 1 |
| 9 | README completo + guia do Duplicati + hardening final | — | seguir o README do zero |
| 10 | Verificação de pontos de montagem: endpoint de ingestão, alertas `MOUNT_*`, card na máquina, panorama no dashboard, `agentes/check-mounts.sh` | **unit**: parsing do payload, cálculo de atraso | instalar o script numa máquina e ver os pontos no dashboard |

Ordem é a que você pediu. Só de 0 a 2 já dá pra logar; a partir do 4 o sistema já tem valor real.

---

## 7. Riscos e pontos em aberto

- **Formato do payload do Duplicati varia por versão.** Mitigado por: bruto sempre salvo,
  parsing tolerante, coluna `parseError`, e tela que mostra o JSON cru. Quando aparecer
  uma versão que quebra o parse, dá pra corrigir com os dados já em mãos.
- **`--send-http-url` sem retry.** Se o sistema estiver fora no minuto do backup, aquele
  relatório se perde. O dead man's switch cobre isso (o job vai para LATE), mas vale saber:
  a ausência de relatório não distingue "backup não rodou" de "relatório não chegou".
  Na Fase 2, um pull na API do Duplicati resolve de vez.
- **Relógio das máquinas.** `BeginTime`/`EndTime` vêm do cliente. O atraso é calculado por
  `receivedAt` (nosso relógio), não pelo relógio deles. Decisão consciente.
- **Tailnet `-`.** Uso `-` como identificador (a tailnet do OAuth client), conforme sua env.
- **Escopo do OAuth é só `devices:core:read`.** Suficiente para a Fase 1; qualquer ação de
  escrita no Tailscale (tags, ACL) exigiria escopo novo — está fora de escopo.

---

## 8. O que eu preciso de você, e quando

- **Incremento 5:** `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET`,
  `MAGICDNS_DOMAIN`. Coloque no `.env` local — não cole no chat.
- **Incremento 7:** `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` do chat global. Idem.
- **Incremento 4:** se puder, um payload real de relatório do Duplicati de uma das suas
  máquinas (pode anonimizar hostname/caminhos). Vale mais que qualquer fixture que eu invente.
