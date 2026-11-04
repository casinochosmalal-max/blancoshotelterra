"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Ubicacion } from "@/types/database";
import type { Resultado } from "./remitos";

export async function transferirStock(input: {
  edificio_id: number;
  articulo_id: number;
  origen: Ubicacion | null;
  destino: Ubicacion | null;
  cantidad: number;
  motivo?: string;
}): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transferir_stock", {
    p_edificio: input.edificio_id,
    p_articulo: input.articulo_id,
    p_origen: input.origen,
    p_destino: input.destino,
    p_cantidad: input.cantidad,
    p_motivo: input.motivo ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hotel", "layout");
  return { ok: true };
}

export async function actualizarStockMinimo(edificio_id: number, articulo_id: number, minimo: number): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_edificio")
    .update({ stock_minimo: Math.max(0, Math.floor(minimo)) })
    .match({ edificio_id, articulo_id, ubicacion: "deposito" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hotel", "layout");
  return { ok: true };
}
