import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoBadge } from "@/components/remitos/estado-badge";
import { ESTADOS } from "@/components/remitos/constantes";
import { fmtFecha, fmtMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EstadoRemito, RemitoVista } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remitos" };

export default async function RemitosPage({ searchParams }: { searchParams: Promise<{ estado?: string; e?: string }> }) {
  const { estado, e } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("v_remitos").select("*").order("fecha", { ascending: false }).order("nro_envio_dia", { ascending: false }).limit(100);
  if (estado && estado in ESTADOS) q = q.eq("estado", estado);
  if (e) q = q.eq("edificio_codigo", e);
  const { data } = await q;
  const remitos = (data ?? []) as RemitoVista[];

  const filtro = (k: string, v?: string) => {
    const p = new URLSearchParams();
    if (k !== "estado" && estado) p.set("estado", estado);
    if (k !== "e" && e) p.set("e", e);
    if (v) p.set(k, v);
    return `/hotel/remitos?${p}`;
  };

  return (
    <>
      <PageHeader titulo="Remitos de envío" descripcion="Hasta 2 envíos por edificio por día.">
        <Button asChild>
          <Link href="/hotel/remitos/nuevo">
            <Plus /> Nuevo envío
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {[undefined, ...(Object.keys(ESTADOS) as EstadoRemito[])].map((k) => (
          <Link
            key={k ?? "todos"}
            href={filtro("estado", k)}
            className={cn("rounded-full border px-3 py-1 text-xs", estado === k || (!estado && !k) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {k ? ESTADOS[k].label.split(" ·")[0] : "Todos"}
          </Link>
        ))}
        <span className="mx-1 border-l" />
        {[undefined, "A", "B"].map((k) => (
          <Link
            key={k ?? "ambos"}
            href={filtro("e", k)}
            className={cn("rounded-full border px-3 py-1 text-xs", e === k || (!e && !k) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {k ? `Edificio ${k}` : "Ambos edificios"}
          </Link>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Remito</TableHead>
              <TableHead>Edificio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Enviadas</TableHead>
              <TableHead className="text-right">Validadas</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {remitos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Sin remitos para este filtro.
                </TableCell>
              </TableRow>
            )}
            {remitos.map((r) => (
              <TableRow key={r.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/hotel/remitos/${r.id}`} className="hover:underline">
                    {r.codigo}
                  </Link>
                  {r.observaciones_pendientes > 0 && <span className="ml-2 text-xs text-warning-foreground">⚠ {r.observaciones_pendientes}</span>}
                </TableCell>
                <TableCell>{r.edificio_nombre}</TableCell>
                <TableCell>{fmtFecha(r.fecha)}</TableCell>
                <TableCell>
                  <EstadoBadge estado={r.estado} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.prendas_enviadas}</TableCell>
                <TableCell className="text-right tabular-nums">{r.prendas_validadas ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoneda(r.importe)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
