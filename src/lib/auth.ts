import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil, Rol } from "@/types/database";

/** Devuelve el perfil del usuario logueado o redirige al login. */
export async function getPerfil(): Promise<Perfil> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", user.id).single<Perfil>();
  if (!perfil?.rol || !perfil.activo) redirect("/login?error=sin-rol");
  return perfil;
}

/** Exige un rol; si no coincide, manda al inicio del rol correcto. */
export async function requireRol(rol: Rol): Promise<Perfil> {
  const perfil = await getPerfil();
  if (perfil.rol !== rol) redirect(inicioDeRol(perfil.rol!));
  return perfil;
}

export function inicioDeRol(rol: Rol) {
  return rol === "hotel" ? "/hotel" : "/lavadero";
}
