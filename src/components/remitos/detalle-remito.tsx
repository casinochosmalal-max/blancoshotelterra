import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtFecha, fmtMoneda } from "@/lib/format";
import type { DetalleRemito, Observacion } from "@/types/database";
import { TIPOS_OBS } from "./constantes";

export function TablaDetalle({ detalle, conPrecios = false }: { detalle: DetalleRemito[]; conPrecios?: boolean }) {
  const total = (k: keyof DetalleRemito) => detalle.reduce((s, d) => s + Number(d[k] ?? 0), 0);
  const celda = (v: number | null, ref?: number | null) => (
    <TableCell className={`text-right tabular-nums ${v != null && ref != null && v !== ref ? "font-semibold text-destructive" : ""}`}>
      {v ?? "—"}
    </TableCell>
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Artículo</TableHead>
          <TableHead className="text-right">Enviado</TableHead>
          <TableHead className="text-right">Recibido</TableHead>
          <TableHead className="text-right">Devuelto</TableHead>
          <TableHead className="text-right">Validado</TableHead>
          {conPrecios && <TableHead className="text-right">P. unit.</TableHead>}
          {conPrecios && <TableHead className="text-right">Subtotal</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {detalle.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">{d.articulos?.nombre}</TableCell>
            {celda(d.cantidad_enviada)}
            {celda(d.cantidad_recibida, d.cantidad_enviada)}
            {celda(d.cantidad_devuelta, d.cantidad_recibida)}
            {celda(d.cantidad_validada, d.cantidad_devuelta)}
            {conPrecios && <TableCell className="text-right tabular-nums">{fmtMoneda(d.precio_unitario_historico)}</TableCell>}
            {conPrecios && <TableCell className="text-right tabular-nums">{fmtMoneda(d.subtotal)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">{total("cantidad_enviada")}</TableCell>
          <TableCell className="text-right tabular-nums">{total("cantidad_recibida")}</TableCell>
          <TableCell className="text-right tabular-nums">{total("cantidad_devuelta")}</TableCell>
          <TableCell className="text-right tabular-nums">{total("cantidad_validada")}</TableCell>
          {conPrecios && <TableCell />}
          {conPrecios && <TableCell className="text-right tabular-nums">{fmtMoneda(total("subtotal"))}</TableCell>}
        </TableRow>
      </TableFooter>
    </Table>
  );
}

const ESTADO_OBS = { pendiente: "warning", aprobada: "success", rechazada: "secondary" } as const;

export function ListaObservaciones({
  observaciones,
  acciones,
}: {
  observaciones: Observacion[];
  acciones?: (o: Observacion) => React.ReactNode;
}) {
  if (!observaciones.length) return <p className="text-sm text-muted-foreground">Sin observaciones.</p>;
  return (
    <ul className="space-y-2">
      {observaciones.map((o) => (
        <li key={o.id}>
          <Card className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">
                {TIPOS_OBS[o.tipo]} · {o.cantidad}× {o.articulos?.nombre ?? "General"}
              </p>
              <p className="text-xs text-muted-foreground">
                {o.etapa} · {fmtFecha(o.created_at, true)} · a cargo de <b>{o.responsable}</b>
                {o.automatica && " · generada por diferencia de conteo"}
              </p>
              {o.descripcion && <p className="text-xs">{o.descripcion}</p>}
              {Number(o.importe_cargo) > 0 && <p className="text-xs font-semibold text-destructive">Cargo: {fmtMoneda(o.importe_cargo)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={ESTADO_OBS[o.estado]}>{o.estado}</Badge>
              {acciones?.(o)}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
