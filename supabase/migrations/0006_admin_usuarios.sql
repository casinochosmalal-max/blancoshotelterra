-- =============================================================================
--  Lavandería Terra Malal · 0006 · Administrador de usuarios
--  Un perfil con es_admin = true ve la pantalla "Usuarios" y puede dar de alta,
--  editar, cambiar claves, desactivar y eliminar usuarios.
-- =============================================================================

alter table public.perfiles add column if not exists es_admin boolean not null default false;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid() and activo), false)
$$;

-- es_admin no figura en los privilegios de UPDATE por columna (0003), así que
-- ningún usuario puede auto-asignárselo desde la app.

-- Administrador inicial
update public.perfiles p set es_admin = true
  from auth.users u
 where u.id = p.id and lower(u.email) = 'casinochosmalal@gmail.com';
