import Link from "next/link";
import { Banknote, Clock, HandCoins, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { fmtFecha, fmtMoneda, fmtNumero, fmtPeriodo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { METODOS_PAGO } from "@/components/remitos/constantes";
import type { MetodoPago, RemitoVista } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumen" };

type Vista = "semana" | "mes";

interface Fila {
  clave: string;
  etiqueta: string;
  remitos: number;
  prendas: number;
  lavado: number;
  descuentos: number;
  pagos: number;
}

/** Lunes de la semana de una fecha "YYYY-MM-DD". */
function lunes(fecha: string) {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function clave(fecha: string, vista: Vista) {
  return vista === "mes" ? `${fecha.slice(0, 7)}-01` : lunes(fecha);
}

function etiqueta(k: string, vista: Vista) {
  if (vista === "mes") return fmtPeriodo(k);
  const fin = new Date(`${k}T12:00:00`);
  fin.setDate(fin.getDate() + 6);
  const corto = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  return `${corto(new Date(`${k}T12:00:00`))} al ${corto(fin)}`;
}

export default async function ResumenLavadero({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const vista: Vista = v === "semana" ? "semana" : "mes";
  const supabase = await createClient();

  const [{ data: rem }, { data: obs }, { data: pag }] = await Promise.all([
    supabase.from("v_remitos").select("*").in("estado", ["despachado", "cerrado"]).order("fecha", { ascending: false }),
    supabase.from("observaciones").select("remito_id, importe_cargo").eq("estado", "aprobada").gt("importe_cargo", 0),
    supabase.rpc("pagos_recibidos"),
  ]);
  const remitos = (rem ?? []) as RemitoVista[];
  const cerrados = remitos.filter((r) => r.estado === "cerrado");
  const aValidar = remitos.filter((r) => r.estado === "despachado");
  const pagos = (pag ?? []) as { fecha: string; monto: number; metodo: MetodoPago; comprobante_nro: string | null }[];

  // Descuentos (roturas/faltantes a cargo del lavadero) por remito cerrado
  const cargoPorRemito = new Map<string, number>();
  (obs ?? []).forEach((o) => cargoPorRemito.set(o.remito_id, (cargoPorRemito.get(o.remito_id) ?? 0) + Number(o.importe_cargo)));

  const filas = new Map<string, Fila>();
  const fila = (k: string) => {
    let f = filas.get(k);
    if (!f) filas.set(k, (f = { clave: k, etiqueta: etiqueta(k, vista), remitos: 0, prendas: 0, lavado: 0, descuentos: 0, pagos: 0 }));
    return f;
  };
  cerrados.forEach((r) => {
    const f = fila(clave(r.fecha, vista));
    f.remitos += 1;
    f.prendas += r.prendas_recibidas ?? 0;
    f.lavado += Number(r.importe);
    f.descuentos += cargoPorRemito.get(r.id) ?? 0;
  });
  pagos.forEach((p) => (fila(clave(p.fecha, vista)).pagos += Number(p.monto)));
  const lista = [...filas.values()].sort((a, b) => b.clave.localeCompare(a.clave)).slice(0, vista === "mes" ? 12 : 16);

  const totalLavado = cerrados.reduce((s, r) => s + Number(r.importe), 0);
  const totalDesc = cerrados.reduce((s, r) => s + (cargoPorRemito.get(r.id) ?? 0), 0);
  const totalPagos = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const saldo = totalLavado - totalDesc - totalPagos;
  const montoAValidar = aValidar.reduce((s, r) => s + Number(r.importe), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Resumen de trabajos</h1>
        <p className="text-sm text-muted-foreground">Remitos cerrados por el hotel, descuentos y pagos recibidos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Trabajado" value={fmtMoneda(totalLavado - totalDesc)} hint={`${cerrados.length} remitos cerrados`} icon={Banknote} />
        <Stat label="Cobrado" value={fmtMoneda(totalPagos)} hint={`${pagos.length} pagos`} icon={HandCoins} />
        <Stat label="Saldo a cobrar" value={fmtMoneda(saldo)} icon={Wallet} tone={saldo > 0 ? "warning" : "success"} />
        <Stat
          label="Pendiente de validar"
          value={fmtMoneda(montoAValidar)}
          hint={`${aValidar.length} remito(s) despachados`}
          icon={Clock}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Por {vista === "mes" ? "mes" : "semana"}</CardTitle>
          <div className="flex rounded-lg border p-1 text-sm">
            {(["semana", "mes"] as const).map((x) => (
              <Link
                key={x}
                href={`/lavadero/resumen?v=${x}`}
                className={cn("rounded-md px-3 py-1", x === vista ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {x === "mes" ? "Mensual" : "Semanal"}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {lista.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Todavía no hay remitos cerrados.</p>}
          {lista.map((f) => {
            const neto = f.lavado - f.descuentos;
            return (
              <div key={f.clave} className="rounded-lg border p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{f.etiqueta}</p>
                  <p className="text-lg font-semibold tabular-nums">{fmtMoneda(neto)}</p>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>
                    {f.remitos} remitos · {fmtNumero(f.prendas)} prendas
                  </span>
                  <span className="text-right">Lavado {fmtMoneda(f.lavado)}</span>
                  <span>{f.pagos > 0 ? <span className="text-success">Pagos {fmtMoneda(f.pagos)}</span> : "Sin pagos"}</span>
                  <span className="text-right">{f.descuentos > 0 ? <span className="text-destructive">Descuentos −{fmtMoneda(f.descuentos)}</span> : "Sin descuentos"}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {aValidar.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Despachados, esperando validación del hotel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {aValidar.map((r) => (
              <Link key={r.id} href={`/lavadero/remitos/${r.id}`} className="flex justify-between gap-2 rounded px-1 py-1 hover:bg-muted">
                <span>
                  {r.codigo} · {r.edificio_nombre}
                </span>
                <span className="tabular-nums">{fmtMoneda(r.importe)}</span>
              </Link>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">El monto final puede cambiar según lo que valide el hotel.</p>
          </CardContent>
        </Card>
      )}

      {pagos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pagos recibidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {pagos.slice(0, 20).map((p, i) => (
              <div key={i} className="flex justify-between gap-2 px-1 py-1">
                <span>
                  {fmtFecha(p.fecha)} · {METODOS_PAGO[p.metodo]}
                  {p.comprobante_nro ? ` #${p.comprobante_nro}` : ""}
                </span>
                <span className="font-medium tabular-nums">{fmtMoneda(p.monto)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
