"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoneda } from "@/lib/format";

// Paleta categórica validada (CVD-safe): slot 1 azul, slot 2 naranja, en orden fijo por edificio.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

export interface PuntoMensual {
  mes: string;
  [edificio: string]: number | string;
}

/** Gasto neto mensual por edificio (barras agrupadas, un solo eje). */
export function GraficoGastoMensual({ datos, edificios }: { datos: PuntoMensual[]; edificios: string[] }) {
  if (!datos.length) return <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay remitos cerrados.</p>;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={datos} barGap={2} barCategoryGap="24%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} fontSize={12} stroke="hsl(var(--muted-foreground))" />
        <YAxis tickFormatter={(v) => `$${compacto.format(v)}`} tickLine={false} axisLine={false} fontSize={12} width={56} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          formatter={(v) => fmtMoneda(Number(v))}
          contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {edificios.map((e, i) => (
          <Bar key={e} dataKey={e} fill={SERIES[i % SERIES.length]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Gasto por artículo (una serie, barras horizontales). */
export function GraficoArticulos({ datos }: { datos: { articulo: string; importe: number }[] }) {
  if (!datos.length) return <p className="py-12 text-center text-sm text-muted-foreground">Sin datos para el período.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 34)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
        <XAxis type="number" tickFormatter={(v) => `$${compacto.format(v)}`} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis type="category" dataKey="articulo" width={130} tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--foreground))" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          formatter={(v) => [fmtMoneda(Number(v)), "Importe"]}
          contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12 }}
        />
        <Bar dataKey="importe" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
