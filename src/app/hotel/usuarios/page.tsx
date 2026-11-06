import { requireAdmin } from "@/lib/auth";
import { listarUsuarios } from "@/app/actions/usuarios";
import { PageHeader } from "@/components/layout/page-header";
import { GestionUsuarios } from "@/components/usuarios/gestion-usuarios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  const yo = await requireAdmin();
  const r = await listarUsuarios();
  return (
    <>
      <PageHeader titulo="Usuarios" descripcion="Alta, edición, cambio de clave y baja de los usuarios del hotel y del lavadero." />
      {r.ok ? (
        <GestionUsuarios usuarios={r.data ?? []} yo={yo.id} />
      ) : (
        <p className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{r.error}</p>
      )}
    </>
  );
}
