import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PagoForm } from "@/components/finanzas/pago-form";
import { AccionesPago } from "@/components/finanzas/acciones-pago";
import { METODOS_PAGO } from "@/components/remitos/constantes";
import { fmtFecha, fmtMoneda, fmtPeriodo } from "@/lib/format";
import type { MovimientoCuenta, Pago } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagos" };

export default async function PagosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo } = await searchParams;
  const supabase = await createClient();
  const [{ data: pagos }, { data: cc }, { data: hoy }] = await Promise.all([
    supabase.from("pagos_lavadero").select("*").order("fecha", { ascending: false }).limit(100),
    supabase.from("v_cuenta_corriente").select("*"),
    supabase.rpc("hoy"),
  ]);
  const movs = (cc ?? []) as MovimientoCuenta[];
  const totalDebe = movs.reduce((s, m) => s + Number(m.debe), 0);
  const totalHaber = movs.reduce((s, m) => s + Number(m.haber), 0);

  return (
    <>
      <PageHeader titulo="Pagos y cuenta corriente" descripcion="Registro de pagos al lavadero y saldo histórico." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total liquidado" value={fmtMoneda(totalDebe)} />
        <Stat label="Total pagado" value={fmtMoneda(totalHaber)} tone="success" />
        <Stat label="Saldo pendiente" value={fmtMoneda(totalDebe - totalHaber)} tone={totalDebe - totalHaber > 0 ? "warning" : "success"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pagos registrados</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Imputado a</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {((pagos ?? []) as Pago[]).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtFecha(p.fecha)}</TableCell>
                    <TableCell>{METODOS_PAGO[p.metodo]}</TableCell>
                    <TableCell className="text-xs">{p.comprobante_nro ?? "—"}</TableCell>
                    <TableCell className="text-xs">{p.periodo ? fmtPeriodo(p.periodo) : "mes del pago"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtMoneda(p.monto)}</TableCell>
                    <TableCell>
                      <AccionesPago id={p.id} comprobante={p.comprobante_url} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cuenta corriente</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{fmtFecha(m.fecha)}</TableCell>
                    <TableCell>{m.concepto}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(m.debe) ? fmtMoneda(m.debe) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{Number(m.haber) ? fmtMoneda(m.haber) : ""}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtMoneda(m.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PagoForm hoy={hoy as string} periodo={periodo} />
        </div>
      </div>
    </>
  );
}
