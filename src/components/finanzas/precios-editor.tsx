"use client";
import { Fragment, useState, useTransition } from "react";
import { History, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { actualizarPrecio, guardarArticulo } from "@/app/actions/finanzas";
import { fmtFecha, fmtMoneda } from "@/lib/format";
import type { Articulo, PrecioHistorico } from "@/types/database";

export function PreciosEditor({ articulos, historial }: { articulos: Articulo[]; historial: PrecioHistorico[] }) {
  const [editando, setEditando] = useState<number | null>(null);
  const [verHist, setVerHist] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [aumento, setAumento] = useState("");
  const [pending, start] = useTransition();

  const aumentoMasivo = () => {
    const pct = Number(aumento);
    if (!pct || !confirm(`¿Aumentar ${pct}% todos los precios activos?`)) return;
    start(async () => {
      for (const a of articulos.filter((x) => x.activo)) {
        const r = await actualizarPrecio(a.id, Math.round(Number(a.precio_unitario_actual) * (1 + pct / 100)), `Aumento general ${pct}%`);
        if (!r.ok) return void toast.error(r.error);
      }
      toast.success("Precios actualizados");
      setAumento("");
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Maestro de precios de lavado</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" placeholder="% aumento" value={aumento} onChange={(e) => setAumento(e.target.value)} className="w-28" />
            <Button variant="outline" disabled={pending || !aumento} onClick={aumentoMasivo}>
              {pending && <Loader2 className="animate-spin" />} Aplicar a todos
            </Button>
            <Button onClick={() => setNuevo(true)}>
              <Plus /> Artículo
            </Button>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Artículo</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Precio lavado</TableHead>
              <TableHead className="text-right">Costo reposición</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {nuevo && (
              <TableRow>
                <TableCell colSpan={6}>
                  <FormArticulo onDone={() => setNuevo(false)} />
                </TableCell>
              </TableRow>
            )}
            {articulos.map((a) =>
              editando === a.id ? (
                <TableRow key={a.id}>
                  <TableCell colSpan={6}>
                    <FormArticulo articulo={a} onDone={() => setEditando(null)} />
                  </TableCell>
                </TableRow>
              ) : (
                <Fragment key={a.id}>
                  <TableRow className={a.activo ? "" : "opacity-50"}>
                    <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                    <TableCell className="font-medium">
                      {a.nombre} {!a.activo && <Badge variant="outline">inactivo</Badge>}
                    </TableCell>
                    <TableCell className="capitalize">{a.categoria}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtMoneda(a.precio_unitario_actual)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoneda(a.costo_reposicion)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label="Historial" onClick={() => setVerHist(verHist === a.id ? null : a.id)}>
                          <History />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditando(a.id)}>
                          <Pencil />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {verHist === a.id && (
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={6}>
                        <ul className="space-y-1 text-xs">
                          {historial
                            .filter((h) => h.articulo_id === a.id)
                            .map((h) => (
                              <li key={h.id} className="flex flex-wrap gap-x-3">
                                <span className="tabular-nums text-muted-foreground">{fmtFecha(h.vigente_desde, true)}</span>
                                <span>
                                  {h.precio_anterior != null ? `${fmtMoneda(h.precio_anterior)} → ` : "Alta: "}
                                  <b>{fmtMoneda(h.precio_nuevo)}</b>
                                </span>
                                {h.variacion_pct != null && (
                                  <span className={Number(h.variacion_pct) > 0 ? "text-destructive" : "text-success"}>
                                    {Number(h.variacion_pct) > 0 ? "+" : ""}
                                    {h.variacion_pct}%
                                  </span>
                                )}
                                {h.motivo && <span className="text-muted-foreground">{h.motivo}</span>}
                              </li>
                            ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ),
            )}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Cada remito guarda el precio vigente al momento de crearse (precio unitario histórico), así los aumentos no alteran liquidaciones pasadas.
      </p>
    </div>
  );
}

function FormArticulo({ articulo, onDone }: { articulo?: Articulo; onDone: () => void }) {
  const [f, setF] = useState({
    codigo: articulo?.codigo ?? "",
    nombre: articulo?.nombre ?? "",
    categoria: articulo?.categoria ?? ("cama" as Articulo["categoria"]),
    precio: String(articulo?.precio_unitario_actual ?? ""),
    costo: String(articulo?.costo_reposicion ?? ""),
    activo: articulo?.activo ?? true,
    motivo: "",
  });
  const [pending, start] = useTransition();

  const guardar = () =>
    start(async () => {
      const precio = Number(f.precio);
      const cambioPrecio = articulo && precio !== Number(articulo.precio_unitario_actual);
      // Si cambia el precio de un artículo existente, va por la RPC para registrar el motivo.
      if (cambioPrecio) {
        const r = await actualizarPrecio(articulo.id, precio, f.motivo || undefined);
        if (!r.ok) return void toast.error(r.error);
      }
      const r = await guardarArticulo({
        id: articulo?.id,
        codigo: f.codigo.trim().toUpperCase(),
        nombre: f.nombre.trim(),
        categoria: f.categoria,
        precio_unitario_actual: precio,
        costo_reposicion: Number(f.costo) || 0,
        activo: f.activo,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Artículo guardado");
      onDone();
    });

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-6">
      <div className="space-y-1">
        <Label>Código</Label>
        <Input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label>Nombre</Label>
        <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Categoría</Label>
        <Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as Articulo["categoria"] })}>
          <option value="cama">Cama</option>
          <option value="baño">Baño</option>
          <option value="otros">Otros</option>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Precio lavado</Label>
        <Input type="number" min={0} value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label>Costo reposición</Label>
        <Input type="number" min={0} value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} />
      </div>
      {articulo && (
        <div className="space-y-1 sm:col-span-3">
          <Label>Motivo del cambio de precio</Label>
          <Input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ej. actualización trimestral" />
        </div>
      )}
      <label className="flex items-center gap-2 self-end text-sm">
        <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo
      </label>
      <div className="flex items-end justify-end gap-2 sm:col-span-2 sm:col-start-5">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={pending || !f.codigo || !f.nombre}>
          {pending && <Loader2 className="animate-spin" />} Guardar
        </Button>
      </div>
    </div>
  );
}
