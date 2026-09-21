# Painel de Monitoramento — Infraestrutura e Backups

Sistema web interno para monitorar, em uma tela, as máquinas de clientes
conectadas à tailnet (Tailscale) e o resultado dos backups do Duplicati.

Responde três perguntas:

1. **Quais máquinas estão online/offline agora?** — pull da API do Tailscale a cada 2 min.
2. **Qual foi o resultado do último backup de cada job?** — push, via `--send-http-url` do Duplicati.
3. **Quais jobs estão ATRASADOS?** — *dead man's switch*: um job que deveria ter rodado
   e não rodou é marcado como atrasado e gera alerta. É o cenário que não se enxerga
   esperando relatório chegar: quando o backup não roda, relatório nenhum chega.

> Arquitetura e decisões: [`PLAN.md`](./PLAN.md) · Convenções de código: [`CLAUDE.md`](./CLAUDE.md)

---

## Stack

Next.js 15 (App Router, RSC) · TypeScript · PostgreSQL 16 + Prisma · Auth.js v5 ·
Tailwind CSS · worker Node (tsx + node-cron) · Docker Compose.

Sem Redis e sem fila externa: o Postgres é a única infra de estado.

---

## 1. Rodar tudo em Docker (é o caminho normal)

Você não precisa de Node, npm nem Postgres instalados na máquina — só Docker com
o plugin Compose. Na sua VM:

```bash
git clone <este-repositorio> /opt/painel
cd /opt/painel
cp .env.example .env
nano .env                # veja o mínimo obrigatório logo abaixo
```

Mínimo obrigatório no `.env` para a stack subir:

```bash
POSTGRES_PASSWORD="uma-senha-forte-do-banco"
AUTH_SECRET="cole-aqui-o-resultado-de-openssl-rand-base64-32"

# Endereço pelo qual as máquinas dos CLIENTES alcançam esta VM.
APP_BASE_URL="http://100.x.y.z:3000"

# Em qual interface publicar a porta 3000. Use o IP 100.x da tailnet desta VM.
# O default (127.0.0.1) só aceita conexão da própria VM — as máquinas dos
# clientes não conseguiriam entregar os relatórios.
BIND_ADDRESS="100.x.y.z"

SEED_ADMIN_EMAIL="voce@suaempresa.com.br"
SEED_ADMIN_PASSWORD="senha-inicial-de-12-ou-mais"
```

Para gerar o `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Descubra o IP da tailnet desta VM com `tailscale ip -4`.

Suba a stack:

```bash
docker compose up -d --build
```

Isso levanta quatro serviços, nesta ordem:

| Serviço | O que faz |
|---|---|
| `postgres` | banco, em volume nomeado |
| `migrate` | aplica as migrations e **sai** (passagem única) |
| `app` | Next.js na porta 3000 |
| `worker` | crons de Tailscale, atraso, alertas e notificação |

`app` e `worker` só iniciam depois que o `migrate` termina com sucesso — não há
corrida entre schema e aplicação.

Crie o admin inicial (uma vez só):

```bash
docker compose run --rm worker npm run db:seed
```

A saída diz o que aconteceu: `[seed] admin criado: <email>`, ou
`[seed] admin <email> já existe`, ou um erro explicando o que faltou. Se não
aparecer `admin criado`, nenhum usuário foi gravado e o login vai recusar.

**Perdeu o acesso ou a senha ficou errada?** O seed não mexe em usuário que já
existe. Para sobrescrever a senha (ou criar um admin do zero):

```bash
docker compose run --rm worker npx tsx scripts/definir-senha-admin.mts seu@email.com 'sua-senha'
```

Use **aspas simples** na senha: `&`, `$` e `!` são interpretados pelo shell.

Acompanhe:

```bash
docker compose ps
docker compose logs -f worker
curl http://127.0.0.1:3000/api/health     # {"ok":true,"db":"up"}
```

Acesse `http://<ip-da-tailnet>:3000` de qualquer máquina da tailnet e entre com o
e-mail e a senha do seed. **Troque a senha no primeiro login e apague
`SEED_ADMIN_PASSWORD` do `.env`.**

### Comandos do dia a dia

```bash
docker compose logs -f worker              # ciclos do worker
docker compose restart worker
docker compose up -d --build               # aplicar uma atualização do código
docker compose down                        # parar (o volume do banco fica)
docker compose exec postgres pg_dump -U painel painel > backup-painel.sql
```

Qualquer comando pontual roda na imagem do worker, que tem o `node_modules`
completo:

```bash
docker compose run --rm worker npm run db:seed
docker compose run --rm worker npx prisma migrate status
docker compose run --rm worker npx tsx scripts/dev-dados-exemplo.mts   # dados fictícios
```

### Ligar Tailscale e Telegram

Não são obrigatórios para subir, mas sem eles o sistema fica pela metade: sem o
Tailscale não há status de máquina, e sem o Telegram os alertas só existem na
tela. Acrescente ao `.env` e rode `docker compose up -d`:

```bash
TAILSCALE_OAUTH_CLIENT_ID="..."
TAILSCALE_OAUTH_CLIENT_SECRET="..."
TAILSCALE_TAILNET="-"
MAGICDNS_DOMAIN="tailXXXX.ts.net"

TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHAT_ID="..."
TELEGRAM_ENABLED="true"
```

O worker avisa no log quando o Tailscale não está configurado, e desativa só
aquela tarefa — o resto continua rodando.

### Exposição na rede

O `BIND_ADDRESS` faz o Docker publicar a porta 3000 apenas no IP informado.
Publique no IP da tailnet, nunca em `0.0.0.0`, e não abra a porta no firewall
externo: o sistema não foi feito para exposição pública.

Rodamos HTTP puro dentro da tailnet, que já é criptografada ponta a ponta. Se você
colocar um proxy com TLS na frente (por exemplo Caddy com `tailscale cert`), ligue
`AUTH_COOKIE_SECURE=true` no `.env`.

---

## 1b. Desenvolvimento sem Docker (opcional)

Só se você for mexer no código. Precisa de Node 22+.

```bash
npm install
cp .env.example .env      # DATABASE_URL apontando para localhost
docker compose -f docker-compose.dev.yml up -d    # só o Postgres
npm run db:migrate
npm run db:seed
npm run dev          # terminal 1 — http://localhost:3000
npm run worker:dev   # terminal 2
```

Dados de exemplo para ver o dashboard com conteúdo (3 clientes, 6 máquinas, 6 jobs
com 14 dias de histórico, incluindo um job atrasado e uma máquina offline):

```bash
npx tsx scripts/dev-dados-exemplo.mts
```

**Nunca rode em produção**: o script apaga e recria os registros de exemplo.

Testes e verificações:

```bash
npm test         # Vitest — parsing do Duplicati, cálculo de atraso, dedupe de alertas
npm run lint
npm run typecheck
```

---

## 2. Referência das variáveis de ambiente

Todas moram no `.env` (modelo completo em `.env.example`). O `.env` **não** é
interpolado pelo shell: cole valores literais, não `$(comandos)`.

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `POSTGRES_PASSWORD` | sim | senha do banco; o compose monta o `DATABASE_URL` a partir dela |
| `AUTH_SECRET` | sim | assina a sessão. Gere com `openssl rand -base64 32` e cole o resultado |
| `APP_BASE_URL` | sim | endereço pelo qual as máquinas dos clientes alcançam o painel; é a base do snippet do Duplicati |
| `BIND_ADDRESS` | sim na VM | IP onde publicar a porta 3000. Default `127.0.0.1` (só a própria VM) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no primeiro uso | admin inicial criado pelo seed. Apague a senha do `.env` depois |
| `TZ` | não | default `America/Sao_Paulo` |
| `AUTH_COOKIE_SECURE` | não | `true` só se houver HTTPS na frente |
| `TAILSCALE_OAUTH_CLIENT_ID` / `_SECRET` | para o status das máquinas | OAuth client com escopo `devices:core:read` |
| `TAILSCALE_TAILNET` | não | default `-` (a tailnet do próprio OAuth client) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `TELEGRAM_ENABLED` | para os alertas | bot e chat global |
| `MACHINE_ONLINE_MAX_MINUTES` / `MACHINE_IDLE_MAX_MINUTES` | não | limiares de online/ociosa/offline (5 e 60) |
| `DEFAULT_JOB_INTERVAL_MINUTES` / `DEFAULT_JOB_TOLERANCE_MINUTES` | não | frequência e tolerância que um job novo recebe (1440 e 360) |
| `ALERT_ON_WARNING` | não | `true` para alertar também em warning (default `false`) |
| `INGEST_RATE_LIMIT_PER_MINUTE` | não | teto de relatórios por token+IP (60) |
| `RAW_PAYLOAD_RETENTION_DAYS` | não | `0` = nunca expurgar o payload bruto (default da Fase 1) |

Limiares também podem ser alterados sem redeploy pela tabela `settings`, que
sobrescreve a env.

---

## 3. Configurar um job do Duplicati para reportar ao painel

### Passo 1 — cadastre o cliente

No painel: **Clientes → Novo cliente**. Um token de ingestão é gerado
automaticamente.

### Passo 2 — copie as opções

Abra o cliente. O bloco **Ingestão do Duplicati** mostra as três opções já com o
token e o endereço corretos. Clique em **Copiar opções**. O conteúdo é este:

```
--send-http-url=http://painel.tailXXXX.ts.net:3000/api/ingest/duplicati/<token>
--send-http-result-output-format=Json
--send-http-level=All
```

### Passo 3 — cole no job do Duplicati

**Pela interface web do Duplicati:**

1. Abra o job → **Edit** → passo 5 (**Options**).
2. Clique em **Advanced options** → **Edit as text**.
3. Cole as três linhas (uma por linha) no fim do que já estiver lá.
4. **Save**.

**Por Docker Compose (aplicando a todos os jobs da máquina):** adicione às
variáveis de ambiente do container do Duplicati:

```yaml
environment:
  DUPLICATI__send_http_url: "http://painel.tailXXXX.ts.net:3000/api/ingest/duplicati/<token>"
  DUPLICATI__send_http_result_output_format: "Json"
  DUPLICATI__send_http_level: "All"
```

**Por linha de comando:**

```bash
duplicati-cli backup s3://bucket/caminho /dados \
  --send-http-url=http://painel.tailXXXX.ts.net:3000/api/ingest/duplicati/<token> \
  --send-http-result-output-format=Json \
  --send-http-level=All
```

### Passo 4 — teste

Da máquina do cliente, confirme que o endereço é alcançável:

```bash
curl http://painel.tailXXXX.ts.net:3000/api/ingest/duplicati/<token>
# {"ok":true,"hint":"Endpoint de ingestão ativo. Envie o relatório via POST."}
```

Rode o backup uma vez (**Run now**). Em segundos o job deve aparecer em
**Jobs de backup** no painel.

### Passo 5 — ajuste a frequência esperada

O job entra com **diário, tolerância de 6 horas**. Abra **Jobs de backup → o job**
e ajuste a frequência e a tolerância para o que esse cliente realmente contratou.
É isso que define quando ele passa a ser considerado atrasado.

Um job recém-descoberto ganha uma carência de um intervalo antes de poder ser
marcado como atrasado — ele não vira alerta no dia em que foi cadastrado.

### Passo 6 — vincule a máquina

Se a máquina já era conhecida do Tailscale e o hostname bateu, o vínculo é
automático. Se não, ela aparece em **Máquinas** como "não atribuída": abra e
escolha o cliente.

---

## 4. Como o atraso é calculado

```
próxima esperada = última execução + frequência
prazo final      = próxima esperada + tolerância
atrasado         = agora > prazo final
```

Detalhes que importam:

- A âncora é o **nosso** relógio (quando o relatório chegou), não o relógio da
  máquina do cliente. Relógio errado no cliente não bagunça a detecção.
- Job **pausado** ou máquina **em manutenção** não geram alerta.
- Se a máquina está offline além do limite, o atraso dos jobs dela entra como
  causa dentro do alerta de máquina offline — um servidor desligado gera **um**
  alerta, não um por job.

**Limitação conhecida e consciente:** o `--send-http-url` do Duplicati não tem
retry. Se o painel estiver fora do ar no minuto exato do backup, aquele relatório
se perde e o job vai para atrasado. Ou seja, a ausência de relatório não distingue
"o backup não rodou" de "o relatório não chegou". O alerta acontece nos dois casos
— que é o comportamento seguro — mas pode ser falso positivo. Resolver de vez exige
consultar a API do Duplicati em cada máquina, previsto para a Fase 2.

---

## 5. Alertas

Disparam por: job com erro/fatal, job atrasado e máquina offline além do limite.

- **Deduplicação:** um alerta por incidente, não um a cada ciclo do worker. A
  garantia é do banco (índice único parcial em `alerts(dedupeKey) WHERE closedAt IS NULL`),
  não da lógica da aplicação.
- **Recuperação:** quando o problema se resolve, o alerta fecha e uma mensagem de
  resolução é enviada.
- **Reconhecer** um alerta não o fecha — só registra que alguém já está olhando.
- O Telegram é *best-effort*: se estiver fora, o incidente continua registrado e
  visível no painel, e a mensagem é reenviada depois. **A UI é a fonte da verdade.**

Para ligar: crie um bot no [@BotFather](https://t.me/BotFather), pegue o chat ID do
grupo interno e preencha `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e
`TELEGRAM_ENABLED=true`.

---

## 6. Papéis

| Papel | Pode |
|---|---|
| **ADMIN** | tudo, inclusive usuários, tokens de ingestão e remoções |
| **OPERATOR** | CRUD de clientes, máquinas e jobs; reconhecer alertas |
| **VIEWER** | somente leitura; **não** recebe o token de ingestão |

Não existe cadastro público. O primeiro admin vem do seed; os demais são criados
em **Usuários**.

---

## 7. Segurança

- Senhas com **argon2id** (m=19456, t=2, p=1 — recomendação OWASP).
- Sessão em cookie `httpOnly`, `sameSite=lax`, `secure` controlado por env.
- Middleware protege tudo, exceto `/login`, `/api/auth/*`, `/api/ingest/*` e `/api/health`.
  A autorização é **revalidada no servidor** em cada página e cada ação — o
  middleware é a primeira camada, não a única.
- Rate limit no login (5 tentativas / 15 min por e-mail+IP) e na ingestão
  (60 req/min por token+IP).
- Todo input externo validado com Zod, inclusive o payload do Duplicati e a
  resposta da API do Tailscale.
- Nenhuma credencial de cliente (S3, senha do Duplicati) é armazenada. Só os
  tokens de ingestão que nós mesmos geramos.
- `.env` está no `.gitignore`; `.env.example` não contém valor real.
- Auditoria de login, falha de login, e de todo CRUD relevante.

---

## 8. Estrutura

```
src/app/                 rotas (App Router) — telas e o webhook de ingestão
src/lib/duplicati/       parsing defensivo do relatório     ← testado
src/lib/jobs/late.ts     cálculo de atraso                  ← testado
src/lib/alerts/engine.ts dedupe e correlação de alertas     ← testado
src/lib/tailscale/       cliente OAuth + devices
src/server/              Server Actions
worker/                  crons (tailscale, atraso, alertas, notificação, manutenção)
prisma/                  schema, migrations e seed
tests/                   Vitest + fixtures de payload do Duplicati
```

---

## 9. Fora de escopo nesta fase

Restore e disparo remoto de backup, gráficos históricos de longo prazo,
acesso do cliente final, app mobile, integração com a API do Duplicati em cada
máquina e portal de faturamento.
