import { describe, expect, it } from "vitest";
import { clientSchema, machineSchema } from "@/lib/validation/schemas";

/**
 * FormData.get() devolve null para campo ausente — e campo desabilitado na tela
 * não é enviado. Os schemas precisam aguentar isso, senão desabilitar um input
 * quebra o salvamento inteiro.
 */
describe("machineSchema — campos ausentes no FormData", () => {
  it("aceita clientId null (select desabilitado por ser máquina de apoio)", () => {
    const r = machineSchema.safeParse({
      role: "SUPORTE",
      clientId: null,
      hostname: "pc-caic",
      displayName: null,
      notes: null,
      maintenanceUntil: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBeUndefined();
      expect(r.data.role).toBe("SUPORTE");
    }
  });

  it("string vazia também vira undefined", () => {
    const r = machineSchema.safeParse({
      role: "CLIENTE",
      clientId: "",
      hostname: "srv",
      displayName: "",
      notes: "",
      maintenanceUntil: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.clientId).toBeUndefined();
  });

  it("finalidade ausente assume máquina de cliente", () => {
    const r = machineSchema.safeParse({ hostname: "srv" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("CLIENTE");
  });

  it("hostname continua obrigatório", () => {
    expect(machineSchema.safeParse({ hostname: "" }).success).toBe(false);
  });

  it("finalidade inválida é recusada", () => {
    expect(machineSchema.safeParse({ hostname: "srv", role: "QUALQUER" }).success).toBe(false);
  });
});

describe("clientSchema — campos ausentes", () => {
  it("contatos e observações podem vir null", () => {
    const r = clientSchema.safeParse({
      name: "Cliente X",
      plan: "ESSENCIAL",
      contactName: null,
      contactPhone: null,
      telegramChatId: null,
      notes: null,
      active: true,
    });
    expect(r.success).toBe(true);
  });
});
