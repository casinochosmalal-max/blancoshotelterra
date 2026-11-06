import Link from "next/link";
import { Clock, PackageCheck, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtFecha, fmtMoneda } from "@/lib/format";
import type { PendienteEntrega } from "@/types/database";
import { BotonPerdida } from "./boton-perdida";

const ESTADO_TXT = {
  pendiente: { label: "Pendiente", variant: "warning" },
  en_camino: { label: "En camino", variant: "info" },
  entregada: { label: "Entregada", variant: "success" },
  perdida: { label: "Dada por perdida", variant: "destructive" },
} as const;

/**
 * Prendas que el lavadero retuvo (manchas, relavado, demoras) y todavía no volvieron.
 * Lavadero: "A entregar". Hotel: "A recibir", con opción de darlas por perdidas.
 */
export function ListaPendientes({
  pendientes,
  titulo,
  base,
  hotel = false,
}: {
  pendientes: PendienteEntrega[];
  titulo: string;
  base: "/hotel" | "/lavadero";
  hotel?: boolean;
}) {
  if (!pendientes.length) return null;
  const total = pendientes.reduce((s, p) => s + p.cantidad, 0);
  const torres = [...new Set(pendientes.map((p) => p.edificio_nombre))];

  return (
    <Card className="border-warning/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4" /> {titulo}
          <span className="rounded-full bg-warning/20 px-2 text-xs">{total}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {hotel
            ? "Prendas que quedaron en el lavadero. Se pagan cuando se entregan."
            : "Prendas retenidas. Sumalas en el próximo despacho de esa torre."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {torres.map((t) => (
          <div key={t} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t}</p>
            <ul className="space-y-2">
              {pendientes
                .filter((p) => p.edificio_nombre === t)
                .map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.cantidad}× {p.articulo_nombre}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        De{" "}
                        <Link href={`${base}/remitos/${p.remito_origen_id}`} className="underline">
                          {p.remito_origen_codigo}
                        </Link>{" "}
                        · {fmtFecha(p.remito_origen_fecha)}
                        {p.motivo ? ` · ${p.motivo}` : ""}
                      </p>
                      {p.estado === "en_camino" && p.remito_entrega_id && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                          <Truck className="size-3" /> Viene con{" "}
                          <Link href={`${base}/remitos/${p.remito_entrega_id}`} className="underline">
                            {p.remito_entrega_codigo}
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={ESTADO_TXT[p.estado].variant}>{ESTADO_TXT[p.estado].label}</Badge>
                      {hotel && p.estado === "pendiente" && <BotonPerdida id={p.id} />}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** En el detalle de un remito: lo que quedó retenido y lo que se sumó de envíos anteriores. */
export function PendientesDelRemito({
  retenidas,
  incluidas,
  base,
}: {
  retenidas: PendienteEntrega[];
  incluidas: PendienteEntrega[];
  base: "/hotel" | "/lavadero";
}) {
  if (!retenidas.length && !incluidas.length) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        {retenidas.length > 0 && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <Clock className="size-4" /> Quedaron en el lavadero
            </p>
            {retenidas.map((p) => (
              <p key={p.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="text-foreground">
                  {p.cantidad}× {p.articulo_nombre}
                </span>
                <Badge variant={ESTADO_TXT[p.estado].variant}>{ESTADO_TXT[p.estado].label}</Badge>
                {p.remito_entrega_id && (
                  <Link href={`${base}/remitos/${p.remito_entrega_id}`} className="underline">
                    {p.remito_entrega_codigo}
                  </Link>
                )}
                <span>−{fmtMoneda(p.cantidad * p.precio_unitario)}</span>
              </p>
            ))}
          </div>
        )}
        {incluidas.length > 0 && (
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <PackageCheck className="size-4" /> Pendientes entregadas con este remito
            </p>
            {incluidas.map((p) => (
              <p key={p.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span className="text-foreground">
                  {p.cantidad}× {p.articulo_nombre}
                </span>
                de
                <Link href={`${base}/remitos/${p.remito_origen_id}`} className="underline">
                  {p.remito_origen_codigo}
                </Link>
                <span>+{fmtMoneda(p.cantidad * p.precio_unitario)}</span>
              </p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Las prendas retenidas se descuentan de este remito y se pagan en el remito con que se entregan.
        </p>
      </CardContent>
    </Card>
  );
}
