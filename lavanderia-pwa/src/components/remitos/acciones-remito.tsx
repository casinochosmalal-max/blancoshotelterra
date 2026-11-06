"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { anularRemito, enviarRemito, resolverObservacion } from "@/app/actions/remitos";
import type { EstadoRemito } from "@/types/database";

export function AccionesRemito({ id, estado }: { id: string; estado: EstadoRemito }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      router.refresh();
    });

  return (
    <>
      {estado === "borrador" && (
        <Button disabled={pending} onClick={() => run(() => enviarRemito(id), "Enviado. El lavadero fue notificado.")}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar al lavadero
        </Button>
      )}
      {(estado === "borrador" || estado === "enviado") && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            const motivo = prompt("Motivo de la anulación");
            if (motivo) run(() => anularRemito(id, motivo), "Remito anulado");
          }}
        >
          <Ban /> Anular
        </Button>
      )}
    </>
  );
}

export function ResolverObservacion({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const resolver = (aprobar: boolean) =>
    start(async () => {
      const nota = aprobar ? undefined : (prompt("Motivo del rechazo (opcional)") ?? undefined);
      const r = await resolverObservacion(id, aprobar, nota);
      if (!r.ok) return void toast.error(r.error);
      toast.success(aprobar ? "Observación aprobada" : "Observación rechazada");
      router.refresh();
    });
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="success" disabled={pending} onClick={() => resolver(true)}>
        <Check /> Aprobar
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => resolver(false)}>
        <X /> Rechazar
      </Button>
    </div>
  );
}
