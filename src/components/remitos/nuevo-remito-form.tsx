"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { crearRemito } from "@/app/actions/remitos";
import type { Edificio, StockResumen } from "@/types/database";

/** Minúsculas y sin acentos, para buscar "sabana" y encontrar "Sábanas". */
const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function NuevoRemitoForm({
  edificios,
  stock,
  envios,
  hoy,
  inicioStock,
}: {
  edificios: Edificio[];
  stock: StockResumen[];
  /** Envíos no anulados por "edificio|YYYY-MM-DD". */
  envios: Record<string, number>;
  hoy: string;
  /** Fecha del conteo inicial: los envíos anteriores no mueven stock. */
  inicioStock: string | null;
}) {
  const router = useRouter();
  const [edificioId, setEdificioId] = useState(edificios[0]?.id);
  const [origen, setOrigen] = useState<"deposito" | "habitaciones">("deposito");
  const [cant, setCant] = useState<Record<number, string>>({});
  const [notas, setNotas] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const enviosDe = (id: number) => envios[`${id}|${fecha}`] ?? 0;
  const esHoy = fecha === hoy;
  const fechaTxt = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-AR");
  const historico = !!inicioStock && fecha < inicioStock;
  const [pending, start] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  // Artículos ya cargados, en el orden en que se cargaron. Se reordena al salir del campo
  // (no mientras se escribe) para que la fila no salte debajo del dedo.
  const [cargados, setCargados] = useState<number[]>([]);
  const confirmar = (id: number) => {
    const v = Number(cant[id]) || 0;
    setCargados((c) => (v > 0 ? (c.includes(id) ? c : [...c, id]) : c.filter((x) => x !== id)));
  };

  // Primero los artículos con stock en depósito o habitaciones; dentro de cada grupo, el orden del maestro.
  const filas = useMemo(() => {
    const conStock = (s: StockResumen) => (s.deposito > 0 || s.habitaciones > 0 ? 0 : 1);
    return stock
      .filter((s) => s.edificio_id === edificioId)
      .sort((a, b) => conStock(a) - conStock(b) || a.orden - b.orden);
  }, [stock, edificioId]);
  // Arriba los cargados (siempre visibles); debajo el resto, filtrado por la búsqueda.
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const arriba = cargados.map((id) => filas.find((f) => f.articulo_id === id)).filter((f) => f !== undefined);
    const resto = filas.filter((f) => !cargados.includes(f.articulo_id) && (!q || normalizar(f.articulo_nombre).includes(q)));
    return { arriba, resto };
  }, [filas, cargados, busqueda]);
  const total = filas.reduce((a, f) => a + (Number(cant[f.articulo_id]) || 0), 0);
  const excedidos = historico ? [] : filas.filter((f) => (Number(cant[f.articulo_id]) || 0) > f[origen]);
  const cupo = 2 - enviosDe(edificioId);

  const guardar = (enviar: boolean) =>
    start(async () => {
      const r = await crearRemito({
        edificio_id: edificioId,
        ubicacion_origen: origen,
        fecha,
        notas,
        enviar,
        items: filas.map((f) => ({ articulo_id: f.articulo_id, cantidad: Number(cant[f.articulo_id]) || 0 })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(enviar ? "Envío registrado. El lavadero fue notificado." : "Borrador guardado");
      router.push(`/hotel/remitos/${r.data!.id}`);
    });

  const fila = (f: StockResumen) => {
    const v = Number(cant[f.articulo_id]) || 0;
    const excede = !historico && v > f[origen];
    const cargado = v > 0 && !excede;
    return (
      <div
        key={f.articulo_id}
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3 transition-colors",
          cargado && "border-success/60 bg-success/10",
          excede && "border-destructive bg-destructive/5",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium">
            {cargado && <CheckCircle2 className="size-4 shrink-0 text-success" />}
            {f.articulo_nombre}
          </p>
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
          onFocus={(e) => e.target.select()}
          onChange={(e) => setCant({ ...cant, [f.articulo_id]: e.target.value })}
          onBlur={() => confirmar(f.articulo_id)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cn("h-11 w-24 text-center text-lg tabular-nums", cargado && "border-success font-semibold")}
        />
      </div>
    );
  };

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
                  {enviosDe(e.id)} de 2 envíos {esHoy ? "hoy" : `el ${fechaTxt}`}
                </p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label htmlFor="fecha" className="text-muted-foreground">
              Fecha del envío:
            </Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => setFecha(e.target.value || hoy)}
              className="h-9 w-44"
            />
            {!esHoy && (
              <span className="text-xs text-warning-foreground">
                Carga de un envío atrasado{historico ? " · anterior al conteo inicial, no mueve stock" : ""}
              </span>
            )}
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              enterKeyHint="search"
              placeholder="Buscar artículo…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11 pl-9 pr-9"
              aria-label="Buscar artículo"
            />
            {busqueda && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setBusqueda("")}
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {visibles.arriba.length > 0 && (
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-success">
              En este remito · {visibles.arriba.length} artículo{visibles.arriba.length === 1 ? "" : "s"}
            </p>
          )}
          {visibles.arriba.map(fila)}
          {visibles.arriba.length > 0 && visibles.resto.length > 0 && (
            <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Otros artículos</p>
          )}
          {visibles.resto.map(fila)}
          {visibles.resto.length === 0 && busqueda && (
            <p className="py-4 text-center text-sm text-muted-foreground">No hay artículos que coincidan con “{busqueda}”.</p>
          )}
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
            {cupo <= 0 && (
              <p className="text-sm text-destructive">Este edificio ya tiene 2 envíos {esHoy ? "hoy" : `el ${fechaTxt}`}.</p>
            )}
            {fecha > hoy && <p className="text-sm text-destructive">La fecha no puede ser futura.</p>}
            {excedidos.length > 0 && <p className="text-sm text-destructive">Hay cantidades mayores al stock disponible.</p>}
            <Button className="w-full" size="lg" disabled={pending || total === 0 || cupo <= 0 || fecha > hoy || excedidos.length > 0} onClick={() => guardar(true)}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar al lavadero
            </Button>
            <Button className="w-full" variant="outline" disabled={pending || total === 0 || cupo <= 0 || fecha > hoy} onClick={() => guardar(false)}>
              <Save /> Guardar borrador
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
