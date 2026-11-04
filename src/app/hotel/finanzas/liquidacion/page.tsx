import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotonImprimir } from "@/components/finanzas/imprimir";
import { TIPOS_OBS, METODOS_PAGO } from "@/components/remitos/constantes";
import { fmtFecha, fmtMoneda, fmtPeriodo, inicioMes } from "@/lib/format";
import type { LiquidacionMensual, Observacion, Pago, RemitoVista } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liquidación mensual" };

function mover(periodo: string, delta: number) {
  const d = new Date(`${periodo}T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function Liquidacion({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const sp = await searchParams;
  const periodo = inicioMes(sp.periodo);
  const fin = `${mover(periodo, 1)}-01`;
  const supabase = await createClient();

  const [{ data: liq }, { data: remitos }, { data: cargos }, { data: pagos }, { data: saldoPrevio }] = await Promise.all([
    supabase.from("v_liquidacion_mensual").select("*").eq("periodo", periodo).order("edificio_codigo"),
    supabase.from("v_remitos").select("*").eq("estado", "cerrado").gte("fecha", periodo).lt("fecha", fin).order("fecha"),
    supabase
      .from("observaciones")
      .select("*, articulos(nombre), remitos_envio!inner(codigo, fecha, estado)")
      .eq("estado", "aprobada")
      .gt("importe_cargo", 0)
      .eq("remitos_envio.estado", "cerrado")
      .gte("remitos_envio.fecha", periodo)
      .lt("remitos_envio.fecha", fin),
    supabase.from("pagos_lavadero").select("*").or(`periodo.eq.${periodo},and(periodo.is.null,fecha.gte.${periodo},fecha.lt.${fin})`).order("fecha"),
    supabase.from("v_conciliacion_mensual").select("saldo").lt("periodo", periodo),
  ]);

  const filas = (liq ?? []) as LiquidacionMensual[];
  const lavado = filas.reduce((s, f) => s + Number(f.importe_lavado), 0);
  const totCargos = filas.reduce((s, f) => s + Number(f.cargos_lavadero), 0);
  const neto = lavado - totCargos;
  const pagado = ((pagos ?? []) as Pago[]).reduce((s, p) => s + Number(p.monto), 0);
  const anterior = (saldoPrevio ?? []).reduce((s, r) => s + Number(r.saldo), 0);

  return (
    <>
      <PageHeader titulo={`Liquidación · ${fmtPeriodo(periodo)}`} descripcion="Pre-factura del lavadero: remitos cerrados del mes, cargos y pagos imputados.">
        <div className="flex items-center gap-1 print:hidden">
          <Button asChild variant="outline" size="icon">
            <Link href={`?periodo=${mover(periodo, -1)}`} aria-label="Mes anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon">
            <Link href={`?periodo=${mover(periodo, 1)}`} aria-label="Mes siguiente">
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <BotonImprimir />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen por edificio</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Edificio</TableHead>
                  <TableHead className="text-right">Remitos</TableHead>
                  <TableHead className="text-right">Prendas</TableHead>
                  <TableHead className="text-right">Lavado</TableHead>
                  <TableHead className="text-right">Cargos</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                      Sin remitos cerrados en el período.
                    </TableCell>
                  </TableRow>
                )}
                {filas.map((f) => (
                  <TableRow key={f.edificio_id}>
                    <TableCell className="font-medium">{f.edificio_nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.remitos}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.prendas}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoneda(f.importe_lavado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">−{fmtMoneda(f.cargos_lavadero)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtMoneda(f.neto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Remitos cerrados ({remitos?.length ?? 0})</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remito</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead className="text-right">Prendas recibidas</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((remitos ?? []) as RemitoVista[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/hotel/remitos/${r.id}`} className="font-medium hover:underline">
                        {r.codigo}
                      </Link>
                    </TableCell>
                    <TableCell>{fmtFecha(r.fecha)}</TableCell>
                    <TableCell>{r.edificio_codigo}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.prendas_recibidas}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoneda(r.importe)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Total lavado</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoneda(lavado)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cargos al lavadero (roturas / faltantes aprobados)</CardTitle>
            </CardHeader>
            <Table>
              <TableBody>
                {(cargos ?? []).length === 0 && (
                  <TableRow>
                    <TableCell className="py-4 text-center text-muted-foreground">Sin cargos.</TableCell>
                  </TableRow>
                )}
                {((cargos ?? []) as (Observacion & { remitos_envio: { codigo: string } })[]).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.remitos_envio.codigo}</TableCell>
                    <TableCell>
                      {TIPOS_OBS[o.tipo]} · {o.cantidad}× {o.articulos?.nombre}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMoneda(o.cargo_unitario)} c/u</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">−{fmtMoneda(o.importe_cargo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Total a pagar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Linea k="Lavado del período" v={fmtMoneda(lavado)} />
            <Linea k="Cargos por roturas/faltantes" v={`−${fmtMoneda(totCargos)}`} className="text-destructive" />
            <Linea k="Neto del período" v={fmtMoneda(neto)} fuerte />
            <Linea k="Pagos imputados" v={`−${fmtMoneda(pagado)}`} />
            {((pagos ?? []) as Pago[]).map((p) => (
              <p key={p.id} className="pl-3 text-xs text-muted-foreground">
                {fmtFecha(p.fecha)} · {METODOS_PAGO[p.metodo]} · {fmtMoneda(p.monto)}
              </p>
            ))}
            <Linea k="Saldo del período" v={fmtMoneda(neto - pagado)} fuerte />
            <Linea k="Saldo de meses anteriores" v={fmtMoneda(anterior)} />
            <div className="mt-2 rounded-lg bg-primary/10 p-3">
              <Linea k="Saldo total adeudado" v={fmtMoneda(anterior + neto - pagado)} fuerte />
            </div>
            <Button asChild className="mt-2 w-full print:hidden">
              <Link href={`/hotel/finanzas/pagos?periodo=${periodo.slice(0, 7)}`}>Registrar pago</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Linea({ k, v, fuerte, className }: { k: string; v: string; fuerte?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? "border-t pt-2 font-semibold" : ""} ${className ?? ""}`}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}
