"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rol, UsuarioAdmin } from "@/types/database";
import type { Resultado } from "./remitos";

const BANEO_PERMANENTE = "876000h"; // ~100 años

/** Verifica con la sesión del usuario (no con la clave secreta) que sea admin. */
async function verificarAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión vencida");
  const { data } = await supabase.from("perfiles").select("es_admin, activo").eq("id", user.id).single();
  if (!data?.es_admin || !data.activo) throw new Error("Sólo el administrador puede gestionar usuarios");
  return user.id;
}

async function ejecutar<T>(fn: (yo: string) => Promise<T>): Promise<Resultado<T>> {
  try {
    const yo = await verificarAdmin();
    const data = await fn(yo);
    revalidatePath("/hotel/usuarios");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: traducir((e as Error).message) };
  }
}

function traducir(msg: string) {
  if (/already been registered|already exists/i.test(msg)) return "Ya existe un usuario con ese email";
  if (/password.*(at least|short|characters)/i.test(msg)) return "La contraseña debe tener al menos 6 caracteres";
  if (/invalid.*email/i.test(msg)) return "El email no es válido";
  return msg;
}

const limpiarTel = (t?: string | null) => (t ? t.replace(/\D/g, "") || null : null);

export async function listarUsuarios(): Promise<Resultado<UsuarioAdmin[]>> {
  return ejecutar(async () => {
    const admin = createAdminClient();
    const [{ data: auth, error }, { data: perfiles, error: e2 }] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 200 }),
      admin.from("perfiles").select("*"),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    const porId = new Map((perfiles ?? []).map((p) => [p.id, p]));
    return auth.users
      .map((u) => {
        const p = porId.get(u.id);
        return {
          id: u.id,
          email: u.email ?? "",
          nombre: p?.nombre ?? u.email ?? "",
          rol: (p?.rol ?? null) as Rol | null,
          telefono_whatsapp: p?.telefono_whatsapp ?? null,
          activo: (p?.activo ?? true) && !(u as { banned_until?: string }).banned_until,
          es_admin: p?.es_admin ?? false,
          ultimo_ingreso: u.last_sign_in_at ?? null,
          creado: u.created_at,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });
}

export async function crearUsuario(input: {
  email: string;
  password: string;
  nombre: string;
  rol: Rol;
  telefono_whatsapp?: string;
}): Promise<Resultado<{ id: string }>> {
  return ejecutar(async () => {
    if (input.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      email_confirm: true,
      app_metadata: { rol: input.rol },
      user_metadata: { nombre: input.nombre.trim() },
    });
    if (error) throw error;
    // El trigger crea el perfil; acá se completa por si acaso.
    const { error: e2 } = await admin.from("perfiles").upsert({
      id: data.user.id,
      nombre: input.nombre.trim(),
      rol: input.rol,
      telefono_whatsapp: limpiarTel(input.telefono_whatsapp),
      activo: true,
    });
    if (e2) throw e2;
    return { id: data.user.id };
  });
}

export async function editarUsuario(
  id: string,
  input: { nombre: string; rol: Rol; telefono_whatsapp?: string; email?: string; es_admin?: boolean },
): Promise<Resultado> {
  return ejecutar(async (yo) => {
    if (id === yo && input.es_admin === false) throw new Error("No podés quitarte a vos mismo el permiso de administrador");
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, {
      app_metadata: { rol: input.rol },
      ...(input.email ? { email: input.email.trim().toLowerCase(), email_confirm: true } : {}),
    });
    if (error) throw error;
    const { error: e2 } = await admin
      .from("perfiles")
      .update({
        nombre: input.nombre.trim(),
        rol: input.rol,
        telefono_whatsapp: limpiarTel(input.telefono_whatsapp),
        ...(input.es_admin !== undefined ? { es_admin: input.es_admin } : {}),
      })
      .eq("id", id);
    if (e2) throw e2;
    return undefined;
  });
}

export async function cambiarClave(id: string, password: string): Promise<Resultado> {
  return ejecutar(async () => {
    if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
    if (error) throw error;
    return undefined;
  });
}

/** Baja reversible: bloquea el ingreso y conserva el historial. */
export async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<Resultado> {
  return ejecutar(async (yo) => {
    if (id === yo && !activo) throw new Error("No podés desactivar tu propio usuario");
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: activo ? "none" : BANEO_PERMANENTE });
    if (error) throw error;
    const { error: e2 } = await admin.from("perfiles").update({ activo }).eq("id", id);
    if (e2) throw e2;
    return undefined;
  });
}

/** Baja definitiva. Los remitos que firmó quedan, sin el vínculo al usuario. */
export async function eliminarUsuario(id: string): Promise<Resultado> {
  return ejecutar(async (yo) => {
    if (id === yo) throw new Error("No podés eliminar tu propio usuario");
    const { error } = await createAdminClient().auth.admin.deleteUser(id);
    if (error) throw error;
    return undefined;
  });
}
