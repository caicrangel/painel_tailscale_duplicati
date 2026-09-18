import { describe, expect, it } from "vitest";
import { windowStartFor } from "@/lib/auth/rate-limit";
import { podeAtuarComo } from "@/lib/auth/roles";
import { validatePasswordStrength } from "@/lib/auth/password";

describe("windowStartFor", () => {
  it("alinha o início da janela ao bloco de N minutos", () => {
    const now = new Date("2026-09-18T14:37:22.500Z");
    expect(windowStartFor(now, 15).toISOString()).toBe("2026-09-18T14:30:00.000Z");
    expect(windowStartFor(now, 1).toISOString()).toBe("2026-09-18T14:37:00.000Z");
  });

  it("mantém a mesma janela para instantes dentro do bloco", () => {
    const a = windowStartFor(new Date("2026-09-18T14:30:00Z"), 15);
    const b = windowStartFor(new Date("2026-09-18T14:44:59Z"), 15);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("muda de janela ao cruzar o bloco", () => {
    const a = windowStartFor(new Date("2026-09-18T14:44:59Z"), 15);
    const b = windowStartFor(new Date("2026-09-18T14:45:00Z"), 15);
    expect(b.getTime()).toBeGreaterThan(a.getTime());
  });
});

describe("hierarquia de papéis", () => {
  it("ADMIN faz tudo", () => {
    expect(podeAtuarComo("ADMIN", "ADMIN")).toBe(true);
    expect(podeAtuarComo("ADMIN", "OPERATOR")).toBe(true);
    expect(podeAtuarComo("ADMIN", "VIEWER")).toBe(true);
  });

  it("OPERATOR edita mas não administra", () => {
    expect(podeAtuarComo("OPERATOR", "OPERATOR")).toBe(true);
    expect(podeAtuarComo("OPERATOR", "VIEWER")).toBe(true);
    expect(podeAtuarComo("OPERATOR", "ADMIN")).toBe(false);
  });

  it("VIEWER só lê", () => {
    expect(podeAtuarComo("VIEWER", "VIEWER")).toBe(true);
    expect(podeAtuarComo("VIEWER", "OPERATOR")).toBe(false);
    expect(podeAtuarComo("VIEWER", "ADMIN")).toBe(false);
  });
});

describe("política de senha", () => {
  it("rejeita senha curta", () => {
    const r = validatePasswordStrength("curta123");
    expect(r.ok).toBe(false);
  });

  it("rejeita senha só de letras", () => {
    expect(validatePasswordStrength("abcdefghijklm").ok).toBe(false);
  });

  it("aceita senha com letra e número e 12+ caracteres", () => {
    expect(validatePasswordStrength("minha-senha-123").ok).toBe(true);
  });
});
