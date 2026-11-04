"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { crearRemito } from "@/app/actions/remitos";
import type { Edificio, StockResumen } from "@/types/database";

export function NuevoRemitoForm({
  edificios,
  stock,
  enviosHoy,
}: {
  edificios: Edificio[];
  stock: StockResumen[];
  enviosHoy: Record<number, number>;
}) {
  const router = useRouter();
  const [edificioId, setEdificioId] = useState(edificios[0]?.id);
  const [origen, setOrigen] = useState<"deposito" | "habitaciones">("deposito");
  const [cant, setCant] = useState<Record<number, string>>({});
  const [notas, setNotas] = useState("");
  const [pending, start] = useTransition();

  const filas = useMemo(() => stock.filter((s) => s.edificio_id === edificioId), [stock, edificioId]);
  const total = filas.reduce((a, f) => a + (Number(cant[f.articulo_id]) || 0), 0);
  const excedidos = filas.filter((f) => (Number(cant[f.articulo_id]) || 0) > f[origen]);
  const cupo = 2 - (enviosHoy[edificioId] ?? 0);

  const guardar = (enviar: boolean) =>
    start(async () => {
      const r = await crearRemito({
        edificio_id: edificioId,
        ubicacion_origen: origen,
        notas,
        enviar,
        items: filas.map((f) => ({ articulo_id: f.articulo_id, cantidad: Number(cant[f.articulo_id]) || 0 })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(enviar ? "Envío registrado. El lavadero fue notificado." : "Borrador guardado");
      router.push(`/hotel/remitos/${r.data!.id}`);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {edificios.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEdificioId(e.id)}
                className={cn(
                  "rounded-lg border-2 p-4 text-left transition-colors",
                  e.id === edificioId ? "border-primary bg-primary/5" : "hover:border-primary/40",
                )}
              >
                <p className="text-lg font-semibold">{e.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {enviosHoy[e.id] ?? 0} de 2 envíos hoy
                </p>
              </button>
            ))}
          </div>
          <div className="flex gap-2 text-sm">
            <span className="self-center text-muted-foreground">Sale de:</span>
            {(["deposito", "habitaciones"] as const).map((o) => (
              <Button key={o} type="button" size="sm" variant={origen === o ? "default" : "outline"} onClick={() => setOrigen(o)}>
                {o === "deposito" ? "Depósito central" : "Habitaciones (ropa sucia)"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filas.map((f) => {
            const v = Number(cant[f.articulo_id]) || 0;
            const excede = v > f[origen];
            return (
              <div key={f.articulo_id} className={cn("flex items-center gap-3 rounded-lg border p-3", excede && "border-destructive bg-destructive/5")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.articulo_nombre}</p>
                  <p className={cn("text-xs", excede ? "text-destructive" : "text-muted-foreground")}>
                    Disponible en {origen === "deposito" ? "depósito" : "habitaciones"}: {f[origen]}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={cant[f.articulo_id] ?? ""}
                  onChange={(e) => setCant({ ...cant, [f.articulo_id]: e.target.value })}
                  className="h-11 w-24 text-center text-lg tabular-nums"
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold tabular-nums">
              {total} <span className="text-base font-normal text-muted-foreground">prendas</span>
            </p>
            <div className="space-y-1">
              <Label htmlFor="notas">Notas para el lavadero</Label>
              <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: retirar antes de las 11 h" />
            </div>
            {cupo <= 0 && <p className="text-sm text-destructive">Este edificio ya tiene 2 envíos hoy.</p>}
            {excedidos.length > 0 && <p className="text-sm text-destructive">Hay cantidades mayores al stock disponible.</p>}
            <Button className="w-full" size="lg" disabled={pending || total === 0 || cupo <= 0 || excedidos.length > 0} onClick={() => guardar(true)}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar al lavadero
            </Button>
            <Button className="w-full" variant="outline" disabled={pending || total === 0 || cupo <= 0} onClick={() => guardar(false)}>
              <Save /> Guardar borrador
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
