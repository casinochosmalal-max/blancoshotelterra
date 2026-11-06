import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { NuevoRemitoForm } from "@/components/remitos/nuevo-remito-form";
import type { Edificio, StockResumen } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo envío" };

export default async function NuevoRemito() {
  const supabase = await createClient();
  const [{ data: edificios }, { data: stock }, { data: hoy }] = await Promise.all([
    supabase.from("edificios").select("*").eq("activo", true).order("codigo"),
    supabase.from("v_stock_resumen").select("*").order("orden"),
    supabase.rpc("hoy"),
  ]);
  const { data: delDia } = await supabase.from("remitos_envio").select("edificio_id").eq("fecha", hoy as string).neq("estado", "anulado");
  const enviosHoy: Record<number, number> = {};
  (delDia ?? []).forEach((r) => (enviosHoy[r.edificio_id] = (enviosHoy[r.edificio_id] ?? 0) + 1));

  return (
    <>
      <PageHeader titulo="Nuevo remito de envío" descripcion="Paso A · Preparación y envío al lavadero" />
      <NuevoRemitoForm edificios={(edificios ?? []) as Edificio[]} stock={(stock ?? []) as StockResumen[]} enviosHoy={enviosHoy} />
    </>
  );
}
