"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MessageSquareWarning,
  ScanLine,
  Tags,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONOS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  remitos: ClipboardList,
  stock: Boxes,
  observaciones: MessageSquareWarning,
  finanzas: Wallet,
  precios: Tags,
  movimientos: ArrowLeftRight,
  escanear: ScanLine,
  usuarios: UsersRound,
};

export interface NavItem {
  href: string;
  label: string;
  icono: keyof typeof ICONOS;
  movil?: boolean;
  exacto?: boolean;
  badge?: number;
}

export function NavLinks({ items, variante }: { items: NavItem[]; variante: "sidebar" | "bottom" }) {
  const path = usePathname();
  return items.map((it) => {
    const Icon = ICONOS[it.icono];
    const activo = it.exacto ? path === it.href : path === it.href || path.startsWith(it.href + "/");
    return variante === "sidebar" ? (
      <Link
        key={it.href}
        href={it.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
          activo && "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-4" /> {it.label}
        {!!it.badge && <span className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] text-white">{it.badge}</span>}
      </Link>
    ) : (
      <Link
        key={it.href}
        href={it.href}
        className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground", activo && "text-primary")}
      >
        <Icon className="size-5" />
        {it.label}
        {!!it.badge && <span className="absolute right-1/4 top-1 size-2 rounded-full bg-destructive" />}
      </Link>
    );
  });
}
