import Link from "next/link";
import { Boxes, ClipboardList, MessageSquareWarning, Plus, Shirt, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { AlertasStock } from "@/components/stock/alertas-stock";
import { RemitoCard } from "@/components/remitos/remito-card";
import { fmtMoneda, fmtNumero, inicioMes } from "@/lib/format";
import type { AlertaStock, ConciliacionMensual, RemitoVista, StockResumen } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function HotelDashboard() {
  const supabase = await createClient();
  const [{ data: stock }, { data: alertas }, { data: activos }, { count: obsPend }, { data: conc }] = await Promise.all([
    supabase.from("v_stock_resumen").select("*"),
    supabase.from("v_alertas_stock").select("*").order("nivel"),
    supabase.from("v_remitos").select("*").in("estado", ["borrador", "enviado", "recibido", "despachado"]).order("fecha", { ascending: false }),
    supabase.from("observaciones").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    supabase.from("v_conciliacion_mensual").select("*").order("periodo", { ascending: false }),
  ]);

  const s = (stock ?? []) as StockResumen[];
  const total = (k: "deposito" | "lavadero" | "habitaciones") => s.reduce((a, r) => a + r[k], 0);
  const mes = ((conc ?? []) as ConciliacionMensual[]).find((c) => c.periodo.slice(0, 10) === inicioMes());
  const saldo = ((conc ?? []) as ConciliacionMensual[]).reduce((a, c) => a + Number(c.saldo), 0);
  const remitos = (activos ?? []) as RemitoVista[];
  const porValidar = remitos.filter((r) => r.estado === "despachado");

  return (
    <>
      <PageHeader titulo="Panel general" descripcion="Ambos edificios · actualizado en tiempo real">
        <Button asChild>
          <Link href="/hotel/remitos/nuevo">
            <Plus /> Nuevo envío
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Depósito central" value={fmtNumero(total("deposito"))} hint="prendas limpias disponibles" icon={Boxes} />
        <Stat label="En lavadero" value={fmtNumero(total("lavadero"))} hint={`${remitos.length} remitos abiertos`} icon={Shirt} />
        <Stat label="En habitaciones" value={fmtNumero(total("habitaciones"))} icon={ClipboardList} />
        <Stat
          label="Observaciones"
          value={obsPend ?? 0}
          hint="pendientes de aprobar"
          icon={MessageSquareWarning}
          tone={obsPend ? "warning" : "default"}
        />
        <Stat
          label="Gasto del mes"
          value={fmtMoneda(mes?.neto ?? 0)}
          hint={`Saldo a pagar: ${fmtMoneda(saldo)}`}
          icon={Wallet}
          tone={saldo > 0 ? "warning" : "success"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Remitos en curso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {porValidar.length > 0 && (
              <p className="rounded-md bg-primary/10 p-2 text-sm text-primary">
                {porValidar.length} remito(s) despachado(s) esperan tu validación de ingreso al depósito.
              </p>
            )}
            {remitos.length === 0 && <p className="text-sm text-muted-foreground">No hay remitos abiertos.</p>}
            {remitos.map((r) => (
              <RemitoCard key={r.id} r={r} href={`/hotel/remitos/${r.id}`} accion={r.estado === "despachado" ? "Validar ingreso" : r.estado === "borrador" ? "Completar y enviar" : undefined} />
            ))}
          </CardContent>
        </Card>
        <AlertasStock alertas={(alertas ?? []) as AlertaStock[]} compacto />
      </div>
    </>
  );
}
