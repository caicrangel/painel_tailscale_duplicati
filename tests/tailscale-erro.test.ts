import { describe, expect, it } from "vitest";
import { descreverCausa } from "@/lib/tailscale/client";

describe("descreverCausa", () => {
  it("desempacota a causa aninhada do fetch do Node", () => {
    const raiz = Object.assign(new Error("getaddrinfo EAI_AGAIN api.tailscale.com"), {
      code: "EAI_AGAIN",
      syscall: "getaddrinfo",
      hostname: "api.tailscale.com",
    });
    const topo = new Error("fetch failed", { cause: raiz });

    const texto = descreverCausa(topo);
    expect(texto).toContain("fetch failed");
    expect(texto).toContain("EAI_AGAIN");
    expect(texto).toContain("api.tailscale.com");
  });

  it("entra no primeiro erro de um AggregateError", () => {
    const interno = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const agregado = Object.assign(new Error("fetch failed"), { errors: [interno] });

    expect(descreverCausa(agregado)).toContain("ECONNREFUSED");
  });

  it("não quebra com valor que não é Error", () => {
    expect(descreverCausa("caos")).toBe("caos");
  });
});
