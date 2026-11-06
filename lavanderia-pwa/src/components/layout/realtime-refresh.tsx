"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Escucha cambios por Supabase Realtime y refresca los Server Components.
 * Se usa en los paneles para ver al instante los movimientos del otro rol.
 */
export function RealtimeRefresh({ tablas, canal }: { tablas: string[]; canal: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refrescar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const ch = supabase.channel(canal);
    tablas.forEach((table) => ch.on("postgres_changes", { event: "*", schema: "public", table }, refrescar));
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [router, canal, tablas]);
  return null;
}
