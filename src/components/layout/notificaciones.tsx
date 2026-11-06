"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Notif {
  id: number;
  titulo: string;
  mensaje: string | null;
  remito_id: string | null;
  leida: boolean;
  created_at: string;
}

/** Campana con notificaciones in-app (tabla notificaciones + Realtime). */
export function Notificaciones({ base }: { base: "/hotel" | "/lavadero" }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [abierto, setAbierto] = useState(false);
  const noLeidas = items.filter((n) => !n.leida).length;

  useEffect(() => {
    const supabase = createClient();
    let conocidas: Set<number> | null = null;

    // Siempre se lee la tabla (respeta RLS): el aviso de Realtime sólo dispara la recarga.
    // Así nunca se muestran filas vacías ni avisos destinados al otro rol.
    const cargar = async (avisar: boolean) => {
      const { data } = await supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(20);
      const lista = ((data as Notif[]) ?? []).filter((n) => n.id && n.titulo);
      if (avisar && conocidas) {
        const nuevas = lista.filter((n) => !conocidas!.has(n.id));
        nuevas.forEach((n) => toast(n.titulo, { description: n.mensaje ?? undefined }));
        if (nuevas.length && "vibrate" in navigator) navigator.vibrate?.(200);
      }
      conocidas = new Set(lista.map((n) => n.id));
      setItems(lista);
    };
    cargar(false);

    const ch = supabase
      .channel("notificaciones")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificaciones" }, () => {
        cargar(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function marcarLeidas() {
    const ids = items.filter((n) => !n.leida).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    await createClient().from("notificaciones").update({ leida: true }).in("id", ids);
  }

  return (
    <div className="relative">
      <button
        aria-label="Notificaciones"
        className="relative grid size-9 place-items-center rounded-md hover:bg-accent"
        onClick={() => {
          setAbierto((v) => !v);
          if (!abierto) marcarLeidas();
        }}
      >
        <Bell className="size-5" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {noLeidas}
          </span>
        )}
      </button>
      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-card shadow-lg">
          <p className="border-b px-4 py-2 text-sm font-medium">Notificaciones</p>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Sin novedades</li>}
            {items.map((n) => (
              <li key={n.id} className={cn("border-b last:border-0", !n.leida && "bg-accent/50")}>
                <Link
                  href={n.remito_id ? `${base}/remitos/${n.remito_id}` : base}
                  onClick={() => setAbierto(false)}
                  className="block px-4 py-3 hover:bg-muted"
                >
                  <p className="text-sm font-medium">{n.titulo}</p>
                  {n.mensaje && <p className="text-xs text-muted-foreground">{n.mensaje}</p>}
                  {n.created_at && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
