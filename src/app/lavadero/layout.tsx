import Link from "next/link";
import { BarChart3, ClipboardList, LogOut, ScanLine } from "lucide-react";
import { requireRol } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Notificaciones } from "@/components/layout/notificaciones";
import { RealtimeRefresh } from "@/components/layout/realtime-refresh";
import { EmblemaTerraMalal } from "@/components/layout/marca";

export const metadata = { title: "Lavadero" };

const TABLAS = ["remitos_envio"];

export default async function LavaderoLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requireRol("lavadero");
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-primary px-4 text-primary-foreground">
        <Link href="/lavadero" className="flex items-center gap-2 font-semibold">
          <span className="grid size-9 place-items-center rounded-full bg-[#faf6f0]">
            <EmblemaTerraMalal className="size-7" />
          </span>
          <span className="leading-tight">
            Lavadero
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] opacity-80">Terra Malal</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 [&_button]:hover:bg-white/10">
          <span className="mr-1 hidden text-sm opacity-80 sm:inline">{perfil.nombre}</span>
          <Notificaciones base="/lavadero" />
          <form action={logout}>
            <button aria-label="Salir" className="grid size-9 place-items-center rounded-md">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </header>
      <div className="guarda" aria-hidden />
      <main className="mx-auto max-w-2xl p-4 pb-24">{children}</main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-background">
        <Link href="/lavadero" className="flex flex-col items-center gap-0.5 py-2 text-xs">
          <ClipboardList className="size-5" /> Remitos
        </Link>
        <Link href="/lavadero/escanear" className="flex flex-col items-center gap-0.5 py-2 text-xs">
          <ScanLine className="size-5" /> Escanear QR
        </Link>
        <Link href="/lavadero/resumen" className="flex flex-col items-center gap-0.5 py-2 text-xs">
          <BarChart3 className="size-5" /> Resumen
        </Link>
      </nav>
      <RealtimeRefresh canal="lavadero-remitos" tablas={TABLAS} />
    </div>
  );
}
