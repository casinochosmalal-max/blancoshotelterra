import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Notificaciones } from "./notificaciones";
import { NavLinks, type NavItem } from "./nav-links";

/** Shell del hotel: sidebar en escritorio, barra inferior en celular. */
export function AppShellHotel({ nombre, children, items }: { nombre: string; children: React.ReactNode; items: NavItem[] }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
        <Link href="/hotel" className="flex items-center gap-2 px-5 py-5 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">🧺</span>
          Terra Blancos
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          <NavLinks items={items} variante="sidebar" />
        </nav>
        <form action={logout} className="border-t p-3">
          <p className="truncate px-2 pb-2 text-xs text-muted-foreground">{nombre} · Hotel</p>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
            <LogOut className="size-4" /> Salir
          </button>
        </form>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:px-8">
          <Link href="/hotel" className="font-semibold lg:hidden">
            🧺 Terra Blancos
          </Link>
          <span className="hidden text-sm text-muted-foreground lg:block">Gestión de lavandería</span>
          <div className="flex items-center gap-1">
            <Notificaciones base="/hotel" />
            <form action={logout} className="lg:hidden">
              <button aria-label="Salir" className="grid size-9 place-items-center rounded-md hover:bg-accent">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 pb-24 lg:p-8">{children}</main>
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background lg:hidden">
          <NavLinks items={items.filter((i) => i.movil)} variante="bottom" />
        </nav>
      </div>
    </div>
  );
}
