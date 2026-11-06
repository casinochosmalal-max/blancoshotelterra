import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DetalleRemito, Observacion, PendienteEntrega, RemitoVista } from "@/types/database";

export async function cargarRemito(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: remito }, { data: detalle }, { data: observaciones }] = await Promise.all([
    supabase.from("v_remitos").select("*").eq("id", id).maybeSingle<RemitoVista>(),
    supabase.from("detalle_remito").select("*, articulos(nombre, codigo, categoria, orden)").eq("remito_id", id),
    supabase.from("observaciones").select("*, articulos(nombre)").eq("remito_id", id).order("created_at"),
  ]);
  if (!remito) notFound();
  const det = ((detalle ?? []) as DetalleRemito[]).sort((a, b) => (a.articulos?.orden ?? 0) - (b.articulos?.orden ?? 0));
  return { remito, detalle: det, observaciones: (observaciones ?? []) as Observacion[] };
}

/** Prendas pendientes de entrega vinculadas a un remito (retenidas en él o entregadas con él). */
export async function cargarPendientesRemito(remito: Pick<RemitoVista, "id" | "edificio_id" | "estado">) {
  const supabase = await createClient();
  const [{ data: abiertas }, { data: vinculadas }] = await Promise.all([
    // Para el despacho: lo que la torre tiene pendiente de otros remitos.
    remito.estado === "recibido"
      ? supabase
          .from("v_pendientes_entrega")
          .select("*")
          .eq("edificio_id", remito.edificio_id)
          .eq("estado", "pendiente")
          .neq("remito_origen_id", remito.id)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    supabase
      .from("v_pendientes_entrega")
      .select("*")
      .or(`remito_origen_id.eq.${remito.id},remito_entrega_id.eq.${remito.id}`)
      .order("created_at"),
  ]);
  const todas = (vinculadas ?? []) as PendienteEntrega[];
  return {
    disponibles: (abiertas ?? []) as PendienteEntrega[],
    enCamino: todas.filter((p) => p.remito_entrega_id === remito.id && p.estado === "en_camino"),
    retenidas: todas.filter((p) => p.remito_origen_id === remito.id),
    incluidas: todas.filter((p) => p.remito_entrega_id === remito.id && p.estado === "entregada"),
  };
}

/** Pendientes abiertas (por entregar o en camino), de todas las torres. */
export async function cargarPendientesAbiertas() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_pendientes_entrega")
    .select("*")
    .in("estado", ["pendiente", "en_camino"])
    .order("created_at");
  return (data ?? []) as PendienteEntrega[];
}
