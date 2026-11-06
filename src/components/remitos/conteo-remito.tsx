"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, CheckCircle2, Clock, Loader2, Minus, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { cerrarRemito, despacharRemito, recepcionarRemito } from "@/app/actions/remitos";
import type {
  DetalleRemito,
  Etapa,
  Observacion,
  ObservacionInput,
  PendienteEntrega,
  RemitoVista,
  Responsable,
  TipoObservacion,
} from "@/types/database";
import { FirmaDigital } from "./firma-digital";
import { TIPOS_OBS } from "./constantes";

const TEXTOS: Record<Etapa, { titulo: string; esperado: string; boton: string; firma: string; exito: string }> = {
  recepcion: {
    titulo: "Conteo de recepción",
    esperado: "Enviado",
    boton: "Confirmar recepción",
    firma: "Firma de quien recibe (lavadero)",
    exito: "Recepción registrada. El hotel fue notificado.",
  },
  despacho: {
    titulo: "Despacho de ropa limpia",
    esperado: "A devolver",
    boton: "Despachar al hotel",
    firma: "Firma de quien despacha (lavadero)",
    exito: "Despacho registrado. El hotel fue notificado.",
  },
  validacion: {
    titulo: "Validación de ingreso al depósito",
    esperado: "Devuelto",
    boton: "Validar y cerrar remito",
    firma: "Firma de recepción (hotel)",
    exito: "Remito cerrado. El stock ingresó al depósito.",
  },
};

/** Cantidad que se espera contar en cada etapa. */
function esperado(d: DetalleRemito, etapa: Etapa, previas: Observacion[]) {
  if (etapa === "recepcion") return d.cantidad_enviada;
  if (etapa === "validacion") return d.cantidad_devuelta ?? 0;
  // despacho: lo recibido menos lo que se dio de baja (roturas y faltantes del lavadero)
  const bajas = previas
    .filter((o) => o.articulo_id === d.articulo_id && o.estado !== "rechazada" && o.tipo === "rotura")
    .reduce((s, o) => s + o.cantidad, 0);
  return Math.max((d.cantidad_recibida ?? 0) - bajas, 0);
}

/**
 * Pantalla interactiva de conteo, optimizada para celular:
 * botones grandes +/-, "todo conforme" de un toque, observaciones con
 * responsable (cargo hotel / lavadero) y firma táctil obligatoria.
 * Se reutiliza en recepción y despacho (lavadero) y en la validación (hotel).
 */
export function ConteoRemito({
  remito,
  detalle,
  etapa,
  observacionesPrevias = [],
  pendientes = [],
  volverA,
}: {
  remito: RemitoVista;
  detalle: DetalleRemito[];
  etapa: Etapa;
  observacionesPrevias?: Observacion[];
  /** Despacho: pendientes de la torre que se pueden sumar. Validación: las que vienen en este remito. */
  pendientes?: PendienteEntrega[];
  volverA: string;
}) {
  const router = useRouter();
  const t = TEXTOS[etapa];
  const filas = useMemo(
    () =>
      [...detalle]
        .sort((a, b) => (a.articulos?.orden ?? 0) - (b.articulos?.orden ?? 0))
        .map((d) => ({ ...d, esperado: esperado(d, etapa, observacionesPrevias) })),
    [detalle, etapa, observacionesPrevias],
  );

  const [conteo, setConteo] = useState<Record<number, number>>({});
  const [revisado, setRevisado] = useState<Record<number, boolean>>({});
  const [obs, setObs] = useState<ObservacionInput[]>([]);
  const [firma, setFirma] = useState<string | null>(null);
  // Despacho: el lavadero elige cuántas suma (arranca en 0). Validación: el hotel confirma lo que llegó (arranca completo).
  const [pend, setPend] = useState<Record<number, number>>(() =>
    Object.fromEntries(pendientes.map((p) => [p.id, etapa === "validacion" ? p.cantidad : 0])),
  );
  const totalPend = pendientes.reduce((s, p) => s + (pend[p.id] ?? 0), 0);
  const [pending, startTransition] = useTransition();

  const valor = (id: number, def: number) => conteo[id] ?? def;
  const setValor = (id: number, v: number) => {
    setConteo((c) => ({ ...c, [id]: Math.max(0, v) }));
    setRevisado((r) => ({ ...r, [id]: true }));
  };

  const totalEsperado = filas.reduce((s, f) => s + f.esperado, 0);
  const totalContado = filas.reduce((s, f) => s + valor(f.articulo_id, f.esperado), 0);
  const revisados = filas.filter((f) => revisado[f.articulo_id]).length;
  const diferencias = filas.filter((f) => valor(f.articulo_id, f.esperado) !== f.esperado);

  function todoConforme() {
    setConteo(Object.fromEntries(filas.map((f) => [f.articulo_id, f.esperado])));
    setRevisado(Object.fromEntries(filas.map((f) => [f.articulo_id, true])));
  }

  function enviar() {
    if (!firma) return toast.error("Falta la firma");
    if (revisados < filas.length && !confirm("Hay artículos sin revisar. Se tomará la cantidad esperada. ¿Continuar?")) return;
    const sinExplicar = diferencias.filter((f) => !obs.some((o) => o.articulo_id === f.articulo_id));
    if (etapa === "despacho") {
      // Lo que no se despacha y no es rotura ni faltante queda pendiente de entrega.
      const bajas = (id: number) =>
        obs.filter((o) => o.articulo_id === id && (o.tipo === "rotura" || o.tipo === "faltante")).reduce((s, o) => s + o.cantidad, 0);
      const retenidas = diferencias.reduce(
        (s, f) => s + Math.max(f.esperado - valor(f.articulo_id, f.esperado) - bajas(f.articulo_id), 0),
        0,
      );
      if (retenidas > 0 && !confirm(`${retenidas} prenda(s) quedan en el lavadero como pendientes de entrega. ¿Continuar?`)) return;
    } else if (
      sinExplicar.length &&
      !confirm(
        `Hay ${sinExplicar.length} diferencia(s) sin observación. Se registrarán automáticamente como faltante/sobrante para que el hotel las revise. ¿Continuar?`,
      )
    )
      return;

    const items = filas.map((f) => ({ articulo_id: f.articulo_id, cantidad: valor(f.articulo_id, f.esperado) }));
    const itemsPend = pendientes
      .map((p) => ({ id: p.id, cantidad: pend[p.id] ?? 0 }))
      .filter((p) => etapa === "validacion" || p.cantidad > 0);
    startTransition(async () => {
      const r =
        etapa === "recepcion"
          ? await recepcionarRemito(remito.id, items, firma, obs)
          : etapa === "despacho"
            ? await despacharRemito(remito.id, items, firma, obs, itemsPend)
            : await cerrarRemito(remito.id, items, firma, obs, itemsPend);
      if (!r.ok) return void toast.error(r.error);
      toast.success(t.exito);
      router.push(volverA);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-36">
      {/* Resumen y acción rápida */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.titulo}</p>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{revisados}</span> de {filas.length} artículos revisados
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={todoConforme}>
          <CheckCheck /> Todo conforme
        </Button>
      </Card>

      {/* Conteo por artículo */}
      <ul className="space-y-2">
        {filas.map((f) => {
          const v = valor(f.articulo_id, f.esperado);
          const diff = v - f.esperado;
          const ok = revisado[f.articulo_id];
          return (
            <li key={f.articulo_id}>
              <Card
                className={cn(
                  "p-3 transition-colors",
                  ok && diff === 0 && "border-success/50 bg-success/5",
                  ok && diff !== 0 && "border-warning bg-warning/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.articulos?.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.esperado}: <span className="font-semibold tabular-nums text-foreground">{f.esperado}</span>
                      {diff !== 0 && (
                        <span className={cn("ml-2 font-semibold", diff < 0 ? "text-destructive" : "text-warning-foreground")}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </p>
                  </div>
                  {ok && diff === 0 && <CheckCircle2 className="size-5 shrink-0 text-success" />}
                  {ok && diff !== 0 && <TriangleAlert className="size-5 shrink-0 text-warning-foreground" />}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xl"
                    className="w-14 px-0"
                    aria-label="Restar"
                    onClick={() => setValor(f.articulo_id, v - 1)}
                  >
                    <Minus className="!size-6" />
                  </Button>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={v}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setValor(f.articulo_id, Number(e.target.value) || 0)}
                    className="h-14 flex-1 text-center text-2xl font-semibold tabular-nums"
                    aria-label={`Cantidad ${f.articulos?.nombre}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="xl"
                    className="w-14 px-0"
                    aria-label="Sumar"
                    onClick={() => setValor(f.articulo_id, v + 1)}
                  >
                    <Plus className="!size-6" />
                  </Button>
                  <Button
                    type="button"
                    variant={ok && diff === 0 ? "success" : "secondary"}
                    size="xl"
                    className="w-14 px-0"
                    aria-label="Coincide"
                    onClick={() => setValor(f.articulo_id, f.esperado)}
                  >
                    <CheckCheck className="!size-6" />
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {pendientes.length > 0 && etapa !== "recepcion" && (
        <Card className="space-y-3 border-primary/40 p-4">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <Clock className="size-4" />
              {etapa === "despacho" ? "Prendas pendientes de envíos anteriores" : "Prendas pendientes que vienen en este remito"}
            </p>
            <p className="text-xs text-muted-foreground">
              {etapa === "despacho"
                ? "Indicá cuántas entregás ahora. Las que no sumes siguen pendientes."
                : "Confirmá cuántas llegaron. Las que no lleguen vuelven a quedar pendientes."}
            </p>
          </div>
          <ul className="space-y-2">
            {pendientes.map((p) => {
              const v = pend[p.id] ?? 0;
              const fijar = (n: number) => setPend((x) => ({ ...x, [p.id]: Math.min(Math.max(n, 0), p.cantidad) }));
              return (
                <li key={p.id} className={cn("flex items-center gap-2 rounded-lg border p-3", v > 0 && "border-success/50 bg-success/5")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {p.articulo_nombre} <span className="text-muted-foreground">· {p.cantidad} pend.</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      De {p.remito_origen_codigo}
                      {p.motivo ? ` · ${p.motivo}` : ""}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="icon" aria-label="Restar" onClick={() => fijar(v - 1)}>
                    <Minus />
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums">{v}</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Sumar" onClick={() => fijar(v + 1)}>
                    <Plus />
                  </Button>
                  <Button
                    type="button"
                    variant={v === p.cantidad ? "success" : "secondary"}
                    size="icon"
                    aria-label="Todas"
                    onClick={() => fijar(v === p.cantidad ? 0 : p.cantidad)}
                  >
                    <CheckCheck />
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <EditorObservaciones
        articulos={filas.map((f) => ({ id: f.articulo_id, nombre: f.articulos?.nombre ?? "" }))}
        observaciones={obs}
        onChange={setObs}
        responsableDefault={etapa === "validacion" ? "lavadero" : etapa === "recepcion" ? "hotel" : "lavadero"}
        sugerencias={diferencias.filter((f) => !obs.some((o) => o.articulo_id === f.articulo_id)).map((f) => ({
          articulo_id: f.articulo_id,
          nombre: f.articulos?.nombre ?? "",
          diff: valor(f.articulo_id, f.esperado) - f.esperado,
        }))}
      />

      <Card className="p-4">
        <FirmaDigital label={t.firma} onChange={setFirma} />
      </Card>

      {/* Barra inferior fija */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="text-sm">
            <p className="text-muted-foreground">Total</p>
            <p className="font-semibold tabular-nums">
              {totalContado} / {totalEsperado}
            </p>
            {totalPend > 0 && <p className="text-xs text-primary">+{totalPend} pendientes</p>}
          </div>
          <Button size="xl" className="flex-1" onClick={enviar} disabled={pending || !firma}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {firma ? t.boton : "Firmá para confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

export function EditorObservaciones({
  articulos,
  observaciones,
  onChange,
  responsableDefault,
  sugerencias = [],
}: {
  articulos: { id: number; nombre: string }[];
  observaciones: ObservacionInput[];
  onChange: (o: ObservacionInput[]) => void;
  responsableDefault: Responsable;
  sugerencias?: { articulo_id: number; nombre: string; diff: number }[];
}) {
  const vacio: ObservacionInput = { articulo_id: articulos[0]?.id ?? null, tipo: "rotura", responsable: responsableDefault, cantidad: 1, descripcion: "" };
  const [form, setForm] = useState<ObservacionInput | null>(null);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4 text-warning-foreground" /> Observaciones / roturas
        </p>
        {!form && (
          <Button type="button" size="sm" variant="outline" onClick={() => setForm(vacio)}>
            <Plus /> Agregar
          </Button>
        )}
      </div>

      {sugerencias.length > 0 && !form && (
        <div className="space-y-1.5">
          {sugerencias.map((s) => (
            <button
              key={s.articulo_id}
              type="button"
              className="w-full rounded-md border border-dashed border-warning p-2 text-left text-sm hover:bg-warning/10"
              onClick={() =>
                setForm({
                  ...vacio,
                  articulo_id: s.articulo_id,
                  tipo: s.diff < 0 ? "faltante" : "sobrante",
                  cantidad: Math.abs(s.diff),
                })
              }
            >
              {s.nombre}: diferencia de <b>{s.diff > 0 ? `+${s.diff}` : s.diff}</b> · tocá para explicarla
            </button>
          ))}
        </div>
      )}

      {observaciones.length === 0 && !form && sugerencias.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin observaciones.</p>
      )}

      <ul className="space-y-2">
        {observaciones.map((o, i) => (
          <li key={i} className="flex items-start justify-between gap-2 rounded-md bg-muted p-2 text-sm">
            <div>
              <p className="font-medium">
                {TIPOS_OBS[o.tipo]} · {o.cantidad}× {articulos.find((a) => a.id === o.articulo_id)?.nombre ?? "General"}
              </p>
              <p className="text-xs text-muted-foreground">
                A cargo de <b>{o.responsable === "hotel" ? "Hotel (sin cargo)" : "Lavadero (se descuenta)"}</b>
                {o.descripcion ? ` · ${o.descripcion}` : ""}
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label="Quitar" onClick={() => onChange(observaciones.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      {form && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(TIPOS_OBS) as TipoObservacion[]).map((k) => (
              <Button key={k} type="button" size="sm" variant={form.tipo === k ? "default" : "outline"} onClick={() => setForm({ ...form, tipo: k })}>
                {TIPOS_OBS[k]}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <div className="space-y-1">
              <Label>Artículo</Label>
              <Select
                value={form.articulo_id ?? ""}
                onChange={(e) => setForm({ ...form, articulo_id: e.target.value ? Number(e.target.value) : null })}
                className="h-11"
              >
                {articulos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
                <option value="">General / sin artículo</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cantidad</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: Math.max(1, Number(e.target.value) || 1) })}
                className="h-11 text-center"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>¿A cargo de quién?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={form.responsable === "hotel" ? "default" : "outline"} onClick={() => setForm({ ...form, responsable: "hotel" })}>
                Hotel (sin cargo)
              </Button>
              <Button
                type="button"
                variant={form.responsable === "lavadero" ? "destructive" : "outline"}
                onClick={() => setForm({ ...form, responsable: "lavadero" })}
              >
                Lavadero (cargo)
              </Button>
            </div>
          </div>
          <Textarea
            placeholder="Detalle (opcional): ej. desgarro en costura, mancha de óxido…"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange([...observaciones, form]);
                setForm(null);
              }}
            >
              Guardar observación
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
