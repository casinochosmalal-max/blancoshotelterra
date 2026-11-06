"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MetodoPago } from "@/types/database";
import type { Resultado } from "./remitos";

export async function actualizarPrecio(articulo_id: number, precio: number, motivo?: string): Promise<Resultado> {
  if (!(precio >= 0)) return { ok: false, error: "Precio inválido" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_precio", {
    p_articulo: articulo_id,
    p_precio: precio,
    p_motivo: motivo ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hotel/precios");
  return { ok: true };
}

export async function guardarArticulo(input: {
  id?: number;
  codigo: string;
  nombre: string;
  categoria: "cama" | "baño" | "otros";
  precio_unitario_actual: number;
  costo_reposicion: number;
  activo: boolean;
}): Promise<Resultado> {
  const supabase = await createClient();
  const { id, ...campos } = input;
  const { error } = id
    ? await supabase.from("articulos").update(campos).eq("id", id)
    : await supabase.from("articulos").insert(campos);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hotel", "layout");
  return { ok: true };
}

export async function registrarPago(formData: FormData): Promise<Resultado> {
  const supabase = await createClient();
  const monto = Number(formData.get("monto"));
  if (!(monto > 0)) return { ok: false, error: "El monto debe ser mayor a 0" };

  let comprobante_url: string | null = null;
  const archivo = formData.get("comprobante");
  if (archivo instanceof File && archivo.size > 0) {
    const ruta = `${new Date().getFullYear()}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("comprobantes").upload(ruta, archivo, { contentType: archivo.type });
    if (error) return { ok: false, error: `No se pudo subir el comprobante: ${error.message}` };
    comprobante_url = ruta;
  }

  const periodo = String(formData.get("periodo") || "");
  const { error } = await supabase.from("pagos_lavadero").insert({
    fecha: String(formData.get("fecha")),
    monto,
    metodo: String(formData.get("metodo")) as MetodoPago,
    comprobante_nro: String(formData.get("comprobante_nro") || "") || null,
    comprobante_url,
    periodo: periodo ? `${periodo.slice(0, 7)}-01` : null,
    notas: String(formData.get("notas") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hotel/finanzas", "layout");
  return { ok: true };
}

export async function eliminarPago(id: number): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("pagos_lavadero").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hotel/finanzas", "layout");
  return { ok: true };
}

export async function urlComprobante(ruta: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("comprobantes").createSignedUrl(ruta, 60 * 5);
  return data?.signedUrl ?? null;
}
