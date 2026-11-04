import Link from "next/link";
import { ChevronRight, Building2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fmtFecha } from "@/lib/format";
import type { RemitoVista } from "@/types/database";
import { EstadoBadge } from "./estado-badge";

export function RemitoCard({ r, href, accion }: { r: RemitoVista; href: string; accion?: string }) {
  return (
    <Link href={href} className="block">
      <Card className="flex items-center gap-3 p-4 transition-colors active:bg-accent hover:border-primary/40">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
          {r.edificio_codigo}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{r.codigo}</span>
            <EstadoBadge estado={r.estado} />
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="size-3" /> {r.edificio_nombre} · {fmtFecha(r.fecha)} · {r.prendas_enviadas} prendas
          </p>
          {r.observaciones_pendientes > 0 && (
            <p className="flex items-center gap-1 text-xs text-warning-foreground">
              <AlertTriangle className="size-3" /> {r.observaciones_pendientes} observación(es) pendiente(s)
            </p>
          )}
          {accion && <p className="text-xs font-medium text-primary">{accion}</p>}
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Card>
    </Link>
  );
}
