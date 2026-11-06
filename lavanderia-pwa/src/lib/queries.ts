import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DetalleRemito, Observacion, RemitoVista } from "@/types/database";

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
