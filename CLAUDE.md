# CLAUDE.md — Convenções do projeto

Painel interno de monitoramento de infraestrutura (Tailscale) e backups (Duplicati).
Leia o `PLAN.md` para arquitetura e modelo de dados. Este arquivo é só convenção.

## Stack

Next.js 15 (App Router, RSC) · TypeScript strict · PostgreSQL 16 + Prisma ·
Auth.js v5 (Credentials) · Tailwind + shadcn/ui · worker Node (tsx + node-cron) ·
Docker Compose · Vitest.

Sem Redis. Sem fila externa. Postgres é a única infra de estado.

## Estrutura

```
src/
  app/                    rotas Next (App Router)
    (auth)/login/
    (dashboard)/          telas autenticadas
    api/ingest/duplicati/[token]/route.ts
  components/ui/          shadcn (gerado, não editar à mão sem motivo)
  components/             componentes do domínio
  lib/
    auth/                 Auth.js, argon2, sessão, guards de papel
    db/                   cliente Prisma (singleton)
    duplicati/            parsing do payload  ← lógica crítica, testada
    tailscale/            cliente OAuth + devices
    alerts/               dedupe, correlação, formatação  ← lógica crítica, testada
    jobs/                 cálculo de atraso  ← lógica crítica, testada
    validation/           schemas Zod compartilhados
  server/                 Server Actions
worker/
  index.ts                registro dos crons
  tasks/                  um arquivo por tarefa
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  fixtures/duplicati/     payloads reais e sintéticos
```

## Regras que não se negocia

1. **Todo input externo passa por Zod.** Formulário, query param, payload do Duplicati,
   resposta da API do Tailscale. Sem exceção.
2. **Parsing do Duplicati é defensivo.** Nunca `payload.Data.ParsedResult` direto.
   Nenhum campo é obrigatório. O payload bruto é salvo antes de qualquer parsing.
3. **Autorização é checada no servidor, em cada ação.** O middleware é a primeira camada,
   não a única. Server Action e route handler revalidam papel.
4. **Segredo só por env.** Nada de valor real em código, em teste ou em `.env.example`.
5. **Lógica crítica é função pura e testada.** Parsing, cálculo de atraso e dedupe de
   alerta não tocam o banco — recebem dados, devolvem decisão. O banco fica na borda.
6. **A UI é a fonte da verdade; o Telegram é best-effort.** Falha de envio nunca
   perde um incidente.
7. **Nada de escrita na API do Tailscale.** O OAuth client tem escopo só de leitura.

## Código

- TypeScript `strict`. `any` só com comentário justificando; prefira `unknown` + Zod.
- Server Components por padrão. `"use client"` só quando precisa de estado/evento.
- Data fetching em RSC direto via Prisma; sem chamar a própria API HTTP internamente.
- Mutations por Server Action, com `revalidatePath`.
- Erro de domínio é tipo de retorno (`{ ok: false, error }`), não exception solta.
- Datas: sempre `Date`/`timestamptz` no banco; formatação para `America/Sao_Paulo`
  só na camada de apresentação.
- Nomes de tabela/coluna em inglês; textos de UI em português.

## Commits

- Mensagem em português, imperativo, minúscula, com escopo:
  `feat(ingest): aceitar payload form-urlencoded do duplicati`
- Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`.
- Commits pequenos e coesos. Um incremento do PLAN.md = vários commits, nunca um só.
- Não commitar `.env`, dump de banco, payload real com dado de cliente.

## Testes

- Vitest. `npm test` roda tudo; `npm run test:watch` no desenvolvimento.
- Obrigatório para: `lib/duplicati`, `lib/jobs`, `lib/alerts`.
- Fixture nova para cada formato de payload que aparecer na vida real.
- Não mockar o Prisma nos testes de lógica pura — a lógica pura não conhece o Prisma.

## Comandos

```bash
npm run dev            # Next em dev
npm run worker:dev     # worker com tsx watch
npm run db:migrate     # prisma migrate dev
npm run db:seed        # cria o admin inicial
npm test               # Vitest
npm run lint           # ESLint
docker compose up -d   # stack completa
```

## Ao trabalhar neste repositório

- Antes de mudar o schema, atualize o `PLAN.md` na mesma mudança.
- Ao terminar um incremento, diga exatamente como testar localmente.
- Não invente requisito que não está no PLAN.md. Se achar que falta algo, fale antes.
