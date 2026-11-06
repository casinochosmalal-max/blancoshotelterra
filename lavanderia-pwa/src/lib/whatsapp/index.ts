import "server-only";
import { crearProveedor } from "./providers";
import type { Destinatario } from "./types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function destinos(rol: Destinatario): string[] {
  const env = rol === "hotel" ? process.env.WHATSAPP_TO_HOTEL : process.env.WHATSAPP_TO_LAVADERO;
  return (env ?? "")
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
}

/**
 * Envía un WhatsApp a todos los números de un rol. Nunca lanza: una falla del
 * proveedor no debe bloquear la operación del remito (queda en el log).
 */
export async function notificarWhatsApp(rol: Destinatario, mensaje: string) {
  const proveedor = crearProveedor();
  const resultados = await Promise.allSettled(destinos(rol).map((n) => proveedor.enviarTexto(n, mensaje)));
  resultados.forEach((r) => {
    if (r.status === "rejected") console.error(`[whatsapp:${proveedor.nombre}]`, r.reason);
  });
}

const link = (remitoId: string) => (APP_URL ? `\n${APP_URL}/r/${remitoId}` : "");

export const mensajes = {
  nuevoEnvio: (r: { id: string; codigo: string; edificio: string; prendas: number }) =>
    `🧺 *Nuevo envío ${r.codigo}*\n${r.edificio}: ${r.prendas} prendas listas para retirar.${link(r.id)}`,

  observacion: (r: { id: string; codigo: string; detalle: string[] }) =>
    `⚠️ *Observaciones en ${r.codigo}*\n${r.detalle.map((d) => `• ${d}`).join("\n")}${link(r.id)}`,

  recepcionConforme: (r: { id: string; codigo: string }) => `✅ Remito *${r.codigo}* recibido conforme por el lavadero.${link(r.id)}`,

  despacho: (r: { id: string; codigo: string; edificio: string; prendas: number }) =>
    `🚚 *Ropa limpia en camino · ${r.codigo}*\n${r.edificio}: ${r.prendas} prendas despachadas. Validar ingreso al depósito.${link(r.id)}`,
};
