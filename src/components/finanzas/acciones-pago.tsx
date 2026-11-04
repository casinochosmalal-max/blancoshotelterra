"use client";
import { useTransition } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { eliminarPago, urlComprobante } from "@/app/actions/finanzas";

export function AccionesPago({ id, comprobante }: { id: number; comprobante: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex justify-end gap-1">
      {comprobante && (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Ver comprobante"
          onClick={async () => {
            const url = await urlComprobante(comprobante);
            if (url) window.open(url, "_blank");
            else toast.error("No se pudo abrir el comprobante");
          }}
        >
          <Paperclip />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label="Eliminar pago"
        disabled={pending}
        onClick={() =>
          confirm("¿Eliminar este pago?") &&
          start(async () => {
            const r = await eliminarPago(id);
            if (r.ok) toast.success("Pago eliminado");
            else toast.error(r.error);
          })
        }
      >
        <Trash2 />
      </Button>
    </div>
  );
}
