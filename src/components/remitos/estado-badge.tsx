import { Badge } from "@/components/ui/badge";
import type { EstadoRemito } from "@/types/database";
import { ESTADOS } from "./constantes";

export function EstadoBadge({ estado }: { estado: EstadoRemito }) {
  const e = ESTADOS[estado];
  return <Badge variant={e.variant}>{e.label}</Badge>;
}

const PASOS = ["Envío", "Recepción", "Lavado", "Despacho", "Cierre"];

/** Línea de tiempo compacta del ciclo del remito. */
export function PasosRemito({ estado }: { estado: EstadoRemito }) {
  const actual = ESTADOS[estado].paso;
  if (actual < 0) return null;
  return (
    <ol className="flex items-center gap-1">
      {PASOS.map((p, i) => (
        <li key={p} className="flex flex-1 flex-col items-center gap-1">
          <span
            className={`h-1.5 w-full rounded-full ${i <= actual ? "bg-primary" : "bg-muted"}`}
            aria-hidden
          />
          <span className={`text-[10px] ${i <= actual ? "font-medium text-foreground" : "text-muted-foreground"}`}>{p}</span>
        </li>
      ))}
    </ol>
  );
}
