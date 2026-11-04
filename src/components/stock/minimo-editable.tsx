"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { actualizarStockMinimo } from "@/app/actions/stock";

export function MinimoEditable({ edificioId, articuloId, valor }: { edificioId: number; articuloId: number; valor: number }) {
  const [v, setV] = useState(String(valor));
  const [pending, start] = useTransition();
  const guardar = () => {
    const n = Number(v);
    if (n === valor || Number.isNaN(n)) return;
    start(async () => {
      const r = await actualizarStockMinimo(edificioId, articuloId, n);
      if (r.ok) toast.success("Stock mínimo actualizado");
      else toast.error(r.error);
    });
  };
  return (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      value={v}
      disabled={pending}
      onChange={(e) => setV(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-8 w-20 text-right tabular-nums"
      aria-label="Stock mínimo"
    />
  );
}
