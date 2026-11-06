import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PreciosEditor } from "@/components/finanzas/precios-editor";
import type { Articulo, PrecioHistorico } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Precios" };

export default async function PreciosPage() {
  const supabase = await createClient();
  const [{ data: articulos }, { data: historial }] = await Promise.all([
    supabase.from("articulos").select("*").order("orden"),
    supabase.from("precios_historicos").select("*").order("vigente_desde", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader titulo="Artículos y precios" descripcion="Precio de lavado por prenda y costo de reposición (base del cargo por rotura)." />
      <PreciosEditor articulos={(articulos ?? []) as Articulo[]} historial={(historial ?? []) as PrecioHistorico[]} />
    </>
  );
}
