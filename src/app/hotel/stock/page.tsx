import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertasStock } from "@/components/stock/alertas-stock";
import { MinimoEditable } from "@/components/stock/minimo-editable";
import { TransferenciaForm } from "@/components/stock/transferencia-form";
import { UBICACIONES } from "@/components/remitos/constantes";
import { fmtFecha } from "@/lib/format";
import { cn, conStockPrimero } from "@/lib/utils";
import type { AlertaStock, Edificio, StockResumen, Ubicacion } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const supabase = await createClient();
  const { data: edificios } = await supabase.from("edificios").select("*").eq("activo", true).order("codigo");
  const lista = (edificios ?? []) as Edificio[];
  const { e } = await searchParams;
  const edificio = lista.find((x) => x.codigo === e) ?? lista[0];
  if (!edificio) return <p>No hay edificios cargados.</p>;

  const [{ data: stock }, { data: alertas }, { data: movs }] = await Promise.all([
    supabase.from("v_stock_resumen").select("*").eq("edificio_id", edificio.id).order("orden"),
    supabase.from("v_alertas_stock").select("*").eq("edificio_id", edificio.id),
    supabase
      .from("movimientos_stock")
      .select("id, tipo, origen, destino, cantidad, motivo, created_at, articulos(nombre)")
      .eq("edificio_id", edificio.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const filas = conStockPrimero((stock ?? []) as StockResumen[]);
  const sum = (k: "habitaciones" | "deposito" | "lavadero" | "total") => filas.reduce((a, f) => a + f[k], 0);

  return (
    <>
      <PageHeader titulo="Stock de ropa blanca" descripcion="Por edificio y ubicación. El mínimo de seguridad aplica al depósito central.">
        <div className="flex rounded-lg border p-1">
          {lista.map((x) => (
            <Link
              key={x.id}
              href={`/hotel/stock?e=${x.codigo}`}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium", x.id === edificio.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              {x.nombre}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead className="text-right">Habitaciones</TableHead>
                <TableHead className="min-w-40">Depósito central</TableHead>
                <TableHead className="text-right">En lavadero</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => {
                const pct = f.stock_minimo ? Math.min(100, (f.deposito / (f.stock_minimo * 2)) * 100) : 100;
                return (
                  <TableRow key={f.articulo_id} className={cn(f.bajo_minimo && "bg-destructive/5")}>
                    <TableCell className="font-medium">
                      {f.articulo_nombre}
                      {f.bajo_minimo && (
                        <Badge variant="destructive" className="ml-2">
                          bajo mínimo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.habitaciones}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-10 text-right font-semibold tabular-nums">{f.deposito}</span>
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", f.bajo_minimo ? "bg-destructive" : pct < 75 ? "bg-warning" : "bg-success")}
                            style={{ width: `${pct}%` }}
                          />
                          {f.stock_minimo > 0 && <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" title="mínimo" />}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.lavadero}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{f.total}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <MinimoEditable edificioId={edificio.id} articuloId={f.articulo_id} valor={f.stock_minimo} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{sum("habitaciones")}</TableCell>
                <TableCell className="tabular-nums">
                  <span className="inline-block w-10 text-right">{sum("deposito")}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{sum("lavadero")}</TableCell>
                <TableCell className="text-right tabular-nums">{sum("total")}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>

        <div className="space-y-6">
          <AlertasStock alertas={(alertas ?? []) as AlertaStock[]} />
          <TransferenciaForm edificioId={edificio.id} articulos={filas.map((f) => ({ id: f.articulo_id, nombre: f.articulo_nombre }))} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos movimientos · {edificio.nombre}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Artículo</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(movs ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmtFecha(m.created_at, true)}</TableCell>
                  <TableCell>{(m.articulos as unknown as { nombre: string } | null)?.nombre}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {m.origen ? UBICACIONES[m.origen as Ubicacion] : "Alta"} → {m.destino ? UBICACIONES[m.destino as Ubicacion] : "Baja"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.cantidad}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.motivo}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
