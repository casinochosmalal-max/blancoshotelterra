"use client";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { transferirStock } from "@/app/actions/stock";
import type { Ubicacion } from "@/types/database";

const OPCIONES: { valor: string; label: string; origen: Ubicacion | null; destino: Ubicacion | null }[] = [
  { valor: "dep-hab", label: "Depósito → Habitaciones (armado)", origen: "deposito", destino: "habitaciones" },
  { valor: "hab-dep", label: "Habitaciones → Depósito (retiro)", origen: "habitaciones", destino: "deposito" },
  { valor: "alta-dep", label: "Alta al depósito (compra / reposición)", origen: null, destino: "deposito" },
  { valor: "baja-dep", label: "Baja del depósito (descarte hotel)", origen: "deposito", destino: null },
  { valor: "baja-hab", label: "Baja de habitaciones (descarte hotel)", origen: "habitaciones", destino: null },
];

export function TransferenciaForm({ edificioId, articulos }: { edificioId: number; articulos: { id: number; nombre: string }[] }) {
  const [tipo, setTipo] = useState(OPCIONES[0].valor);
  const [articulo, setArticulo] = useState(articulos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const op = OPCIONES.find((o) => o.valor === tipo)!;
    start(async () => {
      const r = await transferirStock({
        edificio_id: edificioId,
        articulo_id: Number(articulo),
        origen: op.origen,
        destino: op.destino,
        cantidad: Number(cantidad),
        motivo: motivo || op.label,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Movimiento registrado");
      setCantidad("");
      setMotivo("");
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRight className="size-4" /> Movimiento manual
        </CardTitle>
        <CardDescription>El stock en lavadero sólo cambia con remitos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {OPCIONES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <div className="space-y-1">
              <Label>Artículo</Label>
              <Select value={articulo} onChange={(e) => setArticulo(Number(e.target.value))}>
                {articulos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cantidad</Label>
              <Input type="number" min={1} required inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
          </div>
          <Input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Registrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
