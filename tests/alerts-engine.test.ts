import { describe, expect, it } from "vitest";
import {
  chaveJobAtrasado,
  chaveJobFalhou,
  chaveMaquinaOffline,
  chaveMontagemRemontada,
  derivarCondicoes,
  explicacaoDeRecuperacao,
  planejarAlertas,
  type AlertaAberto,
  type Condicao,
  type JobSnapshot,
  type MaquinaSnapshot,
} from "@/lib/alerts/engine";

const AGORA = new Date("2026-09-18T12:00:00Z");

function maquina(over: Partial<MaquinaSnapshot> = {}): MaquinaSnapshot {
  return {
    id: "maq-1",
    clientId: "cli-1",
    clientName: "Contabilidade Modelo",
    suporte: false,
    montagem: null,
    hostname: "srv-fiscal-01",
    displayName: null,
    status: "ONLINE",
    lastSeen: new Date(AGORA.getTime() - 60_000),
    maintenanceUntil: null,
    ...over,
  };
}

function job(over: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: "job-1",
    machineId: "maq-1",
    name: "Dados Fiscais",
    status: "OK",
    lastRunAt: new Date(AGORA.getTime() - 3600_000),
    nextExpectedAt: new Date(AGORA.getTime() + 3600_000),
    lateByMinutes: 0,
    errorsCount: 0,
    lastRunId: "run-1",
    ...over,
  };
}

const opcoes = { now: AGORA, offlineAlertMinutes: 60, alertOnWarning: false };

describe("derivarCondicoes — o que vira alerta", () => {
  it("tudo saudável não gera condição nenhuma", () => {
    const c = derivarCondicoes({ maquinas: [maquina()], jobs: [job()], ...opcoes });
    expect(c).toEqual([]);
  });

  it("job com erro vira alerta crítico", () => {
    const c = derivarCondicoes({
      maquinas: [maquina()],
      jobs: [job({ status: "ERROR", errorsCount: 2 })],
      ...opcoes,
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.type).toBe("BACKUP_FAILED");
    expect(c[0]!.severity).toBe("CRITICAL");
    expect(c[0]!.dedupeKey).toBe(chaveJobFalhou("job-1"));
  });

  it("job atrasado com máquina online vira alerta próprio", () => {
    const c = derivarCondicoes({
      maquinas: [maquina()],
      jobs: [job({ status: "LATE", lateByMinutes: 400 })],
      ...opcoes,
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.type).toBe("BACKUP_LATE");
    expect(c[0]!.message).toContain("6h");
  });

  it("job que nunca reportou tem mensagem própria", () => {
    const c = derivarCondicoes({
      maquinas: [maquina()],
      jobs: [job({ status: "LATE", lastRunAt: null, lateByMinutes: 100 })],
      ...opcoes,
    });
    expect(c[0]!.message).toContain("nunca reportou");
  });

  it("warning só alerta quando o switch está ligado", () => {
    const jobs = [job({ status: "WARNING" })];
    expect(derivarCondicoes({ maquinas: [maquina()], jobs, ...opcoes })).toHaveLength(0);
    expect(
      derivarCondicoes({ maquinas: [maquina()], jobs, ...opcoes, alertOnWarning: true }),
    ).toHaveLength(1);
  });
});

describe("derivarCondicoes — máquina offline", () => {
  const offline = maquina({
    status: "OFFLINE",
    lastSeen: new Date(AGORA.getTime() - 5 * 60 * 60_000), // 5h
  });

  it("máquina offline além do limite vira alerta", () => {
    const c = derivarCondicoes({ maquinas: [offline], jobs: [], ...opcoes });
    expect(c).toHaveLength(1);
    expect(c[0]!.type).toBe("MACHINE_OFFLINE");
    expect(c[0]!.dedupeKey).toBe(chaveMaquinaOffline("maq-1"));
    expect(c[0]!.message).toContain("5h");
  });

  it("offline por menos que o limite ainda não alerta", () => {
    const recente = maquina({
      status: "OFFLINE",
      lastSeen: new Date(AGORA.getTime() - 30 * 60_000),
    });
    expect(derivarCondicoes({ maquinas: [recente], jobs: [], ...opcoes })).toHaveLength(0);
  });

  it("máquina em manutenção não alerta, e os jobs dela também não", () => {
    const manutencao = maquina({
      ...offline,
      maintenanceUntil: new Date(AGORA.getTime() + 3600_000),
    });
    const c = derivarCondicoes({
      maquinas: [manutencao],
      jobs: [job({ status: "LATE", lateByMinutes: 500 })],
      ...opcoes,
    });
    expect(c).toEqual([]);
  });

  it("máquina não atribuída a cliente não vira alerta", () => {
    const orfa = maquina({ ...offline, clientId: null, clientName: null });
    expect(derivarCondicoes({ maquinas: [orfa], jobs: [], ...opcoes })).toHaveLength(0);
  });
});

describe("correlação: máquina offline absorve o atraso dos jobs", () => {
  const offline = maquina({
    status: "OFFLINE",
    lastSeen: new Date(AGORA.getTime() - 5 * 60 * 60_000),
  });
  const jobs = [
    job({ id: "job-1", status: "LATE", lateByMinutes: 300 }),
    job({ id: "job-2", name: "Banco de Dados", status: "LATE", lateByMinutes: 300 }),
  ];

  it("gera UM alerta, não três", () => {
    const c = derivarCondicoes({ maquinas: [offline], jobs, ...opcoes });
    expect(c).toHaveLength(1);
    expect(c[0]!.type).toBe("MACHINE_OFFLINE");
  });

  it("os jobs atrasados entram como causa dentro do alerta da máquina", () => {
    const c = derivarCondicoes({ maquinas: [offline], jobs, ...opcoes });
    expect(c[0]!.relatedJobIds).toEqual(["job-1", "job-2"]);
    expect(c[0]!.message).toContain("Dados Fiscais");
    expect(c[0]!.message).toContain("Banco de Dados");
    expect(c[0]!.severity).toBe("CRITICAL");
  });

  it("máquina offline sem job atrasado é só atenção, não crítico", () => {
    const c = derivarCondicoes({ maquinas: [offline], jobs: [], ...opcoes });
    expect(c[0]!.severity).toBe("WARNING");
  });

  it("quando a máquina volta, cada job atrasado ganha seu próprio alerta", () => {
    const c = derivarCondicoes({ maquinas: [maquina()], jobs, ...opcoes });
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.type === "BACKUP_LATE")).toBe(true);
  });

  it("job de OUTRA máquina online não é absorvido", () => {
    const outra = maquina({ id: "maq-2", hostname: "srv-web" });
    const c = derivarCondicoes({
      maquinas: [offline, outra],
      jobs: [...jobs, job({ id: "job-3", machineId: "maq-2", status: "LATE", lateByMinutes: 90 })],
      ...opcoes,
    });
    expect(c.map((x) => x.type).sort()).toEqual(["BACKUP_LATE", "MACHINE_OFFLINE"]);
  });
});

describe("o limiar de alerta independe da classificação de status", () => {
  it("alerta em 15 min mesmo com a máquina ainda classificada como ociosa", () => {
    // 20 min sem contato: com idleMax=60 ela é OCIOSA, não OFFLINE.
    const ociosa = maquina({
      status: "IDLE",
      lastSeen: new Date(AGORA.getTime() - 20 * 60_000),
    });
    const c = derivarCondicoes({
      maquinas: [ociosa],
      jobs: [],
      ...opcoes,
      offlineAlertMinutes: 15,
    });
    expect(c.map((x) => x.type)).toEqual(["MACHINE_OFFLINE"]);
    expect(c[0]!.message).toContain("20 min");
  });

  it("não alerta antes do limiar, mesmo já classificada como offline", () => {
    const offlineRecente = maquina({
      status: "OFFLINE",
      lastSeen: new Date(AGORA.getTime() - 70 * 60_000),
    });
    const c = derivarCondicoes({
      maquinas: [offlineRecente],
      jobs: [],
      ...opcoes,
      offlineAlertMinutes: 120,
    });
    expect(c).toEqual([]);
  });

  it("máquina sem nenhum contato conhecido não alerta", () => {
    const nunca = maquina({ status: "UNKNOWN", lastSeen: null });
    expect(
      derivarCondicoes({ maquinas: [nunca], jobs: [], ...opcoes, offlineAlertMinutes: 1 }),
    ).toEqual([]);
  });

  it("máquina online recente nunca alerta", () => {
    const viva = maquina({ status: "ONLINE", lastSeen: new Date(AGORA.getTime() - 60_000) });
    expect(
      derivarCondicoes({ maquinas: [viva], jobs: [], ...opcoes, offlineAlertMinutes: 15 }),
    ).toEqual([]);
  });
});

describe("máquina de suporte fica fora dos alertas", () => {
  const offlineHaDias = {
    status: "OFFLINE" as const,
    lastSeen: new Date(AGORA.getTime() - 48 * 60 * 60_000),
  };

  it("máquina de apoio offline não vira incidente", () => {
    const apoio = maquina({ ...offlineHaDias, suporte: true, clientId: null, clientName: null });
    expect(derivarCondicoes({ maquinas: [apoio], jobs: [], ...opcoes })).toEqual([]);
  });

  it("nem os jobs dela — se alguém configurar um backup ali", () => {
    const apoio = maquina({ ...offlineHaDias, suporte: true });
    const c = derivarCondicoes({
      maquinas: [apoio],
      jobs: [job({ status: "LATE", lateByMinutes: 5000 })],
      ...opcoes,
    });
    expect(c).toEqual([]);
  });

  it("a mesma máquina, marcada como de cliente, volta a alertar", () => {
    const daEmpresa = maquina({ ...offlineHaDias, suporte: false });
    const c = derivarCondicoes({ maquinas: [daEmpresa], jobs: [], ...opcoes });
    expect(c.map((x) => x.type)).toEqual(["MACHINE_OFFLINE"]);
  });
});

describe("planejarAlertas — deduplicação", () => {
  const condicao: Condicao = {
    dedupeKey: chaveJobAtrasado("job-1"),
    type: "BACKUP_LATE",
    severity: "CRITICAL",
    title: "Backup atrasado",
    message: "…",
    clientId: "cli-1",
    machineId: "maq-1",
    backupJobId: "job-1",
    backupRunId: null,
    relatedJobIds: [],
    context: {},
  };

  const aberto: AlertaAberto = {
    id: "alerta-1",
    dedupeKey: chaveJobAtrasado("job-1"),
    type: "BACKUP_LATE",
    relatedJobIds: [],
  };

  it("abre quando não existe alerta aberto para a chave", () => {
    const plano = planejarAlertas([condicao], []);
    expect(plano.abrir).toHaveLength(1);
    expect(plano.manter).toHaveLength(0);
    expect(plano.fechar).toHaveLength(0);
  });

  it("NÃO abre de novo no ciclo seguinte — mantém", () => {
    const plano = planejarAlertas([condicao], [aberto]);
    expect(plano.abrir).toHaveLength(0);
    expect(plano.manter).toHaveLength(1);
    expect(plano.manter[0]!.alerta.id).toBe("alerta-1");
  });

  it("dez ciclos seguidos com o mesmo problema não abrem dez alertas", () => {
    let abertos = [aberto];
    for (let i = 0; i < 10; i += 1) {
      const plano = planejarAlertas([condicao], abertos);
      expect(plano.abrir).toHaveLength(0);
      abertos = plano.manter.map((m) => m.alerta);
    }
  });

  it("fecha quando a condição some", () => {
    const plano = planejarAlertas([], [aberto]);
    expect(plano.fechar).toEqual([aberto]);
    expect(plano.abrir).toHaveLength(0);
  });

  it("fecha uma vez só: no ciclo seguinte não há mais nada a fechar", () => {
    const primeiro = planejarAlertas([], [aberto]);
    expect(primeiro.fechar).toHaveLength(1);
    const segundo = planejarAlertas([], []); // alerta já foi fechado no banco
    expect(segundo.fechar).toHaveLength(0);
  });

  it("condições e alertas de chaves diferentes não se confundem", () => {
    const outra: Condicao = { ...condicao, dedupeKey: chaveJobFalhou("job-2"), type: "BACKUP_FAILED" };
    const plano = planejarAlertas([outra], [aberto]);
    expect(plano.abrir.map((c) => c.dedupeKey)).toEqual([chaveJobFalhou("job-2")]);
    expect(plano.fechar.map((a) => a.id)).toEqual(["alerta-1"]);
  });

  it("condições duplicadas na mesma rodada viram uma só", () => {
    const plano = planejarAlertas([condicao, { ...condicao }], []);
    expect(plano.abrir).toHaveLength(1);
  });
});

describe("transição offline → online sob correlação", () => {
  it("o alerta de máquina fecha e os jobs ainda atrasados abrem os seus", () => {
    const maq = maquina({ id: "maq-1" });
    const jobs = [job({ id: "job-1", status: "LATE", lateByMinutes: 600 })];
    const abertoMaquina: AlertaAberto = {
      id: "alerta-maq",
      dedupeKey: chaveMaquinaOffline("maq-1"),
      type: "MACHINE_OFFLINE",
      relatedJobIds: ["job-1"],
    };

    const condicoes = derivarCondicoes({ maquinas: [maq], jobs, ...opcoes });
    const plano = planejarAlertas(condicoes, [abertoMaquina]);

    expect(plano.fechar.map((a) => a.id)).toEqual(["alerta-maq"]);
    expect(plano.abrir.map((c) => c.type)).toEqual(["BACKUP_LATE"]);
  });
});

describe("verificação de montagens", () => {
  const comMontagem = (over: Partial<NonNullable<MaquinaSnapshot["montagem"]>> = {}) =>
    maquina({
      montagem: {
        ultimaEm: new Date(AGORA.getTime() - 10 * 60_000),
        resultado: "OK",
        pontosComFalha: 0,
        pontosRemontados: [],
        remontagensRecentes: 0,
        intervaloMinutos: 1440,
        toleranciaMinutos: 60,
        ...over,
      },
    });

  it("montagem OK não gera nada", () => {
    expect(derivarCondicoes({ maquinas: [comMontagem()], jobs: [], ...opcoes })).toEqual([]);
  });

  it("falha na montagem é crítica e explica o risco ao backup", () => {
    const c = derivarCondicoes({
      maquinas: [comMontagem({ resultado: "FAILED", pontosComFalha: 2 })],
      jobs: [],
      ...opcoes,
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.type).toBe("MOUNT_FAILED");
    expect(c[0]!.severity).toBe("CRITICAL");
    expect(c[0]!.message).toContain("2 ponto(s)");
    expect(c[0]!.message).toContain("sem copiar nada");
  });

  it("remontagem abre alerta de atenção com o caminho que caiu", () => {
    const c = derivarCondicoes({
      maquinas: [
        comMontagem({
          resultado: "RECOVERED",
          pontosRemontados: ["/mnt/server_cbh"],
          remontagensRecentes: 1,
        }),
      ],
      jobs: [],
      ...opcoes,
    });

    expect(c).toHaveLength(1);
    expect(c[0]!.type).toBe("MOUNT_REMOUNTED");
    expect(c[0]!.severity).toBe("WARNING");
    expect(c[0]!.message).toContain("/mnt/server_cbh");
    expect(c[0]!.message).toContain("primeira remontagem");
  });

  it("remontagem que se repete aponta a infraestrutura como suspeita", () => {
    const c = derivarCondicoes({
      maquinas: [
        comMontagem({
          resultado: "RECOVERED",
          pontosRemontados: ["/mnt/server_cbh"],
          remontagensRecentes: 4,
        }),
      ],
      jobs: [],
      ...opcoes,
    });

    expect(c[0]!.message).toContain("4ª remontagem");
    expect(c[0]!.message).toContain("servidor de arquivos ou na rede");
    expect(c[0]!.context).toMatchObject({ remontagensRecentes: 4 });
  });

  it("falha vence remontagem: um incidente por máquina, não dois", () => {
    const c = derivarCondicoes({
      maquinas: [
        comMontagem({
          resultado: "FAILED",
          pontosComFalha: 1,
          pontosRemontados: ["/mnt/outro"],
          remontagensRecentes: 2,
        }),
      ],
      jobs: [],
      ...opcoes,
    });

    expect(c.map((x) => x.type)).toEqual(["MOUNT_FAILED"]);
  });

  it("remontagem some quando a verificação seguinte vem limpa", () => {
    const aberto = {
      id: "alerta-remontagem",
      dedupeKey: chaveMontagemRemontada("maq-1"),
      type: "MOUNT_REMOUNTED" as const,
      relatedJobIds: [],
    };

    const condicoes = derivarCondicoes({
      maquinas: [comMontagem({ resultado: "OK" })],
      jobs: [],
      ...opcoes,
    });
    const plano = planejarAlertas(condicoes, [aberto]);

    expect(plano.fechar.map((a) => a.id)).toEqual(["alerta-remontagem"]);
    expect(explicacaoDeRecuperacao("MOUNT_REMOUNTED")).toContain("sem precisar remontar");
  });

  it("lista longa de pontos não vira parágrafo na mensagem", () => {
    const c = derivarCondicoes({
      maquinas: [
        comMontagem({
          resultado: "RECOVERED",
          pontosRemontados: ["/mnt/a", "/mnt/b", "/mnt/c", "/mnt/d", "/mnt/e"],
          remontagensRecentes: 1,
        }),
      ],
      jobs: [],
      ...opcoes,
    });

    expect(c[0]!.message).toContain("/mnt/a, /mnt/b, /mnt/c e mais 2");
    expect(c[0]!.message).not.toContain("/mnt/d");
  });

  it("verificação que parou de chegar vira alerta próprio", () => {
    const c = derivarCondicoes({
      maquinas: [
        comMontagem({ ultimaEm: new Date(AGORA.getTime() - 40 * 60 * 60_000) }),
      ],
      jobs: [],
      ...opcoes,
    });
    expect(c.map((x) => x.type)).toEqual(["MOUNT_LATE"]);
  });

  it("dentro da janela + tolerância não alerta", () => {
    const c = derivarCondicoes({
      maquinas: [comMontagem({ ultimaEm: new Date(AGORA.getTime() - 24 * 60 * 60_000) })],
      jobs: [],
      ...opcoes,
    });
    expect(c).toEqual([]);
  });

  it("intervalo nulo desliga só a vigilância de atraso, não a de falha", () => {
    const semVigilancia = comMontagem({
      intervaloMinutos: null,
      ultimaEm: new Date(AGORA.getTime() - 40 * 24 * 60 * 60_000),
    });
    expect(derivarCondicoes({ maquinas: [semVigilancia], jobs: [], ...opcoes })).toEqual([]);

    const falhando = comMontagem({ intervaloMinutos: null, resultado: "FAILED", pontosComFalha: 1 });
    expect(
      derivarCondicoes({ maquinas: [falhando], jobs: [], ...opcoes }).map((c) => c.type),
    ).toEqual(["MOUNT_FAILED"]);
  });

  it("máquina offline absorve: não duplica o aviso de montagem parada", () => {
    const offline = comMontagem({ ultimaEm: new Date(AGORA.getTime() - 40 * 60 * 60_000) });
    const c = derivarCondicoes({
      maquinas: [
        { ...offline, status: "OFFLINE", lastSeen: new Date(AGORA.getTime() - 5 * 60 * 60_000) },
      ],
      jobs: [],
      ...opcoes,
    });
    expect(c.map((x) => x.type)).toEqual(["MACHINE_OFFLINE"]);
  });

  it("máquina de apoio não gera alerta de montagem", () => {
    const apoio = comMontagem({ resultado: "FAILED", pontosComFalha: 1 });
    expect(
      derivarCondicoes({ maquinas: [{ ...apoio, suporte: true }], jobs: [], ...opcoes }),
    ).toEqual([]);
  });

  it("máquina sem verificação nenhuma não entra no assunto", () => {
    expect(derivarCondicoes({ maquinas: [maquina()], jobs: [], ...opcoes })).toEqual([]);
  });
});
