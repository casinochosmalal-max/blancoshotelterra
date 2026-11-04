import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cargarRemito } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { ConteoRemito } from "@/components/remitos/conteo-remito";
import { EstadoBadge, PasosRemito } from "@/components/remitos/estado-badge";
import { ListaObservaciones, TablaDetalle } from "@/components/remitos/detalle-remito";
import { BotonPDF } from "@/components/remitos/boton-pdf";
import { RemitoQR } from "@/components/remitos/remito-qr";
import { fmtFecha } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RemitoLavadero({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { remito, detalle, observaciones } = await cargarRemito(id);
  const editable = remito.estado === "enviado" || remito.estado === "recibido";

  return (
    <div className="space-y-4">
      <Link href="/lavadero" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Remitos
      </Link>

      <Card className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-bold">{remito.codigo}</p>
            <p className="text-sm text-muted-foreground">
              {remito.edificio_nombre} · {fmtFecha(remito.fecha)}
            </p>
            <div className="mt-2">
              <EstadoBadge estado={remito.estado} />
            </div>
          </div>
          <RemitoQR id={remito.id} size={72} />
        </div>
        <PasosRemito estado={remito.estado} />
        {remito.notas && <p className="rounded-md bg-muted p-2 text-sm">📝 {remito.notas}</p>}
      </Card>

      {remito.estado === "enviado" && (
        <ConteoRemito remito={remito} detalle={detalle} etapa="recepcion" volverA="/lavadero" />
      )}
      {remito.estado === "recibido" && (
        <ConteoRemito remito={remito} detalle={detalle} etapa="despacho" observacionesPrevias={observaciones} volverA="/lavadero" />
      )}

      {!editable && (
        <>
          <Card className="p-2">
            <TablaDetalle detalle={detalle} />
          </Card>
          <BotonPDF remito={remito} detalle={detalle} observaciones={observaciones} className="w-full" size="lg" />
        </>
      )}

      {observaciones.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Observaciones registradas</h2>
          <ListaObservaciones observaciones={observaciones} />
        </section>
      )}
    </div>
  );
}
