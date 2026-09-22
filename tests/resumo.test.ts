import { describe, expect, it } from "vitest";
import { agoraNoFuso, deveEnviarResumo, montarResumo, type DadosResumo } from "@/lib/alerts/resumo";

function dados(over: Partial<DadosResumo> = {}): DadosResumo {
  return {
    periodoHoras: 24,
    clientes: 3,
    maquinas: { online: 5, idle: 1, offline: 2, desconhecidas: 0 },
    jobs: { ok: 8, warning: 1, erro: 0, atrasados: 0, pausados: 1 },
    execucoes: { sucesso: 9, warning: 1, erro: 0 },
    problemas: [],
    sucessos: [],
    bytesEnviados: 2_465_923_072,
    incluirSucessos: false,
    ...over,
  };
}

describe("montarResumo", () => {
  it("lidera com verde só quando não há erro, atraso, warning nem máquina offline", () => {
    const r = montarResumo(
      dados({
        maquinas: { online: 6, idle: 0, offline: 0, desconhecidas: 0 },
        jobs: { ok: 9, warning: 0, erro: 0, atrasados: 0, pausados: 1 },
      }),
      "21/09/2026",
    );
    expect(r.texto.startsWith("🟢")).toBe(true);
    expect(r.titulo).toBe("🟢 Resumo de backups — 21/09/2026");
  });

  it("lidera com vermelho quando há job com erro ou atrasado", () => {
    expect(montarResumo(dados({ jobs: { ok: 1, warning: 0, erro: 1, atrasados: 0, pausados: 0 } }), "x").texto.startsWith("🔴")).toBe(true);
    expect(montarResumo(dados({ jobs: { ok: 1, warning: 0, erro: 0, atrasados: 2, pausados: 0 } }), "x").texto.startsWith("🔴")).toBe(true);
  });

  it("amarelo para warning ou máquina offline, sem erro", () => {
    const comWarning = montarResumo(
      dados({
        maquinas: { online: 6, idle: 0, offline: 0, desconhecidas: 0 },
        jobs: { ok: 1, warning: 1, erro: 0, atrasados: 0, pausados: 0 },
      }),
      "x",
    );
    expect(comWarning.texto.startsWith("🟡")).toBe(true);

    // Máquina offline sozinha também é amarelo: pode não ter dado atraso ainda,
    // mas é sinal de que vai dar.
    const soOffline = montarResumo(
      dados({
        maquinas: { online: 4, idle: 0, offline: 1, desconhecidas: 0 },
        jobs: { ok: 9, warning: 0, erro: 0, atrasados: 0, pausados: 0 },
      }),
      "x",
    );
    expect(soOffline.texto.startsWith("🟡")).toBe(true);
  });

  it("traz os números de máquinas, jobs e execuções", () => {
    const r = montarResumo(dados(), "x");
    // Régua monoespaçada: rótulo à esquerda, número alinhado à direita.
    expect(r.texto).toMatch(/Online\s+5/);
    expect(r.texto).toMatch(/OK\s+8/);
    expect(r.texto).toMatch(/Sucesso\s+9/);
    expect(r.texto).toContain("2,30 GB");
  });

  it("avisa explicitamente quando não há problema aberto", () => {
    expect(montarResumo(dados(), "x").texto).toContain("Nenhum problema aberto");
  });

  it("lista os problemas abertos com cliente e desde quando", () => {
    const r = montarResumo(
      dados({
        problemas: [{ titulo: "Backup atrasado: ERP", cliente: "Vale Verde", desde: "há 2 d" }],
      }),
      "x",
    );
    expect(r.texto).toContain("PRECISAM DE ATENÇÃO (1)");
    expect(r.texto).toContain("Backup atrasado: ERP — Vale Verde (desde há 2 d)");
  });

  it("só lista sucessos quando pedido", () => {
    const sucessos = [{ job: "Dados Fiscais", maquina: "srv-01", cliente: "Contab" }];
    expect(montarResumo(dados({ sucessos }), "x").texto).not.toContain("RODARAM SEM PROBLEMA");
    expect(
      montarResumo(dados({ sucessos, incluirSucessos: true }), "x").texto,
    ).toContain("Dados Fiscais");
  });

  it("escapa marcação na versão HTML", () => {
    const r = montarResumo(
      dados({ problemas: [{ titulo: "Erro em <script>", cliente: null, desde: "agora" }] }),
      "x",
    );
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("omite os bytes quando não há dado", () => {
    expect(montarResumo(dados({ bytesEnviados: null }), "x").texto).not.toContain("enviado ao destino");
  });
});

describe("deveEnviarResumo", () => {
  const base = { enabled: true, horario: "08:00", ultimoEnvio: null as string | null };

  it("não envia antes do horário", () => {
    expect(
      deveEnviarResumo({ ...base, agoraLocal: { hora: 7, minuto: 59, dia: "2026-09-21" } }),
    ).toBe(false);
  });

  it("envia no horário exato", () => {
    expect(
      deveEnviarResumo({ ...base, agoraLocal: { hora: 8, minuto: 0, dia: "2026-09-21" } }),
    ).toBe(true);
  });

  it("envia atrasado se o worker estava fora no minuto exato", () => {
    expect(
      deveEnviarResumo({ ...base, agoraLocal: { hora: 11, minuto: 30, dia: "2026-09-21" } }),
    ).toBe(true);
  });

  it("não repete no mesmo dia", () => {
    expect(
      deveEnviarResumo({
        ...base,
        ultimoEnvio: "2026-09-21",
        agoraLocal: { hora: 9, minuto: 0, dia: "2026-09-21" },
      }),
    ).toBe(false);
  });

  it("volta a enviar no dia seguinte", () => {
    expect(
      deveEnviarResumo({
        ...base,
        ultimoEnvio: "2026-09-20",
        agoraLocal: { hora: 8, minuto: 1, dia: "2026-09-21" },
      }),
    ).toBe(true);
  });

  it("desligado nunca envia", () => {
    expect(
      deveEnviarResumo({
        ...base,
        enabled: false,
        agoraLocal: { hora: 23, minuto: 0, dia: "2026-09-21" },
      }),
    ).toBe(false);
  });

  it("horário inválido não dispara envio", () => {
    expect(
      deveEnviarResumo({
        ...base,
        horario: "banana",
        agoraLocal: { hora: 23, minuto: 0, dia: "2026-09-21" },
      }),
    ).toBe(false);
  });
});

describe("agoraNoFuso", () => {
  it("converte UTC para o fuso da operação", () => {
    // 2026-09-21T02:30:00Z = 23:30 do dia 20 em São Paulo (UTC-3)
    const r = agoraNoFuso(new Date("2026-09-21T02:30:00Z"), "America/Sao_Paulo");
    expect(r.dia).toBe("2026-09-20");
    expect(r.hora).toBe(23);
    expect(r.minuto).toBe(30);
  });
});
