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

/** O que é preciso saber de uma máquina para decidir se o relatório é dela. */
export type CandidataDeMaquina = {
  hostname: string;
  displayName: string | null;
  /** Apelidos registrados quando um operador mesclou máquinas na UI. */
  duplicatiHostnames: string[];
};

/**
 * Decide se o `machine-name` do relatório pertence a esta máquina.
 *
 * O hostname do Tailscale e o nome que o Duplicati reporta divergem com
 * frequência — um device "cliente-saolucas.tailnet.ts.net" pode se apresentar
 * como "srv-betania". Por isso os apelidos registrados na mesclagem valem
 * tanto quanto o hostname: sem eles, a mesclagem feita na UI se desfaria no
 * backup seguinte, recriando a máquina duplicada.
 */
export function maquinaCasa(
  maquina: CandidataDeMaquina,
  machineName: string | null | undefined,
): boolean {
  if (mesmoHost(maquina.hostname, machineName)) return true;
  if (mesmoHost(maquina.displayName, machineName)) return true;
  return maquina.duplicatiHostnames.some((apelido) => mesmoHost(apelido, machineName));
}
