import Link from "next/link";
import { AlertOctagon, CalendarDays, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraficoArticulos, GraficoGastoMensual, type PuntoMensual } from "@/components/finanzas/grafico-gasto";
import { fmtMoneda, fmtPeriodo, inicioMes } from "@/lib/format";
import type { ConciliacionMensual, LiquidacionMensual } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finanzas" };

const ESTADO = { pagado: "success", parcial: "warning", pendiente: "destructive" } as const;

export default async function FinanzasDashboard() {
  const supabase = await createClient();
  const mesActual = inicioMes();
  const anio = mesActual.slice(0, 4);
  const [{ data: liq }, { data: conc }, { data: arts }] = await Promise.all([
    supabase.from("v_liquidacion_mensual").select("*").order("periodo"),
    supabase.from("v_conciliacion_mensual").select("*").order("periodo", { ascending: false }),
    supabase.from("v_gasto_articulo_mensual").select("articulo_nombre, importe").gte("periodo", `${anio}-01-01`),
  ]);
  const liquidaciones = (liq ?? []) as LiquidacionMensual[];
  const conciliacion = (conc ?? []) as ConciliacionMensual[];

  // Serie mensual (últimos 12 meses) por edificio
  const edificios = [...new Set(liquidaciones.map((l) => l.edificio_nombre))].sort();
  const porMes = new Map<string, PuntoMensual>();
  liquidaciones.slice(-24).forEach((l) => {
    const k = l.periodo.slice(0, 7);
    const p = porMes.get(k) ?? { mes: new Date(`${k}-15`).toLocaleDateString("es-AR", { month: "short", year: "2-digit" }) };
    p[l.edificio_nombre] = Number(l.neto);
    porMes.set(k, p);
  });
  const serie = [...porMes.values()].slice(-12);

  const delMes = conciliacion.find((c) => c.periodo.slice(0, 10) === mesActual);
  const delAnio = conciliacion.filter((c) => c.periodo.startsWith(anio));
  const acumuladoAnio = delAnio.reduce((s, c) => s + Number(c.neto), 0);
  const historico = conciliacion.reduce((s, c) => s + Number(c.neto), 0);
  const saldo = conciliacion.reduce((s, c) => s + Number(c.saldo), 0);
  const cargosAnio = delAnio.reduce((s, c) => s + Number(c.cargos_lavadero), 0);

  const porArticulo = Object.entries(
    (arts ?? []).reduce<Record<string, number>>((acc, a) => ((acc[a.articulo_nombre] = (acc[a.articulo_nombre] ?? 0) + Number(a.importe)), acc), {}),
  )
    .map(([articulo, importe]) => ({ articulo, importe }))
    .sort((a, b) => b.importe - a.importe);

  const mesActualPorEdificio = liquidaciones.filter((l) => l.periodo.slice(0, 10) === mesActual);

  return (
    <>
      <PageHeader titulo="Finanzas del lavadero" descripcion="Gasto neto = lavado de remitos cerrados − cargos por roturas/faltantes del lavadero." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Mes en curso"
          value={fmtMoneda(delMes?.neto ?? 0)}
          hint={mesActualPorEdificio.map((l) => `${l.edificio_codigo}: ${fmtMoneda(l.neto)}`).join(" · ") || "sin remitos cerrados"}
          icon={CalendarDays}
        />
        <Stat label={`Acumulado ${anio}`} value={fmtMoneda(acumuladoAnio)} hint={`Histórico: ${fmtMoneda(historico)}`} icon={TrendingUp} />
        <Stat label="Saldo pendiente" value={fmtMoneda(saldo)} hint="liquidado − pagado" icon={Wallet} tone={saldo > 0 ? "warning" : "success"} />
        <Stat label={`Cargos al lavadero ${anio}`} value={fmtMoneda(cargosAnio)} hint="roturas y faltantes aprobados" icon={AlertOctagon} tone={cargosAnio ? "danger" : "default"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gasto neto mensual por edificio</CardTitle>
            <CardDescription>Últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoGastoMensual datos={serie} edificios={edificios} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gasto por artículo · {anio}</CardTitle>
            <CardDescription>Ambos edificios</CardDescription>
          </CardHeader>
          <CardContent>
            <GraficoArticulos datos={porArticulo} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PiggyBank className="size-4" /> Conciliación mensual
            </CardTitle>
            <CardDescription>Pendiente vs. pagado por período</CardDescription>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Remitos</TableHead>
              <TableHead className="text-right">Lavado</TableHead>
              <TableHead className="text-right">Cargos</TableHead>
              <TableHead className="text-right">Neto</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conciliacion.map((c) => (
              <TableRow key={c.periodo}>
                <TableCell>
                  <Link href={`/hotel/finanzas/liquidacion?periodo=${c.periodo.slice(0, 7)}`} className="font-medium hover:underline">
                    {fmtPeriodo(c.periodo)}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.remitos}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoneda(c.importe_lavado)}</TableCell>
                <TableCell className="text-right tabular-nums text-destructive">{Number(c.cargos_lavadero) ? `−${fmtMoneda(c.cargos_lavadero)}` : "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{fmtMoneda(c.neto)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoneda(c.pagado)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{fmtMoneda(c.saldo)}</TableCell>
                <TableCell>
                  <Badge variant={ESTADO[c.estado]}>{c.estado}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
