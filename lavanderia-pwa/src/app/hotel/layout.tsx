import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShellHotel } from "@/components/layout/app-shell";
import { RealtimeRefresh } from "@/components/layout/realtime-refresh";
import type { NavItem } from "@/components/layout/nav-links";

export const metadata = { title: "Hotel" };

const TABLAS = ["remitos_envio", "observaciones", "stock_edificio"];

export default async function HotelLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requireRol("hotel");
  const supabase = await createClient();
  const [{ count: obsPendientes }, { count: alertas }] = await Promise.all([
    supabase.from("observaciones").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    supabase.from("v_alertas_stock").select("articulo_id", { count: "exact", head: true }),
  ]);

  const items: NavItem[] = [
    { href: "/hotel", label: "Inicio", icono: "dashboard", movil: true, exacto: true },
    { href: "/hotel/remitos", label: "Remitos", icono: "remitos", movil: true },
    { href: "/hotel/stock", label: "Stock", icono: "stock", movil: true, badge: alertas ?? 0 },
    { href: "/hotel/observaciones", label: "Observaciones", icono: "observaciones", badge: obsPendientes ?? 0 },
    { href: "/hotel/finanzas", label: "Finanzas", icono: "finanzas", movil: true },
    { href: "/hotel/precios", label: "Precios", icono: "precios", movil: true },
    ...(perfil.es_admin ? [{ href: "/hotel/usuarios", label: "Usuarios", icono: "usuarios" } as NavItem] : []),
  ];

  return (
    <AppShellHotel nombre={perfil.nombre} items={items}>
      {children}
      <RealtimeRefresh canal="hotel" tablas={TABLAS} />
    </AppShellHotel>
  );
}
