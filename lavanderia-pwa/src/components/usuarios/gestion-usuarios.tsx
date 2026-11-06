"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { cambiarClave, cambiarEstadoUsuario, crearUsuario, editarUsuario, eliminarUsuario } from "@/app/actions/usuarios";
import { fmtFecha } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Rol, UsuarioAdmin } from "@/types/database";

type Modo = { tipo: "nuevo" } | { tipo: "editar"; u: UsuarioAdmin } | { tipo: "clave"; u: UsuarioAdmin } | null;

export function GestionUsuarios({ usuarios, yo }: { usuarios: UsuarioAdmin[]; yo: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, cerrar = true) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      if (cerrar) setModo(null);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setModo({ tipo: "nuevo" })}>
          <Plus /> Nuevo usuario
        </Button>
      </div>

      {modo?.tipo === "nuevo" && (
        <FormUsuario
          titulo="Nuevo usuario"
          pending={pending}
          onCancel={() => setModo(null)}
          onSubmit={(v) => run(() => crearUsuario({ ...v, password: v.password! }), "Usuario creado")}
          pedirClave
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {usuarios.map((u) => (
          <Card key={u.id} className={cn("space-y-3 p-4", !u.activo && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {u.nombre} {u.id === yo && <span className="text-xs font-normal text-muted-foreground">(vos)</span>}
                </p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={u.rol === "hotel" ? "info" : u.rol === "lavadero" ? "warning" : "outline"}>{u.rol ?? "sin rol"}</Badge>
                {u.es_admin && (
                  <Badge variant="success">
                    <ShieldCheck /> admin
                  </Badge>
                )}
                {!u.activo && <Badge variant="destructive">inactivo</Badge>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {u.telefono_whatsapp ? `WhatsApp: +${u.telefono_whatsapp} · ` : ""}
              Último ingreso: {u.ultimo_ingreso ? fmtFecha(u.ultimo_ingreso, true) : "nunca"}
            </p>

            {modo?.tipo === "editar" && modo.u.id === u.id && (
              <FormUsuario
                titulo="Editar usuario"
                inicial={u}
                pending={pending}
                esYo={u.id === yo}
                onCancel={() => setModo(null)}
                onSubmit={(v) => run(() => editarUsuario(u.id, v), "Usuario actualizado")}
              />
            )}
            {modo?.tipo === "clave" && modo.u.id === u.id && (
              <FormClave pending={pending} onCancel={() => setModo(null)} onSubmit={(p) => run(() => cambiarClave(u.id, p), "Contraseña cambiada")} />
            )}

            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => setModo({ tipo: "editar", u })}>
                <Pencil /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModo({ tipo: "clave", u })}>
                <KeyRound /> Clave
              </Button>
              {u.id !== yo && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      confirm(u.activo ? `¿Desactivar a ${u.nombre}? No podrá ingresar hasta que lo reactives.` : `¿Reactivar a ${u.nombre}?`) &&
                      run(() => cambiarEstadoUsuario(u.id, !u.activo), u.activo ? "Usuario desactivado" : "Usuario reactivado", false)
                    }
                  >
                    {u.activo ? <UserX /> : <UserCheck />} {u.activo ? "Desactivar" : "Reactivar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() =>
                      confirm(`¿Eliminar definitivamente a ${u.nombre} (${u.email})? Esta acción no se puede deshacer. Si sólo querés impedir que ingrese, usá "Desactivar".`) &&
                      run(() => eliminarUsuario(u.id), "Usuario eliminado", false)
                    }
                  >
                    <Trash2 /> Eliminar
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface Valores {
  email: string;
  nombre: string;
  rol: Rol;
  telefono_whatsapp?: string;
  password?: string;
  es_admin?: boolean;
}

function FormUsuario({
  titulo,
  inicial,
  pedirClave,
  pending,
  esYo,
  onSubmit,
  onCancel,
}: {
  titulo: string;
  inicial?: UsuarioAdmin;
  pedirClave?: boolean;
  pending: boolean;
  esYo?: boolean;
  onSubmit: (v: Valores) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<Valores>({
    email: inicial?.email ?? "",
    nombre: inicial?.nombre ?? "",
    rol: inicial?.rol ?? "hotel",
    telefono_whatsapp: inicial?.telefono_whatsapp ?? "",
    password: "",
    es_admin: inicial?.es_admin ?? false,
  });
  return (
    <Card className="space-y-3 border-primary/40 p-4">
      <p className="font-medium">{titulo}</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ ...v, email: inicial && v.email === inicial.email ? "" : v.email });
        }}
      >
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input required value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Rol</Label>
          <Select value={v.rol} onChange={(e) => setV({ ...v, rol: e.target.value as Rol })} disabled={esYo}>
            <option value="hotel">Hotel (acceso completo)</option>
            <option value="lavadero">Lavadero (sólo remitos)</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>WhatsApp (con código de país)</Label>
          <Input inputMode="tel" placeholder="5492994000000" value={v.telefono_whatsapp} onChange={(e) => setV({ ...v, telefono_whatsapp: e.target.value })} />
        </div>
        {pedirClave && (
          <div className="space-y-1">
            <Label>Contraseña inicial</Label>
            <Input required minLength={6} type="text" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          </div>
        )}
        {inicial && v.rol === "hotel" && (
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={!!v.es_admin} disabled={esYo} onChange={(e) => setV({ ...v, es_admin: e.target.checked })} />
            Puede administrar usuarios
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FormClave({ pending, onSubmit, onCancel }: { pending: boolean; onSubmit: (p: string) => void; onCancel: () => void }) {
  const [p, setP] = useState("");
  return (
    <form
      className="space-y-2 rounded-lg border border-primary/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(p);
      }}
    >
      <Label>Nueva contraseña</Label>
      <Input required minLength={6} type="text" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} />
      <p className="text-xs text-muted-foreground">Mínimo 6 caracteres. Pasásela al usuario por un medio privado.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Cambiar
        </Button>
      </div>
    </form>
  );
}
