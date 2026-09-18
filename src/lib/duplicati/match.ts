/**
 * Casamento entre o nome de máquina reportado pelo Duplicati e o hostname
 * conhecido do Tailscale. Puro, testado: é o que decide se um relatório cai
 * na máquina certa ou cria uma órfã.
 */

/** "SRV-FISCAL-01.tail1234.ts.net" → "srv-fiscal-01" */
export function normalizarHostname(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase().split(".")[0];
  return limpo && limpo !== "" ? limpo : null;
}

export function mesmoHost(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarHostname(a);
  const nb = normalizarHostname(b);
  return na !== null && nb !== null && na === nb;
}

/**
 * Chave do job. `backup-id` é o ideal; sem ele, o nome serve; sem nada,
 * "default" — e a UI mostra o job como "nome não reportado".
 */
export function chaveDoJob(backupId: string | null, backupName: string | null): string {
  if (backupId) return backupId;
  if (backupName) return `name:${backupName.trim().toLowerCase()}`;
  return "default";
}
