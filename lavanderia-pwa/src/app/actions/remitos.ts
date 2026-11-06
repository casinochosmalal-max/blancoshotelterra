"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajes, notificarWhatsApp } from "@/lib/whatsapp";
import type { ItemConteo, ObservacionInput, RemitoVista } from "@/types/database";

export type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fallo = (e: { message: string } | null | undefined): Resultado<never> => ({
  ok: false,
  error: e?.message ?? "Error inesperado",
});

async function resumen(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("v_remitos").select("*").eq("id", id).single<RemitoVista>();
  return data;
}

function refrescar(id?: string) {
  revalidatePath("/hotel", "layout");
  revalidatePath("/lavadero", "layout");
  if (id) revalidatePath(`/hotel/remitos/${id}`);
}

const TIPO_TXT = { faltante: "Faltante", rotura: "Rotura", mancha: "Mancha", sobrante: "Sobrante", otro: "Otro" } as const;

async function textoObservaciones(remitoId: string, etapa: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("observaciones")
    .select("tipo, cantidad, responsable, descripcion, articulos(nombre)")
    .eq("remito_id", remitoId)
    .eq("etapa", etapa);
  return (data ?? []).map((o) => {
    const art = (o.articulos as unknown as { nombre: string } | null)?.nombre ?? "General";
    return `${TIPO_TXT[o.tipo as keyof typeof TIPO_TXT]} ${o.cantidad}× ${art} (cargo ${o.responsable})${o.descripcion ? ` – ${o.descripcion}` : ""}`;
  });
}

// --- Paso A: hotel crea y envía ---------------------------------------------

export async function crearRemito(input: {
  edificio_id: number;
  ubicacion_origen: "deposito" | "habitaciones";
  notas?: string;
  items: ItemConteo[];
  enviar: boolean;
}): Promise<Resultado<{ id: string }>> {
  const items = input.items.filter((i) => i.cantidad > 0);
  if (!items.length) return { ok: false, error: "Cargá al menos un artículo" };

  const supabase = await createClient();
  const { data: remito, error } = await supabase
    .from("remitos_envio")
    .insert({ edificio_id: input.edificio_id, ubicacion_origen: input.ubicacion_origen, notas: input.notas || null })
    .select("id")
    .single();
  if (error || !remito) return fallo(error);

  const { error: errDet } = await supabase
    .from("detalle_remito")
    .insert(items.map((i) => ({ remito_id: remito.id, articulo_id: i.articulo_id, cantidad_enviada: i.cantidad })));
  if (errDet) {
    await supabase.from("remitos_envio").delete().eq("id", remito.id);
    return fallo(errDet);
  }

  if (input.enviar) {
    const r = await enviarRemito(remito.id);
    if (!r.ok) return r;
  }
  refrescar(remito.id);
  return { ok: true, data: { id: remito.id } };
}

export async function enviarRemito(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_remito", { p_remito: id });
  if (error) return fallo(error);

  const r = await resumen(id);
  if (r) {
    await notificarWhatsApp(
      "lavadero",
      mensajes.nuevoEnvio({ id, codigo: r.codigo, edificio: r.edificio_nombre, prendas: r.prendas_enviadas }),
    );
  }
  refrescar(id);
  return { ok: true };
}

export async function anularRemito(id: string, motivo: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_remito", { p_remito: id, p_motivo: motivo });
  if (error) return fallo(error);
  refrescar(id);
  return { ok: true };
}

// --- Paso B: lavadero recepciona --------------------------------------------

export async function recepcionarRemito(
  id: string,
  items: ItemConteo[],
  firma: string,
  observaciones: ObservacionInput[],
): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recepcionar_remito", {
    p_remito: id,
    p_items: items,
    p_firma: firma,
    p_observaciones: observaciones,
  });
  if (error) return fallo(error);

  const codigo = (data as { codigo: string }).codigo;
  if ((data as { conforme: boolean }).conforme) {
    await notificarWhatsApp("hotel", mensajes.recepcionConforme({ id, codigo }));
  } else {
    await notificarWhatsApp("hotel", mensajes.observacion({ id, codigo, detalle: await textoObservaciones(id, "recepcion") }));
  }
  refrescar(id);
  return { ok: true };
}

// --- Paso C: lavadero despacha / hotel valida y cierra ----------------------

export async function despacharRemito(
  id: string,
  items: ItemConteo[],
  firma: string,
  observaciones: ObservacionInput[],
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("despachar_remito", {
    p_remito: id,
    p_items: items,
    p_firma: firma,
    p_observaciones: observaciones,
  });
  if (error) return fallo(error);

  const r = await resumen(id);
  if (r) {
    await notificarWhatsApp(
      "hotel",
      mensajes.despacho({ id, codigo: r.codigo, edificio: r.edificio_nombre, prendas: r.prendas_devueltas ?? 0 }),
    );
    if (observaciones.length) {
      await notificarWhatsApp("hotel", mensajes.observacion({ id, codigo: r.codigo, detalle: await textoObservaciones(id, "despacho") }));
    }
  }
  refrescar(id);
  return { ok: true };
}

export async function cerrarRemito(
  id: string,
  items: ItemConteo[],
  firma: string,
  observaciones: ObservacionInput[],
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cerrar_remito", {
    p_remito: id,
    p_items: items,
    p_firma: firma,
    p_observaciones: observaciones,
  });
  if (error) return fallo(error);
  refrescar(id);
  return { ok: true };
}

// --- Observaciones ----------------------------------------------------------

export async function resolverObservacion(id: number, aprobar: boolean, nota?: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolver_observacion", { p_id: id, p_aprobar: aprobar, p_nota: nota ?? null });
  if (error) return fallo(error);
  refrescar();
  return { ok: true };
}
