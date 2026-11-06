import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResolverObservacion } from "@/components/remitos/acciones-remito";
import { TIPOS_OBS } from "@/components/remitos/constantes";
import { fmtFecha, fmtMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Observacion } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Observaciones" };

type Fila = Observacion & { remitos_envio: { codigo: string; edificio_id: number } };

export default async function ObservacionesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver = "pendiente" } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("observaciones")
    .select("*, articulos(nombre), remitos_envio(codigo, edificio_id)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (ver !== "todas") q = q.eq("estado", ver);
  const { data } = await q;
  const obs = (data ?? []) as Fila[];

  return (
    <>
      <PageHeader
        titulo="Observaciones y roturas"
        descripcion="Las roturas o faltantes a cargo del lavadero se descuentan de la liquidación al aprobarse. Las del hotel sólo dan de baja la prenda."
      />
      <div className="mb-4 flex gap-2">
        {["pendiente", "aprobada", "rechazada", "todas"].map((k) => (
          <Link
            key={k}
            href={`/hotel/observaciones?ver=${k}`}
            className={cn("rounded-full border px-3 py-1 text-xs capitalize", ver === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {k}
          </Link>
        ))}
      </div>
      <div className="space-y-2">
        {obs.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Sin observaciones.</p>}
        {obs.map((o) => (
          <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <p className="font-medium">
                {TIPOS_OBS[o.tipo]} · {o.cantidad}× {o.articulos?.nombre ?? "General"}{" "}
                <Link href={`/hotel/remitos/${o.remito_id}`} className="text-sm text-primary hover:underline">
                  {o.remitos_envio.codigo}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {o.etapa} · {fmtFecha(o.created_at, true)}
                {o.automatica && " · por diferencia de conteo"}
              </p>
              {o.descripcion && <p className="text-sm">{o.descripcion}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <Badge variant={o.responsable === "lavadero" ? "destructive" : "secondary"}>Cargo {o.responsable}</Badge>
                {Number(o.importe_cargo) > 0 && <p className="mt-1 text-sm font-semibold tabular-nums text-destructive">−{fmtMoneda(o.importe_cargo)}</p>}
              </div>
              {o.estado === "pendiente" ? <ResolverObservacion id={o.id} /> : <Badge variant={o.estado === "aprobada" ? "success" : "outline"}>{o.estado}</Badge>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
