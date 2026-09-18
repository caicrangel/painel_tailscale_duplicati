import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/config/settings";
import { derivarStatusMaquina } from "@/lib/jobs/late";
import { hostnameDoDevice, lerLastSeen, listarDevices } from "@/lib/tailscale/client";
import { registrarCiclo } from "../lib/sync-log";

/**
 * Pull dos devices da tailnet (a cada 2 min por padrão).
 *
 * Princípio: falha de rede NUNCA apaga o último estado conhecido. Se a API do
 * Tailscale cair, as máquinas continuam com o status da última leitura e o
 * SyncLog registra o problema — é o que nos permite distinguir "cliente
 * offline" de "nosso monitoramento quebrado".
 */
export async function sincronizarTailscale(now: Date = new Date()): Promise<number> {
  return registrarCiclo("TAILSCALE", async () => {
    const settings = await getSettings();
    const { devices, descartados } = await listarDevices();

    if (descartados > 0) {
      console.warn(`[tailscale] ${descartados} device(s) com formato inesperado foram ignorados`);
    }

    let processados = 0;

    for (const device of devices) {
      const lastSeen = lerLastSeen(device.lastSeen);
      const status = derivarStatusMaquina({
        lastSeen,
        now,
        onlineMaxMinutes: settings.machineOnlineMaxMinutes,
        idleMaxMinutes: settings.machineIdleMaxMinutes,
      });

      const hostname = hostnameDoDevice(device);

      const existente = await prisma.machine.findUnique({
        where: { tailscaleDeviceId: device.id },
        select: { id: true, status: true },
      });

      const dados = {
        hostname,
        displayName: device.name ?? null,
        os: device.os ?? null,
        tailscaleVersion: device.clientVersion ?? null,
        addresses: device.addresses ?? [],
        tags: device.tags ?? [],
        updateAvailable: device.updateAvailable ?? false,
        lastSeen,
        status,
        // Marca a transição para o avaliador de alertas saber desde quando.
        statusChangedAt:
          existente && existente.status !== status ? now : undefined,
      };

      if (existente) {
        await prisma.machine.update({ where: { id: existente.id }, data: dados });
      } else {
        // Device novo entra sem cliente: aparece na fila de "não atribuídas".
        await prisma.machine.create({
          data: {
            ...dados,
            tailscaleDeviceId: device.id,
            source: "TAILSCALE",
            statusChangedAt: now,
          },
        });
        console.log(`[tailscale] device novo descoberto: ${hostname} (${device.id})`);
      }

      processados += 1;
    }

    return processados;
  });
}
