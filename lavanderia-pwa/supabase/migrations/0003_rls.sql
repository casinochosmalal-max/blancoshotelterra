-- =============================================================================
--  Lavandería Hotel Terra Blancos · 0003 · Seguridad (RLS + privilegios)
--
--  Rol 'hotel'    : acceso global (stock, remitos, precios, finanzas, pagos).
--  Rol 'lavadero' : sólo ve remitos ya enviados (de ambos edificios), su detalle
--                   y sus observaciones. Los cambios de estado se hacen por RPC.
-- =============================================================================

alter table public.edificios          enable row level security;
alter table public.perfiles           enable row level security;
alter table public.articulos          enable row level security;
alter table public.precios_historicos enable row level security;
alter table public.stock_edificio     enable row level security;
alter table public.remitos_envio      enable row level security;
alter table public.detalle_remito     enable row level security;
alter table public.observaciones      enable row level security;
alter table public.movimientos_stock  enable row level security;
alter table public.pagos_lavadero     enable row level security;
alter table public.notificaciones     enable row level security;

-- Nada para usuarios anónimos.
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- Privilegios por columna: impiden saltear los triggers/RPCs editando a mano
-- -----------------------------------------------------------------------------
revoke insert, update on public.stock_edificio     from authenticated;
grant  update (stock_minimo) on public.stock_edificio to authenticated;

revoke insert, update, delete on public.movimientos_stock  from authenticated;
revoke insert, update, delete on public.precios_historicos from authenticated;

revoke update on public.remitos_envio from authenticated;
grant  update (edificio_id, ubicacion_origen, notas) on public.remitos_envio to authenticated;

revoke insert, update on public.detalle_remito from authenticated;
grant  insert (remito_id, articulo_id, cantidad_enviada) on public.detalle_remito to authenticated;
grant  update (cantidad_enviada)                         on public.detalle_remito to authenticated;

revoke insert, update on public.observaciones from authenticated;
grant  insert (remito_id, articulo_id, etapa, tipo, responsable, cantidad, descripcion, foto_url)
  on public.observaciones to authenticated;

revoke update on public.perfiles from authenticated;
grant  update (nombre, telefono_whatsapp) on public.perfiles to authenticated;

revoke update on public.articulos from authenticated;
grant  update (codigo, nombre, categoria, precio_unitario_actual, costo_reposicion, orden, activo)
  on public.articulos to authenticated;

revoke update on public.notificaciones from authenticated;
grant  update (leida) on public.notificaciones to authenticated;

-- -----------------------------------------------------------------------------
-- Perfiles
-- -----------------------------------------------------------------------------
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_hotel());
create policy perfiles_update on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_hotel())
  with check (id = auth.uid() or public.es_hotel());

-- -----------------------------------------------------------------------------
-- Catálogos: lectura para cualquier usuario con rol; escritura sólo hotel
-- -----------------------------------------------------------------------------
create policy edificios_select on public.edificios for select to authenticated
  using (public.rol_actual() is not null);
create policy edificios_write on public.edificios for all to authenticated
  using (public.es_hotel()) with check (public.es_hotel());

create policy articulos_select on public.articulos for select to authenticated
  using (public.rol_actual() is not null);
create policy articulos_write on public.articulos for all to authenticated
  using (public.es_hotel()) with check (public.es_hotel());

create policy precios_hist_select on public.precios_historicos for select to authenticated
  using (public.es_hotel());

-- -----------------------------------------------------------------------------
-- Stock y movimientos: exclusivos del hotel
-- -----------------------------------------------------------------------------
create policy stock_select on public.stock_edificio for select to authenticated
  using (public.es_hotel());
create policy stock_update_minimo on public.stock_edificio for update to authenticated
  using (public.es_hotel()) with check (public.es_hotel());

create policy movimientos_select on public.movimientos_stock for select to authenticated
  using (public.es_hotel());

-- -----------------------------------------------------------------------------
-- Remitos
-- -----------------------------------------------------------------------------
create policy remitos_select on public.remitos_envio for select to authenticated
  using (public.es_hotel() or (public.es_lavadero() and estado not in ('borrador')));

create policy remitos_insert on public.remitos_envio for insert to authenticated
  with check (public.es_hotel());

create policy remitos_update on public.remitos_envio for update to authenticated
  using (public.es_hotel() and estado = 'borrador')
  with check (public.es_hotel() and estado = 'borrador');

create policy remitos_delete on public.remitos_envio for delete to authenticated
  using (public.es_hotel() and estado = 'borrador');

-- Detalle: visible si el remito es visible
create policy detalle_select on public.detalle_remito for select to authenticated
  using (exists (select 1 from public.remitos_envio r where r.id = remito_id));

create policy detalle_write_hotel on public.detalle_remito for all to authenticated
  using (public.es_hotel() and exists (select 1 from public.remitos_envio r where r.id = remito_id and r.estado = 'borrador'))
  with check (public.es_hotel() and exists (select 1 from public.remitos_envio r where r.id = remito_id and r.estado = 'borrador'));

-- -----------------------------------------------------------------------------
-- Observaciones
-- -----------------------------------------------------------------------------
create policy observaciones_select on public.observaciones for select to authenticated
  using (exists (select 1 from public.remitos_envio r where r.id = remito_id));

create policy observaciones_insert_hotel on public.observaciones for insert to authenticated
  with check (public.es_hotel());

create policy observaciones_insert_lavadero on public.observaciones for insert to authenticated
  with check (
    public.es_lavadero()
    and etapa in ('recepcion', 'despacho')
    and exists (select 1 from public.remitos_envio r
                 where r.id = remito_id and r.estado in ('enviado', 'recibido'))
  );

-- -----------------------------------------------------------------------------
-- Pagos: sólo hotel
-- -----------------------------------------------------------------------------
create policy pagos_all on public.pagos_lavadero for all to authenticated
  using (public.es_hotel()) with check (public.es_hotel());

-- -----------------------------------------------------------------------------
-- Notificaciones: cada rol ve y marca las suyas
-- -----------------------------------------------------------------------------
create policy notif_select on public.notificaciones for select to authenticated
  using (rol_destino = public.rol_actual());
create policy notif_update on public.notificaciones for update to authenticated
  using (rol_destino = public.rol_actual()) with check (rol_destino = public.rol_actual());

-- -----------------------------------------------------------------------------
-- Realtime (en Supabase la publicación ya existe)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.remitos_envio, public.observaciones, public.stock_edificio, public.notificaciones;
  end if;
end $$;
