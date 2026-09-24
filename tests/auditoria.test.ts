import { describe, expect, it } from "vitest";
import { descreverAcao, filtroAuditoriaSchema } from "@/lib/sistema/auditoria";

describe("descreverAcao", () => {
  it("traduz ação conhecida e acha a categoria pelo prefixo", () => {
    expect(descreverAcao("cliente.criado")).toEqual({
      rotulo: "Cliente criado",
      categoria: "Clientes",
      tom: "neutral",
    });
  });

  it("login falho e bloqueado ficam em destaque de perigo", () => {
    expect(descreverAcao("auth.login_falhou").tom).toBe("danger");
    expect(descreverAcao("auth.login_bloqueado_rate_limit").tom).toBe("danger");
  });

  it("remoção e revogação ficam em atenção", () => {
    expect(descreverAcao("maquina.removida").tom).toBe("warn");
    expect(descreverAcao("cliente.token_revogado").tom).toBe("warn");
  });

  it("ação desconhecida aparece com o código cru, nunca some", () => {
    expect(descreverAcao("backup.algo_novo")).toEqual({
      rotulo: "backup.algo_novo",
      categoria: "Outros",
      tom: "neutral",
    });
  });
});

describe("filtroAuditoriaSchema", () => {
  it("aceita categoria válida e página numérica em texto", () => {
    expect(
      filtroAuditoriaSchema.parse({ categoria: "auth", pagina: "3" }),
    ).toEqual({
      categoria: "auth",
      pagina: 3,
    });
  });

  it("valor inválido vira o padrão em vez de derrubar a página", () => {
    expect(
      filtroAuditoriaSchema.parse({ categoria: "xpto", pagina: "-2" }),
    ).toEqual({
      categoria: undefined,
      pagina: 1,
    });
    expect(filtroAuditoriaSchema.parse({})).toEqual({
      categoria: undefined,
      pagina: 1,
    });
  });
});
