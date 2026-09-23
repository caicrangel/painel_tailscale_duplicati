import {
  BellRing,
  Building2,
  HardDriveDownload,
  LayoutDashboard,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { HIERARQUIA } from "@/lib/auth/roles";

export type ItemNavegacao = {
  href: string;
  label: string;
  /** Rótulo da aba no celular, onde cabem ~9 caracteres. */
  labelCurto: string;
  Icone: LucideIcon;
  minimo: Role;
  /**
   * Ganha aba própria na barra inferior do celular. São as telas de uso
   * diário de quem monitora; o resto fica na gaveta "Mais".
   */
  abaMovel: boolean;
};

/** Fonte única do menu: a lateral (desktop) e a barra inferior (celular) leem daqui. */
export const ITENS_NAVEGACAO: ItemNavegacao[] = [
  { href: "/dashboard", label: "Dashboard", labelCurto: "Início", Icone: LayoutDashboard, minimo: "VIEWER", abaMovel: true },
  { href: "/clientes", label: "Clientes", labelCurto: "Clientes", Icone: Building2, minimo: "VIEWER", abaMovel: false },
  { href: "/maquinas", label: "Máquinas", labelCurto: "Máquinas", Icone: Server, minimo: "VIEWER", abaMovel: true },
  { href: "/jobs", label: "Jobs de backup", labelCurto: "Jobs", Icone: HardDriveDownload, minimo: "VIEWER", abaMovel: true },
  { href: "/alertas", label: "Alertas", labelCurto: "Alertas", Icone: BellRing, minimo: "VIEWER", abaMovel: true },
  { href: "/usuarios", label: "Usuários", labelCurto: "Usuários", Icone: Users, minimo: "ADMIN", abaMovel: false },
  { href: "/configuracoes", label: "Configurações", labelCurto: "Config.", Icone: Settings, minimo: "ADMIN", abaMovel: false },
];

export function itensDoPapel(role: Role): ItemNavegacao[] {
  return ITENS_NAVEGACAO.filter((i) => HIERARQUIA[role] >= HIERARQUIA[i.minimo]);
}

export function estaAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type ContagemAlertas = { abertos: number; criticos: number };
