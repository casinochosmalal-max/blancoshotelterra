import { Inbox, Shirt, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RemitoCard } from "@/components/remitos/remito-card";
import { ListaPendientes } from "@/components/remitos/pendientes";
import { cargarPendientesAbiertas } from "@/lib/queries";
import type { RemitoVista } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function LavaderoInicio() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_remitos")
    .select("*")
    .in("estado", ["enviado", "recibido", "despachado", "cerrado"])
    .order("fecha", { ascending: false })
    .order("nro_envio_dia", { ascending: false })
    .limit(60);
  const remitos = (data ?? []) as RemitoVista[];
  const pendientes = await cargarPendientesAbiertas();

  const secciones = [
    { titulo: "Por recibir", icono: Inbox, estados: ["enviado"], accion: "Tocar para contar y firmar" },
    { titulo: "En lavado", icono: Shirt, estados: ["recibido"], accion: "Tocar para despachar ropa limpia" },
    { titulo: "Despachados · esperando validación del hotel", icono: Truck, estados: ["despachado"] },
  ] as const;

  const cerrados = remitos.filter((r) => r.estado === "cerrado").slice(0, 10);

  return (
    <div className="space-y-6">
      <ListaPendientes pendientes={pendientes} titulo="A entregar" base="/lavadero" />
      {secciones.map((s) => {
        const lista = remitos.filter((r) => (s.estados as readonly string[]).includes(r.estado));
        return (
          <section key={s.titulo} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <s.icono className="size-4" /> {s.titulo}
              <span className="rounded-full bg-muted px-2 text-xs">{lista.length}</span>
            </h2>
            {lista.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nada por aquí</p>
            ) : (
              lista.map((r) => <RemitoCard key={r.id} r={r} href={`/lavadero/remitos/${r.id}`} accion={"accion" in s ? s.accion : undefined} />)
            )}
          </section>
        );
      })}
      {cerrados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Últimos cerrados</h2>
          {cerrados.map((r) => (
            <RemitoCard key={r.id} r={r} href={`/lavadero/remitos/${r.id}`} />
          ))}
        </section>
      )}
    </div>
  );
}
