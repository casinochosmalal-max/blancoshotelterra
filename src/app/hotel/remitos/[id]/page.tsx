import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cargarPendientesRemito, cargarRemito } from "@/lib/queries";
import { PendientesDelRemito } from "@/components/remitos/pendientes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoBadge, PasosRemito } from "@/components/remitos/estado-badge";
import { ListaObservaciones, TablaDetalle } from "@/components/remitos/detalle-remito";
import { AccionesRemito, ResolverObservacion } from "@/components/remitos/acciones-remito";
import { ConteoRemito } from "@/components/remitos/conteo-remito";
import { BotonPDF } from "@/components/remitos/boton-pdf";
import { RemitoQR } from "@/components/remitos/remito-qr";
import { UBICACIONES } from "@/components/remitos/constantes";
import { fmtFecha, fmtMoneda } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RemitoHotel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { remito, detalle, observaciones } = await cargarRemito(id);
  const pend = await cargarPendientesRemito(remito);
  const cargos = observaciones.filter((o) => o.estado === "aprobada").reduce((s, o) => s + Number(o.importe_cargo), 0);

  const hitos = [
    ["Creado", remito.created_at],
    ["Enviado", remito.enviado_at],
    ["Recibido por lavadero", remito.recibido_at],
    ["Despachado", remito.despachado_at],
    ["Cerrado", remito.cerrado_at],
  ] as const;
  const firmas = [
    ["Recepción lavadero", remito.firma_recepcion],
    ["Despacho lavadero", remito.firma_despacho],
    ["Recepción hotel", remito.firma_cierre],
  ] as const;

  return (
    <div className="space-y-6">
      <Link href="/hotel/remitos" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Remitos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{remito.codigo}</h1>
            <EstadoBadge estado={remito.estado} />
          </div>
          <p className="text-sm text-muted-foreground">
            {remito.edificio_nombre} · {fmtFecha(remito.fecha)} · envío {remito.nro_envio_dia}/2 · desde {UBICACIONES[remito.ubicacion_origen]}
          </p>
          {remito.anulado_motivo && <p className="text-sm text-destructive">Anulado: {remito.anulado_motivo}</p>}
          <div className="w-72">
            <PasosRemito estado={remito.estado} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AccionesRemito id={remito.id} estado={remito.estado} />
          <BotonPDF remito={remito} detalle={detalle} observaciones={observaciones} />
          <RemitoQR id={remito.id} size={88} />
        </div>
      </div>

      {remito.estado === "despachado" ? (
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-2 font-semibold">Paso C · Validá el ingreso al depósito central</h2>
          <ConteoRemito
            remito={remito}
            detalle={detalle}
            etapa="validacion"
            observacionesPrevias={observaciones}
            pendientes={pend.enCamino}
            volverA="/hotel"
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <TablaDetalle detalle={detalle} conPrecios />
            <div className="flex justify-end gap-6 border-t p-4 text-sm">
              <span>
                Lavado: <b>{fmtMoneda(remito.importe)}</b>
              </span>
              {cargos > 0 && (
                <span className="text-destructive">
                  Cargos lavadero: <b>−{fmtMoneda(cargos)}</b>
                </span>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Trazabilidad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="space-y-1.5">
                {hitos.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className={v ? "" : "text-muted-foreground"}>{k}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtFecha(v, true)}</span>
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-3 gap-2 pt-2">
                {firmas.map(([k, src]) => (
                  <figure key={k} className="text-center">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={`Firma ${k}`} className="h-14 w-full rounded border bg-white object-contain" />
                    ) : (
                      <div className="h-14 rounded border border-dashed" />
                    )}
                    <figcaption className="mt-1 text-[10px] text-muted-foreground">{k}</figcaption>
                  </figure>
                ))}
              </div>
              {remito.notas && <p className="rounded-md bg-muted p-2">📝 {remito.notas}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {remito.estado !== "despachado" && (
        <PendientesDelRemito retenidas={pend.retenidas} incluidas={[...pend.enCamino, ...pend.incluidas]} base="/hotel" />
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Observaciones</h2>
        <ListaObservaciones observaciones={observaciones} acciones={(o) => (o.estado === "pendiente" ? <ResolverObservacion id={o.id} /> : null)} />
      </section>
    </div>
  );
}
