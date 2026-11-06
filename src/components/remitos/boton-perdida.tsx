"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { darPendientePorPerdida } from "@/app/actions/remitos";
import type { Responsable } from "@/types/database";

/** Hotel: la prenda pendiente no va a volver. Se registra como faltante y se da de baja. */
export function BotonPerdida({ id }: { id: number }) {
  const [abierto, setAbierto] = useState(false);
  const [resp, setResp] = useState<Responsable>("lavadero");
  const [pending, start] = useTransition();

  if (!abierto)
    return (
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setAbierto(true)}>
        Dar por perdida
      </Button>
    );

  return (
    <div className="flex items-center gap-1">
      <Select value={resp} onChange={(e) => setResp(e.target.value as Responsable)} className="h-8 w-36 text-xs">
        <option value="lavadero">Cargo lavadero</option>
        <option value="hotel">Cargo hotel</option>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="h-8"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await darPendientePorPerdida(id, resp);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Registrada como faltante");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : "Confirmar"}
      </Button>
    </div>
  );
}
