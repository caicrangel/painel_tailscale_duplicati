import { describe, expect, it } from "vitest";
import {
  escaparHtml,
  formatarMensagemAlerta,
  formatarRecuperacao,
  formatarTeste,
} from "@/lib/alerts/telegram";
import { explicacaoDeRecuperacao } from "@/lib/alerts/engine";
import { larguraVisual } from "@/lib/alerts/formato";

const ABERTO = new Date("2026-09-22T22:00:00Z");

describe("escaparHtml", () => {
  it("neutraliza marcação que quebraria o parse_mode HTML", () => {
    expect(escaparHtml("C:\\<pasta> & cia")).toBe("C:\\&lt;pasta&gt; &amp; cia");
  });

  it("nome de arquivo com < vindo do Duplicati não quebra a mensagem", () => {
    const msg = formatarMensagemAlerta({
      severity: "CRITICAL",
      title: "Erro em <script>",
      message: "falha em C:\\temp\\<arquivo>",
    }).html;
    expect(msg).not.toContain("<script>");
    expect(msg).toContain("&lt;script&gt;");
  });
});

describe("formatarMensagemAlerta", () => {
  it("usa o emoji da severidade e destaca o título", () => {
    const msg = formatarMensagemAlerta({
      severity: "CRITICAL",
      title: "Backup atrasado",
      message: "O job não rodou.",
    }).html;
    expect(msg.startsWith("<b>🔴 Backup atrasado</b>")).toBe(true);
  });

  it("identifica o incidente no bloco monoespaçado", () => {
    const msg = formatarMensagemAlerta({
      severity: "WARNING",
      type: "MACHINE_OFFLINE",
      title: "Máquina offline",
      message: "Sem contato há 5h.",
      clientName: "Contabilidade Modelo",
      machineName: "srv-fiscal-01",
      abertoEm: ABERTO,
      url: "http://painel.tailnet.ts.net:3000/alertas",
    }).html;
    expect(msg).toContain("<pre>");
    expect(msg).toContain("Máquina offline");
    expect(msg).toContain("Contabilidade Modelo");
    expect(msg).toContain("srv-fiscal-01");
    expect(msg).toContain("/alertas");
  });

  it("a frase longa fica FORA do pre — dentro dele o Telegram não quebra linha", () => {
    const msg = formatarMensagemAlerta({
      severity: "CRITICAL",
      title: "T",
      message: "Uma frase bem longa que jamais caberia na largura de um celular sem rolar.",
    }).html;
    const depoisDoPre = msg.slice(msg.indexOf("</pre>"));
    expect(depoisDoPre).toContain("Uma frase bem longa");
  });

  it("nome de máquina longo quebra em vez de alargar o bloco", () => {
    const msg = formatarMensagemAlerta({
      severity: "CRITICAL",
      title: "T",
      message: "m",
      machineName: "cliente-saolucas.tail3a6628.ts.net",
    }).html;
    const pre = msg.slice(msg.indexOf("<pre>"), msg.indexOf("</pre>"));
    for (const linha of pre.split("\n")) {
      expect(larguraVisual(linha)).toBeLessThanOrEqual(44);
    }
  });
});

describe("formatarRecuperacao", () => {
  it("abre com resolvido e repete a identificação do incidente", () => {
    const msg = formatarRecuperacao({
      title: "cliente-betania está offline",
      explicacao: explicacaoDeRecuperacao("MACHINE_OFFLINE"),
      type: "MACHINE_OFFLINE",
      clientName: "Betânia",
      abertoEm: ABERTO,
      fechadoEm: new Date("2026-09-23T01:00:00Z"),
    }).html;
    expect(msg.startsWith("<b>✅ Resolvido — ")).toBe(true);
    expect(msg).toContain("Betânia");
    expect(msg).toContain("voltou a se comunicar");
  });
});

describe("explicacaoDeRecuperacao", () => {
  it.each([
    ["MACHINE_OFFLINE", "voltou a se comunicar"],
    ["BACKUP_LATE", "voltou a reportar"],
    ["BACKUP_FAILED", "sem erro"],
    ["MOUNT_FAILED", "voltaram a responder"],
    ["MOUNT_LATE", "voltou a chegar"],
  ] as const)("%s explica o que se resolveu", (type, trecho) => {
    expect(explicacaoDeRecuperacao(type)).toContain(trecho);
  });

  it("não repete o título: ele já vem no cabeçalho da mensagem", () => {
    expect(explicacaoDeRecuperacao("MACHINE_OFFLINE")).not.toContain("Resolvido");
  });
});

describe("formatarTeste", () => {
  it("segue o mesmo formato dos demais modelos", () => {
    const msg = formatarTeste(ABERTO);
    expect(msg.html).toContain("<b>🔔 Teste de integração</b>");
    expect(msg.html).toContain("<pre>");
    expect(msg.html).toContain("configurado corretamente");
  });
});

describe("larguraVisual", () => {
  it("conta como duas colunas o símbolo promovido a emoji pelo seletor de variação", () => {
    // U+25B6 sozinho é estreito; com FE0F vira ▶️ e ocupa duas colunas.
    // Medir errado desalinhava o cabeçalho "▶️ EXECUÇÕES" do resumo.
    expect(larguraVisual("\u25B6")).toBe(1);
    expect(larguraVisual("\u25B6\uFE0F")).toBe(2);
  });

  it("emoji de painel ocupa duas colunas apesar de três unidades UTF-16", () => {
    expect("🖥️".length).toBe(3);
    expect(larguraVisual("🖥️")).toBe(2);
  });
});

describe("régua comum", () => {
  it("nenhum modelo passa de 44 colunas dentro do <pre>", () => {
    const larguraDoPre = (html: string) => {
      const pre = html.slice(html.indexOf("<pre>") + 5, html.indexOf("</pre>"));
      return Math.max(
        ...pre
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .split("\n")
          .map(larguraVisual),
      );
    };

    const alerta = formatarMensagemAlerta({
      severity: "CRITICAL",
      type: "MOUNT_FAILED",
      title: "t",
      message: "m",
      clientName: "Cidade BH",
      machineName: "cliente-cidadebh.tail3a6628.ts.net",
      abertoEm: ABERTO,
    }).html;
    const recuperacao = formatarRecuperacao({
      title: "t",
      explicacao: "e",
      type: "MACHINE_OFFLINE",
      machineName: "cliente-saolucas.tail3a6628.ts.net",
      abertoEm: ABERTO,
      fechadoEm: ABERTO,
    }).html;

    expect(larguraDoPre(alerta)).toBeLessThanOrEqual(44);
    expect(larguraDoPre(recuperacao)).toBeLessThanOrEqual(44);
    expect(larguraDoPre(formatarTeste(ABERTO).html)).toBeLessThanOrEqual(44);
  });
});
