-- =============================================================================
--  Lavandería Terra Malal · 0007 · Prendas pendientes de entrega y resumen del lavadero
--
--  Cuando el lavadero despacha menos de lo que recibió (sin que sea rotura ni
--  faltante) la diferencia queda "pendiente de entrega": por ejemplo, una mancha
--  que se vuelve a lavar. El lavadero la ve como "A entregar", el hotel como
--  "A recibir", y en el próximo despacho de esa torre se puede sumar al remito.
--  Al cerrar ese remito el hotel valida también las pendientes y entran al depósito.
--
--  Facturación: la prenda retenida NO se paga en el remito original; se paga en el
--  remito con el que finalmente se entrega, al precio histórico del original.
--  Si se da por perdida no se paga (y, si es a cargo del lavadero, genera cargo).
-- =============================================================================

create type public.estado_pendiente as enum ('pendiente', 'en_camino', 'entregada', 'perdida');

create table public.pendientes_entrega (
  id                 bigint generated always as identity primary key,
  edificio_id        smallint not null references public.edificios (id),
  articulo_id        int not null references public.articulos (id),
  remito_origen_id   uuid not null references public.remitos_envio (id) on delete cascade,
  cantidad           int not null check (cantidad > 0),
  motivo             text,
  precio_unitario    numeric(12, 2) not null default 0,   -- precio histórico del remito original
  estado             public.estado_pendiente not null default 'pendiente',
  remito_entrega_id  uuid references public.remitos_envio (id) on delete set null,
  created_at         timestamptz not null default now(),
  entregada_at       timestamptz
);
create index on public.pendientes_entrega (edificio_id, estado);
create index on public.pendientes_entrega (remito_entrega_id);

alter table public.pendientes_entrega enable row level security;
revoke all on public.pendientes_entrega from anon;
revoke insert, update, delete on public.pendientes_entrega from authenticated;
create policy pendientes_select on public.pendientes_entrega for select to authenticated
  using (public.es_hotel() or public.es_lavadero());

create or replace view public.v_pendientes_entrega with (security_invoker = true) as
select p.*,
       e.nombre  as edificio_nombre,
       a.nombre  as articulo_nombre,
       a.orden   as articulo_orden,
       ro.codigo as remito_origen_codigo,
       ro.fecha  as remito_origen_fecha,
       re.codigo as remito_entrega_codigo
  from public.pendientes_entrega p
  join public.edificios e on e.id = p.edificio_id
  join public.articulos a on a.id = p.articulo_id
  join public.remitos_envio ro on ro.id = p.remito_origen_id
  left join public.remitos_envio re on re.id = p.remito_entrega_id;
revoke all on public.v_pendientes_entrega from anon;

-- Prendas que quedaron en el lavadero al despachar un remito.
create or replace function public._registrar_pendientes(p_remito uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_ret int;
  v_motivo text;
  v_n int := 0;
  v_edificio smallint;
begin
  select edificio_id into v_edificio from public.remitos_envio where id = p_remito;
  for d in select * from public.detalle_remito where remito_id = p_remito loop
    v_ret := coalesce(d.cantidad_recibida, 0) - coalesce(d.cantidad_devuelta, 0)
             - public._bajas_remito(p_remito, d.articulo_id);
    if v_ret > 0 then
      select string_agg(
               case o.tipo when 'mancha' then 'Mancha / no salió' else initcap(o.tipo::text) end
               || coalesce(': ' || o.descripcion, ''), ' · ')
        into v_motivo
        from public.observaciones o
       where o.remito_id = p_remito and o.articulo_id = d.articulo_id
         and o.tipo in ('mancha', 'otro') and o.estado <> 'rechazada';
      insert into public.pendientes_entrega (edificio_id, articulo_id, remito_origen_id, cantidad, motivo, precio_unitario)
      values (v_edificio, d.articulo_id, p_remito, v_ret, coalesce(v_motivo, 'Quedó en el lavadero'), d.precio_unitario_historico);
      v_n := v_n + v_ret;
    end if;
  end loop;
  return v_n;
end $$;

-- Paso C1 · Lavadero despacha (ahora puede sumar pendientes de remitos anteriores)
-- p_pendientes: [{"id": 5, "cantidad": 1}, ...]
drop function if exists public.despachar_remito(uuid, jsonb, text, jsonb);
create or replace function public.despachar_remito(
  p_remito uuid, p_items jsonb, p_firma text, p_observaciones jsonb default '[]', p_pendientes jsonb default '[]'
) returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare
  r public.remitos_envio;
  i jsonb;
  p public.pendientes_entrega;
  v_cant int;
  v_retenidas int;
  v_sumadas int := 0;
begin
  perform public.exigir_rol(array['lavadero', 'hotel']::public.rol_usuario[]);
  select * into r from public.remitos_envio where id = p_remito for update;
  if r.id is null or r.estado <> 'recibido' then
    raise exception 'El remito no está listo para despacho';
  end if;
  if coalesce(p_firma, '') = '' then raise exception 'La firma es obligatoria'; end if;

  perform public._insertar_observaciones(p_remito, 'despacho', p_observaciones);

  update public.detalle_remito d
     set cantidad_devuelta = coalesce(
           (select (x ->> 'cantidad')::int from jsonb_array_elements(coalesce(p_items, '[]')) x
             where (x ->> 'articulo_id')::int = d.articulo_id limit 1),
           greatest(d.cantidad_recibida - public._bajas_remito(p_remito, d.articulo_id), 0))
   where d.remito_id = p_remito;

  -- Pendientes de remitos anteriores que viajan con este despacho.
  for i in select * from jsonb_array_elements(coalesce(p_pendientes, '[]')) loop
    v_cant := nullif(i ->> 'cantidad', '')::int;
    if v_cant is not null and v_cant <= 0 then continue; end if;
    select * into p from public.pendientes_entrega
     where id = (i ->> 'id')::bigint and estado = 'pendiente'
       and edificio_id = r.edificio_id and remito_origen_id <> p_remito
     for update;
    if p.id is null then
      raise exception 'Una de las prendas pendientes ya no está disponible para entregar';
    end if;
    v_cant := least(coalesce(v_cant, p.cantidad), p.cantidad);
    if v_cant < p.cantidad then
      update public.pendientes_entrega set cantidad = cantidad - v_cant where id = p.id;
      insert into public.pendientes_entrega (edificio_id, articulo_id, remito_origen_id, cantidad, motivo, precio_unitario, estado, remito_entrega_id, created_at)
      values (p.edificio_id, p.articulo_id, p.remito_origen_id, v_cant, p.motivo, p.precio_unitario, 'en_camino', p_remito, p.created_at);
    else
      update public.pendientes_entrega set estado = 'en_camino', remito_entrega_id = p_remito where id = p.id;
    end if;
    v_sumadas := v_sumadas + v_cant;
  end loop;

  v_retenidas := public._registrar_pendientes(p_remito);

  update public.remitos_envio
     set estado = 'despachado', despachado_por = auth.uid(), firma_despacho = p_firma
   where id = p_remito
  returning * into r;

  if v_retenidas > 0 then
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('hotel', 'pendiente_entrega', 'Prendas pendientes de entrega · ' || r.codigo,
            v_retenidas || ' prenda(s) quedaron en el lavadero y se entregarán en un próximo envío.', r.id);
  end if;
  if v_sumadas > 0 then
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('hotel', 'pendiente_entrega', 'Llegan prendas pendientes con ' || r.codigo,
            v_sumadas || ' prenda(s) de envíos anteriores vienen en este despacho.', r.id);
  end if;
  return r;
end $$;

-- Paso C2 · Hotel valida y cierra (también las pendientes que vinieron en el remito)
-- p_pendientes: [{"id": 5, "cantidad": 1}] = lo que llegó. Sin lista, se asume que llegó todo.
drop function if exists public.cerrar_remito(uuid, jsonb, text, jsonb);
create or replace function public.cerrar_remito(
  p_remito uuid, p_items jsonb, p_firma text, p_observaciones jsonb default '[]', p_pendientes jsonb default null
) returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare
  r public.remitos_envio;
  p record;
  v_llego int;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  select * into r from public.remitos_envio where id = p_remito for update;
  if r.id is null or r.estado <> 'despachado' then
    raise exception 'El remito no está pendiente de validación';
  end if;
  if coalesce(p_firma, '') = '' then raise exception 'La firma es obligatoria'; end if;

  update public.detalle_remito d
     set cantidad_validada = coalesce(
           (select (x ->> 'cantidad')::int from jsonb_array_elements(coalesce(p_items, '[]')) x
             where (x ->> 'articulo_id')::int = d.articulo_id limit 1),
           d.cantidad_devuelta)
   where d.remito_id = p_remito;

  perform public._insertar_observaciones(p_remito, 'validacion', p_observaciones);
  perform public._observaciones_por_diferencia(p_remito, 'validacion', 'lavadero');

  for p in select pe.*, ro.codigo as origen_codigo
             from public.pendientes_entrega pe
             join public.remitos_envio ro on ro.id = pe.remito_origen_id
            where pe.remito_entrega_id = p_remito and pe.estado = 'en_camino'
            for update of pe loop
    if p_pendientes is null then
      v_llego := p.cantidad;
    else
      v_llego := coalesce((select (x ->> 'cantidad')::int from jsonb_array_elements(p_pendientes) x
                            where (x ->> 'id')::bigint = p.id limit 1), 0);
    end if;
    v_llego := greatest(least(v_llego, p.cantidad), 0);

    if v_llego > 0 then
      perform public.aplicar_movimiento(p.edificio_id, p.articulo_id, 'retorno_lavadero', 'lavadero', 'deposito',
        v_llego, p_remito, null, 'Pendiente de ' || p.origen_codigo || ' entregada con ' || r.codigo);
    end if;

    if v_llego = p.cantidad then
      update public.pendientes_entrega set estado = 'entregada', entregada_at = now() where id = p.id;
    elsif v_llego = 0 then
      -- No llegó: vuelve a quedar pendiente.
      update public.pendientes_entrega set estado = 'pendiente', remito_entrega_id = null where id = p.id;
    else
      update public.pendientes_entrega set cantidad = p.cantidad - v_llego, estado = 'pendiente', remito_entrega_id = null
       where id = p.id;
      insert into public.pendientes_entrega (edificio_id, articulo_id, remito_origen_id, cantidad, motivo, precio_unitario, estado, remito_entrega_id, created_at, entregada_at)
      values (p.edificio_id, p.articulo_id, p.remito_origen_id, v_llego, p.motivo, p.precio_unitario, 'entregada', p_remito, p.created_at, now());
    end if;
  end loop;

  update public.remitos_envio
     set estado = 'cerrado', cerrado_por = auth.uid(), firma_cierre = p_firma
   where id = p_remito
  returning * into r;
  return r;
end $$;

-- Hotel: la prenda pendiente no va a volver. Se registra como faltante en el remito
-- original (con cargo si es a cargo del lavadero) y se da de baja del stock.
create or replace function public.dar_pendiente_por_perdida(
  p_id bigint, p_responsable public.responsable_incidencia, p_nota text default null
) returns public.pendientes_entrega language plpgsql security definer set search_path = public as $$
declare p public.pendientes_entrega;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  select * into p from public.pendientes_entrega where id = p_id and estado = 'pendiente' for update;
  if p.id is null then raise exception 'La prenda ya no está pendiente'; end if;

  insert into public.observaciones (remito_id, articulo_id, etapa, tipo, responsable, cantidad, descripcion)
  values (p.remito_origen_id, p.articulo_id, 'validacion', 'faltante', p_responsable, p.cantidad,
          'Pendiente de entrega no devuelta' || coalesce(': ' || nullif(p_nota, ''), ''));

  update public.pendientes_entrega set estado = 'perdida', entregada_at = now() where id = p.id
  returning * into p;
  return p;
end $$;

-- Pagos visibles para el lavadero (sólo fecha, monto, medio y comprobante).
create or replace function public.pagos_recibidos()
returns table (fecha date, monto numeric, metodo public.metodo_pago, comprobante_nro text, periodo date)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_rol(array['lavadero', 'hotel']::public.rol_usuario[]);
  return query select pl.fecha, pl.monto, pl.metodo, pl.comprobante_nro, pl.periodo
                 from public.pagos_lavadero pl order by pl.fecha desc, pl.id desc;
end $$;

revoke execute on function public._registrar_pendientes(uuid) from public;
revoke execute on function public.dar_pendiente_por_perdida(bigint, public.responsable_incidencia, text) from public, anon;
revoke execute on function public.pagos_recibidos() from public, anon;
grant execute on function public.dar_pendiente_por_perdida(bigint, public.responsable_incidencia, text) to authenticated;
grant execute on function public.pagos_recibidos() to authenticated;

-- Prendas que ya quedaron retenidas en despachos anteriores a esta migración.
insert into public.pendientes_entrega (edificio_id, articulo_id, remito_origen_id, cantidad, motivo, created_at, precio_unitario)
select r.edificio_id, d.articulo_id, r.id,
       d.cantidad_recibida - d.cantidad_devuelta - public._bajas_remito(r.id, d.articulo_id),
       coalesce((select string_agg(case o.tipo when 'mancha' then 'Mancha / no salió' else initcap(o.tipo::text) end
                                   || coalesce(': ' || o.descripcion, ''), ' · ')
                   from public.observaciones o
                  where o.remito_id = r.id and o.articulo_id = d.articulo_id
                    and o.tipo in ('mancha', 'otro') and o.estado <> 'rechazada'), 'Quedó en el lavadero'),
       coalesce(r.despachado_at, now()),
       d.precio_unitario_historico
  from public.remitos_envio r
  join public.detalle_remito d on d.remito_id = r.id
 where r.estado in ('despachado', 'cerrado')
   and d.cantidad_recibida - d.cantidad_devuelta - public._bajas_remito(r.id, d.articulo_id) > 0
   and not exists (select 1 from public.pendientes_entrega x where x.remito_origen_id = r.id and x.articulo_id = d.articulo_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pendientes_entrega;
  end if;
end $$;

-- =============================================================================
--  Facturación con pendientes
--  v_lineas_facturacion: lo que se paga por remito y artículo.
--   + lo recibido por el lavadero en el remito
--   − lo que quedó retenido en ese remito (todas sus partes, en cualquier estado)
--   + lo retenido de remitos anteriores que se entregó con este remito
-- =============================================================================
create or replace view public.v_lineas_facturacion with (security_invoker = true) as
select r.id as remito_id, r.fecha, r.estado, r.edificio_id, d.articulo_id,
       coalesce(d.cantidad_recibida, 0) as prendas, d.subtotal as importe, 'lavado'::text as concepto
  from public.detalle_remito d
  join public.remitos_envio r on r.id = d.remito_id
union all
select ro.id, ro.fecha, ro.estado, ro.edificio_id, pe.articulo_id,
       -pe.cantidad, -(pe.cantidad * pe.precio_unitario), 'retenida'
  from public.pendientes_entrega pe
  join public.remitos_envio ro on ro.id = pe.remito_origen_id
union all
select re.id, re.fecha, re.estado, re.edificio_id, pe.articulo_id,
       pe.cantidad, pe.cantidad * pe.precio_unitario, 'pendiente_entregada'
  from public.pendientes_entrega pe
  join public.remitos_envio re on re.id = pe.remito_entrega_id
 where pe.estado in ('en_camino', 'entregada');
revoke all on public.v_lineas_facturacion from anon;

create or replace view public.v_remitos with (security_invoker = true) as
select r.*,
       e.codigo as edificio_codigo,
       e.nombre as edificio_nombre,
       coalesce(sum(d.cantidad_enviada), 0)::int  as prendas_enviadas,
       sum(d.cantidad_recibida)::int              as prendas_recibidas,
       sum(d.cantidad_devuelta)::int              as prendas_devueltas,
       sum(d.cantidad_validada)::int              as prendas_validadas,
       coalesce((select sum(l.importe) from public.v_lineas_facturacion l where l.remito_id = r.id), 0) as importe,
       (select count(*) from public.observaciones o
         where o.remito_id = r.id and o.estado = 'pendiente')::int as observaciones_pendientes,
       coalesce((select sum(pe.cantidad) from public.pendientes_entrega pe
                  where pe.remito_origen_id = r.id and pe.estado in ('pendiente', 'en_camino')), 0)::int as prendas_retenidas,
       coalesce((select sum(pe.cantidad) from public.pendientes_entrega pe
                  where pe.remito_entrega_id = r.id and pe.estado in ('en_camino', 'entregada')), 0)::int as prendas_pendientes_incluidas
  from public.remitos_envio r
  join public.edificios e on e.id = r.edificio_id
  left join public.detalle_remito d on d.remito_id = r.id
 group by r.id, e.id;

create or replace view public.v_liquidacion_mensual with (security_invoker = true) as
with lavado as (
  select date_trunc('month', l.fecha)::date as periodo, l.edificio_id,
         count(distinct l.remito_id)::int as remitos,
         coalesce(sum(l.prendas), 0)::int as prendas,
         coalesce(sum(l.importe), 0) as importe_lavado
    from public.v_lineas_facturacion l
   where l.estado = 'cerrado'
   group by 1, 2
), cargos as (
  select date_trunc('month', r.fecha)::date as periodo, r.edificio_id,
         coalesce(sum(o.importe_cargo), 0) as cargos_lavadero,
         count(*)::int as incidencias
    from public.observaciones o
    join public.remitos_envio r on r.id = o.remito_id
   where o.estado = 'aprobada' and o.importe_cargo > 0 and r.estado = 'cerrado'
   group by 1, 2
)
select coalesce(l.periodo, c.periodo)          as periodo,
       coalesce(l.edificio_id, c.edificio_id)  as edificio_id,
       e.codigo as edificio_codigo,
       e.nombre as edificio_nombre,
       coalesce(l.remitos, 0)          as remitos,
       coalesce(l.prendas, 0)          as prendas,
       coalesce(l.importe_lavado, 0)   as importe_lavado,
       coalesce(c.cargos_lavadero, 0)  as cargos_lavadero,
       coalesce(c.incidencias, 0)      as incidencias,
       coalesce(l.importe_lavado, 0) - coalesce(c.cargos_lavadero, 0) as neto
  from lavado l
  full join cargos c on c.periodo = l.periodo and c.edificio_id = l.edificio_id
  join public.edificios e on e.id = coalesce(l.edificio_id, c.edificio_id)
 where public.es_hotel();

create or replace view public.v_gasto_articulo_mensual with (security_invoker = true) as
select date_trunc('month', l.fecha)::date as periodo, l.edificio_id, e.codigo as edificio_codigo,
       a.id as articulo_id, a.nombre as articulo_nombre,
       sum(l.prendas)::int as prendas, sum(l.importe) as importe
  from public.v_lineas_facturacion l
  join public.edificios e on e.id = l.edificio_id
  join public.articulos a on a.id = l.articulo_id
 where public.es_hotel() and l.estado = 'cerrado'
 group by 1, 2, 3, 4, 5;

