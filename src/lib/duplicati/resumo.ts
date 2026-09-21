import { contarLista, getPath, lerBigInt, lerData, lerDuracao, lerNumero, lerTexto, normalizarLista, normalizarResultado } from "./payload";

/**
 * Resumo legível de uma execução, no espírito do relatório que o Duplicati
 * manda no Telegram: o que foi examinado, adicionado, alterado e enviado.
 *
 * Lê do payload BRUTO em vez de colunas do banco, de propósito:
 *   - o bruto é gravado sempre (regra 2 do CLAUDE.md), então execuções antigas
 *     ganham o resumo retroativamente, sem migration nem backfill;
 *   - campos que o Duplicati acrescentar em versões futuras entram aqui sem
 *     mexer no schema.
 *
 * Função pura e defensiva: campo ausente vira null e some da tela, nunca zero
 * falso nem exceção.
 */

export type ItemResumo = {
  rotulo: string;
  /** Contagem (arquivos, pastas, chamadas). */
  quantidade: number | null;
  /** Tamanho em bytes, quando o Duplicati reporta um para este item. */
  bytes: bigint | null;
};

export type SecaoResumo = {
  titulo: string;
  itens: ItemResumo[];
};

export type ResumoExecucao = {
  operacao: string | null;
  resultado: ReturnType<typeof normalizarResultado>;
  versao: string | null;
  inicio: Date | null;
  fim: Date | null;
  duracaoSegundos: number | null;
  /** Flags que só aparecem quando são verdadeiras (backup parcial, interrompido…). */
  sinalizadores: string[];
  secoes: SecaoResumo[];
  avisos: string[];
  erros: string[];
  mensagensCount: number;
};

function item(rotulo: string, quantidade: unknown, bytes?: unknown): ItemResumo {
  return {
    rotulo,
    quantidade: lerNumero(quantidade),
    bytes: bytes === undefined ? null : lerBigInt(bytes),
  };
}

/** Item sem nenhum dado não merece espaço na tela. */
function comDados(itens: ItemResumo[]): ItemResumo[] {
  return itens.filter((i) => i.quantidade !== null || i.bytes !== null);
}

export function extrairResumo(payload: unknown): ResumoExecucao {
  const d = (caminho: string) => getPath(payload, `Data.${caminho}`);
  const b = (caminho: string) => getPath(payload, `Data.BackendStatistics.${caminho}`);

  const sinalizadores: string[] = [];
  if (d("PartialBackup") === true) sinalizadores.push("Backup parcial");
  if (d("Interrupted") === true) sinalizadores.push("Interrompido");
  if (d("Dryrun") === true) sinalizadores.push("Simulação (dry-run)");
  if (b("ReportedQuotaError") === true) sinalizadores.push("Erro de quota no destino");

  const arquivos = comDados([
    item("Adicionados", d("AddedFiles"), d("SizeOfAddedFiles")),
    item("Alterados", d("ModifiedFiles"), d("SizeOfModifiedFiles")),
    item("Excluídos", d("DeletedFiles")),
    item("Abertos", d("OpenedFiles"), d("SizeOfOpenedFiles")),
    item("Examinados", d("ExaminedFiles"), d("SizeOfExaminedFiles")),
  ]);

  const problemas = comDados([
    item("Com erro", d("FilesWithError")),
    item("Grandes demais", d("TooLargeFiles")),
    item("Não processados", d("NotProcessedFiles")),
  ]);

  const pastas = comDados([
    item("Adicionadas", d("AddedFolders")),
    item("Alteradas", d("ModifiedFolders")),
    item("Excluídas", d("DeletedFolders")),
  ]);

  const links = comDados([
    item("Adicionados", d("AddedSymlinks")),
    item("Alterados", d("ModifiedSymlinks")),
    item("Excluídos", d("DeletedSymlinks")),
  ]);

  const destino = comDados([
    item("Enviado", null, b("BytesUploaded")),
    item("Baixado", null, b("BytesDownloaded")),
    item("Arquivos enviados", b("FilesUploaded")),
    item("Arquivos apagados", b("FilesDeleted")),
    item("Chamadas ao destino", b("RemoteCalls")),
    item("Tamanho total no destino", null, b("KnownFileSize")),
    item("Versões guardadas", b("BackupListCount")),
  ]);

  const secoes: SecaoResumo[] = [];
  if (arquivos.length) secoes.push({ titulo: "Arquivos", itens: arquivos });
  if (pastas.length) secoes.push({ titulo: "Pastas", itens: pastas });
  if (links.length) secoes.push({ titulo: "Links simbólicos", itens: links });
  if (problemas.length) secoes.push({ titulo: "Arquivos não incluídos", itens: problemas });
  if (destino.length) secoes.push({ titulo: "Destino", itens: destino });

  const inicio = lerData(d("BeginTime"));
  const fim = lerData(d("EndTime"));
  let duracaoSegundos = lerDuracao(d("Duration"));
  if (duracaoSegundos === null && inicio && fim) {
    const delta = Math.round((fim.getTime() - inicio.getTime()) / 1000);
    duracaoSegundos = delta >= 0 ? delta : null;
  }

  return {
    operacao: lerTexto(d("MainOperation")),
    resultado: normalizarResultado(d("ParsedResult")),
    versao: lerTexto(d("Version")),
    inicio,
    fim,
    duracaoSegundos,
    sinalizadores,
    secoes,
    // As mensagens em si valem mais que a contagem: é o que diz O QUE deu errado.
    avisos: normalizarLista(d("Warnings")).slice(0, 20),
    erros: normalizarLista(d("Errors")).slice(0, 20),
    mensagensCount: contarLista(d("Messages"), d("MessagesActualLength")),
  };
}

/** True quando não há absolutamente nada para mostrar (payload não interpretado). */
export function resumoVazio(resumo: ResumoExecucao): boolean {
  return (
    resumo.secoes.length === 0 &&
    resumo.avisos.length === 0 &&
    resumo.erros.length === 0 &&
    resumo.operacao === null
  );
}
