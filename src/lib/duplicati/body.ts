/**
 * O Duplicati manda o relatório de formas diferentes conforme a versão e as
 * opções do job:
 *   1. JSON puro no corpo (--send-http-result-output-format=Json em versões novas)
 *   2. form-urlencoded com o JSON dentro de um campo (default: "message")
 *   3. texto puro contendo JSON
 *
 * Aceitar os três é requisito, não conveniência: um cliente com versão antiga
 * não pode ficar sem monitoramento por causa de Content-Type.
 *
 * Função pura — recebe o corpo já lido como string.
 */

export type CorpoExtraido = {
  /** JSON decodificado, quando foi possível. */
  payload: unknown;
  /** Formato reconhecido, para diagnóstico. */
  formato: "json" | "form" | "texto" | "desconhecido";
  /** Campo do form que continha o JSON, quando aplicável. */
  campo?: string;
  erro?: string;
};

/** Campos que o Duplicati usa (ou pode usar) para carregar o relatório. */
const CAMPOS_PROVAVEIS = ["message", "Message", "result", "data", "payload", "json"];

function tentarJson(texto: string): { ok: true; valor: unknown } | { ok: false; erro: string } {
  try {
    return { ok: true, valor: JSON.parse(texto) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "JSON inválido" };
  }
}

function pareceJson(texto: string): boolean {
  const t = texto.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

export function extrairPayload(corpo: string, contentType: string | null): CorpoExtraido {
  const tipo = (contentType ?? "").toLowerCase();
  const texto = corpo.trim();

  if (texto === "") {
    return { payload: null, formato: "desconhecido", erro: "Corpo vazio." };
  }

  // 1) JSON declarado (ou que simplesmente parece JSON)
  if (tipo.includes("application/json") || pareceJson(texto)) {
    const r = tentarJson(texto);
    if (r.ok) return { payload: r.valor, formato: "json" };
    // Content-Type mentiu; ainda vale tentar como form abaixo.
    if (tipo.includes("application/json")) {
      return { payload: null, formato: "json", erro: `JSON inválido: ${r.erro}` };
    }
  }

  // 2) form-urlencoded
  if (tipo.includes("application/x-www-form-urlencoded") || texto.includes("=")) {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(texto);
    } catch {
      return { payload: null, formato: "form", erro: "form-urlencoded ilegível." };
    }

    // Primeiro os campos conhecidos, depois qualquer campo que pareça JSON.
    for (const campo of CAMPOS_PROVAVEIS) {
      const valor = params.get(campo);
      if (valor && pareceJson(valor)) {
        const r = tentarJson(valor);
        if (r.ok) return { payload: r.valor, formato: "form", campo };
      }
    }
    for (const [campo, valor] of params.entries()) {
      if (pareceJson(valor)) {
        const r = tentarJson(valor);
        if (r.ok) return { payload: r.valor, formato: "form", campo };
      }
    }

    return {
      payload: null,
      formato: "form",
      erro: "Nenhum campo do formulário continha JSON reconhecível.",
    };
  }

  // 3) texto puro
  const r = tentarJson(texto);
  if (r.ok) return { payload: r.valor, formato: "texto" };

  return { payload: null, formato: "desconhecido", erro: `Corpo não reconhecido: ${r.erro}` };
}
