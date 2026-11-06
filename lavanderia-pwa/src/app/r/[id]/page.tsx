import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/auth";

/** Destino de los códigos QR: abre el remito en la vista del rol logueado. */
export default async function AccesoQR({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfil();
  redirect(perfil.rol === "hotel" ? `/hotel/remitos/${id}` : `/lavadero/remitos/${id}`);
}
