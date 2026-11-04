import Link from "next/link";
import { AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AlertaStock } from "@/types/database";

export function AlertasStock({ alertas, compacto = false }: { alertas: AlertaStock[]; compacto?: boolean }) {
  return (
    <Card className={cn(alertas.length > 0 && "border-destructive/40")}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {alertas.length ? <AlertTriangle className="size-4 text-destructive" /> : <ShieldCheck className="size-4 text-success" />}
          Stock de seguridad
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todo el depósito central está por encima del mínimo.</p>
        ) : (
          <ul className="space-y-2">
            {alertas.slice(0, compacto ? 5 : undefined).map((a) => (
              <li
                key={`${a.edificio_id}-${a.articulo_id}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md p-2 text-sm",
                  a.nivel === "critica" ? "bg-destructive/10" : "bg-warning/15",
                )}
              >
                <span className="flex items-center gap-2">
                  {a.nivel === "critica" ? (
                    <AlertOctagon className="size-4 text-destructive" />
                  ) : (
                    <AlertTriangle className="size-4 text-warning-foreground" />
                  )}
                  <span>
                    <b>{a.articulo_nombre}</b> · {a.edificio_nombre}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {a.deposito} / {a.stock_minimo}
                  <span className="block text-xs text-muted-foreground">faltan {a.faltan}</span>
                </span>
              </li>
            ))}
            {compacto && alertas.length > 5 && (
              <Link href="/hotel/stock" className="block text-center text-sm text-primary">
                Ver las {alertas.length} alertas
              </Link>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
