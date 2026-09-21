import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/guards";
import { podeAtuarComo } from "@/lib/auth/roles";
import { carregarFaixas } from "@/lib/dashboard/queries";
import { extrairResumo, resumoVazio } from "@/lib/duplicati/resumo";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { HeatStrip, HeatStripLegenda } from "@/components/heat-strip";
import { EmptyState } from "@/components/ui/table";
import { JOB_STATUS, PARSED_RESULT } from "@/lib/utils/status";
import { fmtBytes, fmtDuracao, fmtIntervalo, fmtNumero, fmtRelativo } from "@/lib/utils/format";
import { JobForm } from "./job-form";
import { RunHistory, type LinhaExecucao } from "./run-history";
import { DeleteJobButton } from "./delete-job-button";

export const dynamic = "force-dynamic";

export default async function JobDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const job = await prisma.backupJob.findUnique({
    where: { id },
    include: {
      machine: {
        select: {
          id: true,
          hostname: true,
          displayName: true,
          status: true,
          client: { select: { id: true, name: true } },
        },
      },
      runs: { orderBy: { receivedAt: "desc" }, take: 30 },
    },
  });

  if (!job) notFound();

  const faixas = await carregarFaixas([job.id], 30);
  const ultima = job.runs[0];

  // O resumo sai do payload bruto, que é gravado em toda execução — então
  // vale inclusive para as que chegaram antes desta tela existir.
  const linhas: LinhaExecucao[] = job.runs.map((run) => {
    const resumo = extrairResumo(run.rawPayload);
    return {
      id: run.id,
      receivedAt: run.receivedAt.toISOString(),
      parsedResult: run.parsedResult,
      durationSeconds: run.durationSeconds,
      bytesUploaded: run.bytesUploaded === null ? null : Number(run.bytesUploaded),
      warningsCount: run.warningsCount,
      errorsCount: run.errorsCount,
      parseError: run.parseError,
      rawPayload: run.rawPayload,
      resumo: {
        operacao: resumo.operacao,
        versao: resumo.versao,
        inicio: resumo.inicio?.toISOString() ?? null,
        fim: resumo.fim?.toISOString() ?? null,
        duracaoSegundos: resumo.duracaoSegundos,
        sinalizadores: resumo.sinalizadores,
        // BigInt não atravessa a fronteira servidor → cliente: converte aqui,
        // onde a intenção fica explícita, em vez de um helper genérico.
        secoes: resumo.secoes.map((secao) => ({
          titulo: secao.titulo,
          itens: secao.itens.map((item) => ({
            rotulo: item.rotulo,
            quantidade: item.quantidade,
            bytes: item.bytes === null ? null : Number(item.bytes),
          })),
        })),
        avisos: resumo.avisos,
        erros: resumo.erros,
        mensagensCount: resumo.mensagensCount,
        vazio: resumoVazio(resumo),
      },
    };
  });

  const itemDoResumo = (secao: string, rotulo: string) =>
    linhas[0]?.resumo.secoes.find((s) => s.titulo === secao)?.itens.find((i) => i.rotulo === rotulo);
  const doResumo = (secao: string, rotulo: string) => itemDoResumo(secao, rotulo)?.quantidade ?? null;
  const bytesDoResumo = (secao: string, rotulo: string) => itemDoResumo(secao, rotulo)?.bytes ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.name}
        subtitle={`${job.machine.displayName ?? job.machine.hostname}${
          job.machine.client ? ` · ${job.machine.client.name}` : ""
        }`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={JOB_STATUS[job.status].tone} dot>
              {JOB_STATUS[job.status].label}
            </Badge>
            {podeAtuarComo(user.role, "ADMIN") && (
              <DeleteJobButton
                id={job.id}
                nome={job.name}
                execucoes={job.runs.length}
              />
            )}
          </div>
        }
      />

      {job.status === "LATE" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-late)]/30 bg-[var(--color-late-dim)] px-4 py-3 text-sm text-[var(--color-late)]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Este backup deveria ter rodado e não rodou.</p>
            <p className="mt-0.5 text-[var(--color-muted)]">
              Esperado {fmtRelativo(job.nextExpectedAt)}, último relatório {fmtRelativo(job.lastRunAt)}.
              Confira se a máquina está ligada e se o Duplicati está rodando.
            </p>
          </div>
        </div>
      )}

      {/*
        Os cartões preferem o resumo extraído do payload bruto e só caem para as
        colunas do banco quando ele não tem o número: as duas fontes existem, e
        divergir entre elas na mesma tela confunde mais que informa.
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Último resultado"
          value={ultima ? PARSED_RESULT[ultima.parsedResult].label : "—"}
          tone={ultima ? PARSED_RESULT[ultima.parsedResult].tone : "neutral"}
          hint={ultima ? fmtRelativo(ultima.receivedAt) : "nenhum relatório recebido"}
        />
        <StatTile
          label="Enviado na última execução"
          value={fmtBytes(bytesDoResumo("Destino", "Enviado") ?? ultima?.bytesUploaded ?? null)}
          hint={
            ultima
              ? `${fmtNumero(doResumo("Arquivos", "Adicionados") ?? Number(ultima.addedFiles ?? 0))} arquivo(s) adicionado(s)`
              : undefined
          }
        />
        <StatTile
          label="Duração"
          value={fmtDuracao(linhas[0]?.resumo.duracaoSegundos ?? ultima?.durationSeconds ?? null)}
          hint={
            ultima
              ? `${fmtNumero(doResumo("Arquivos", "Examinados") ?? Number(ultima.examinedFiles ?? 0))} arquivo(s) examinado(s)`
              : undefined
          }
        />
        <StatTile
          label="Próxima esperada"
          value={fmtRelativo(job.nextExpectedAt)}
          tone={job.status === "LATE" ? "late" : "neutral"}
          hint={fmtIntervalo(job.expectedIntervalMinutes)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos 30 dias</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <HeatStrip dias={faixas.get(job.id) ?? []} />
          <HeatStripLegenda />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de execuções</CardTitle>
        </CardHeader>
        {linhas.length === 0 ? (
          <EmptyState title="Nenhuma execução registrada" />
        ) : (
          <RunHistory linhas={linhas} />
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Configuração do monitoramento</CardTitle>
        </CardHeader>
        <CardBody>
          {podeAtuarComo(user.role, "OPERATOR") ? (
            <JobForm job={job} />
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Frequência</dt>
                <dd>{fmtIntervalo(job.expectedIntervalMinutes)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Tolerância</dt>
                <dd>{job.toleranceMinutes} minutos</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Destino</dt>
                <dd>{job.destinationHint ?? "—"}</dd>
              </div>
            </dl>
          )}
          <p className="mt-5 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-muted)]">
            ID no Duplicati: <code className="font-mono">{job.duplicatiBackupId}</code> · Máquina:{" "}
            <Link href={`/maquinas/${job.machine.id}`} className="text-[var(--color-info)]">
              {job.machine.displayName ?? job.machine.hostname}
            </Link>
          </p>
        </CardBody>
      </Card>

    </div>
  );
}
