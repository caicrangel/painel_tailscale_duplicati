import { describe, expect, it } from "vitest";
import { escaparHtml, formatarMensagemAlerta } from "@/lib/alerts/telegram";
import { mensagemDeRecuperacao } from "@/lib/alerts/engine";

describe("escaparHtml", () => {
  it("neutraliza marcação que quebraria o parse_mode HTML", () => {
    expect(escaparHtml("C:\\<pasta> & cia")).toBe("C:\\&lt;pasta&gt; &amp; cia");
  });

  it("nome de arquivo com < vindo do Duplicati não quebra a mensagem", () => {
    const msg = formatarMensagemAlerta({
      severity: "CRITICAL",
      title: "Erro em <script>",
      message: "falha em C:\\temp\\<arquivo>",
    });
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
    });
    expect(msg.startsWith("🔴")).toBe(true);
    expect(msg).toContain("<b>Backup atrasado</b>");
  });

  it("inclui cliente e link quando informados", () => {
    const msg = formatarMensagemAlerta({
      severity: "WARNING",
      title: "Máquina offline",
      message: "Sem contato há 5h.",
      clientName: "Contabilidade Modelo",
      url: "http://painel.tailnet.ts.net:3000/alertas",
    });
    expect(msg).toContain("Contabilidade Modelo");
    expect(msg).toContain("/alertas");
  });
});

describe("mensagemDeRecuperacao", () => {
  it.each([
    ["MACHINE_OFFLINE", "voltou a se comunicar"],
    ["BACKUP_LATE", "voltou a reportar"],
    ["BACKUP_FAILED", "sem erro"],
  ] as const)("%s explica o que se resolveu", (type, trecho) => {
    const msg = mensagemDeRecuperacao(
      { id: "a", dedupeKey: "k", type, relatedJobIds: [] },
      "Backup X",
    );
    expect(msg).toContain("✅");
    expect(msg).toContain(trecho);
  });
});
