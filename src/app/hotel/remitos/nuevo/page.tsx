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
  const { data: inicioStock } = await supabase.rpc("fecha_inicio_stock");
  // Envíos por edificio y fecha de los últimos 120 días (para cargar remitos atrasados).
  const desde = new Date(`${hoy as string}T12:00:00`);
  desde.setDate(desde.getDate() - 120);
  const { data: recientes } = await supabase
    .from("remitos_envio")
    .select("edificio_id, fecha")
    .gte("fecha", desde.toISOString().slice(0, 10))
    .neq("estado", "anulado");
  const envios: Record<string, number> = {};
  (recientes ?? []).forEach((r) => {
    const k = `${r.edificio_id}|${r.fecha}`;
    envios[k] = (envios[k] ?? 0) + 1;
  });

  return (
    <>
      <PageHeader titulo="Nuevo remito de envío" descripcion="Paso A · Preparación y envío al lavadero" />
      <NuevoRemitoForm edificios={(edificios ?? []) as Edificio[]} stock={(stock ?? []) as StockResumen[]} envios={envios} hoy={hoy as string} inicioStock={(inicioStock as string | null) ?? null} />
    </>
  );
}
