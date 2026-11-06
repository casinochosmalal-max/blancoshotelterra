-- =============================================================================
--  Lavandería Terra Malal · 0008 · Carga de envíos atrasados
--
--  - Los remitos pueden cargarse con fecha pasada (nunca futura).
--  - Los remitos con fecha anterior al conteo inicial de stock (05/11/2026) no
--    mueven stock: el conteo ya refleja esos envíos. Sólo cuentan para pagos.
--    Las roturas/faltantes de esos remitos tampoco descuentan stock.
--  - Corrige los 2 envíos ya cargados: el primero pasa al 02/11 y el segundo al 03/11,
--    y se revierte el stock que habían movido.
--
--  Requiere haber corrido antes 0007_pendientes_entrega.sql.
-- =============================================================================
begin;

-- Fecha del conteo inicial. Para cambiarla, reemplazar esta función.
create or replace function public.fecha_inicio_stock()
returns date language sql immutable as $$ select date '2026-11-05' $$;

alter table public.remitos_envio add column if not exists mueve_stock boolean not null default true;

create or replace function public.tg_remito_antes_insertar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_codigo_edificio text;
  v_cant int;
begin
  new.fecha := coalesce(new.fecha, public.hoy());
  if new.fecha > public.hoy() then
    raise exception 'La fecha del envío no puede ser futura' using errcode = 'P0001';
  end if;
  -- Los envíos anteriores al conteo inicial no mueven stock (el conteo ya los refleja).
  new.mueve_stock := new.fecha >= public.fecha_inicio_stock();
  new.estado := 'borrador';
  new.creado_por := coalesce(new.creado_por, auth.uid());

  -- Serializa altas concurrentes del mismo edificio/día.
  perform pg_advisory_xact_lock(hashtext('remito:' || new.edificio_id || ':' || new.fecha));

  select count(*) into v_cant
    from public.remitos_envio
   where edificio_id = new.edificio_id and fecha = new.fecha and estado <> 'anulado';

  if v_cant >= 2 then
    raise exception 'Ya hay 2 envíos registrados para este edificio el %', to_char(new.fecha, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  -- Reutiliza el número de un envío anulado si lo hubiera.
  select n into new.nro_envio_dia
    from generate_series(1, 2) n
   where not exists (
     select 1 from public.remitos_envio r
      where r.edificio_id = new.edificio_id and r.fecha = new.fecha and r.nro_envio_dia = n
        and r.estado <> 'anulado')
   order by n limit 1;

  if new.nro_envio_dia is null then
    raise exception 'No quedan números de envío disponibles para el %', to_char(new.fecha, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  select codigo into v_codigo_edificio from public.edificios where id = new.edificio_id;
  new.codigo := v_codigo_edificio || '-' || to_char(new.fecha, 'YYYYMMDD') || '-' || new.nro_envio_dia;
  return new;
end $$;

create or replace function public.tg_remito_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_edificio text;
begin
  if new.estado = old.estado then
    return new;
  end if;

  select nombre into v_edificio from public.edificios where id = new.edificio_id;

  if new.estado = 'enviado' then
    for d in select * from public.detalle_remito where remito_id = new.id and new.mueve_stock loop
      perform public.aplicar_movimiento(new.edificio_id, d.articulo_id, 'envio_lavadero',
        new.ubicacion_origen, 'lavadero', d.cantidad_enviada, new.id, null, 'Remito ' || new.codigo);
    end loop;
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('lavadero', 'nuevo_envio', 'Nuevo envío ' || new.codigo,
            v_edificio || ' preparó un envío para retirar.', new.id);

  elsif new.estado = 'recibido' then
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('hotel', case when new.conforme then 'recepcion_conforme' else 'recepcion_observada' end,
            'Remito ' || new.codigo || case when new.conforme then ' recibido conforme' else ' recibido con observaciones' end,
            null, new.id);

  elsif new.estado = 'despachado' then
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('hotel', 'despacho', 'Ropa limpia en camino · ' || new.codigo,
            'El lavadero despachó la ropa limpia de ' || v_edificio || '.', new.id);

  elsif new.estado = 'cerrado' then
    for d in select * from public.detalle_remito where remito_id = new.id and new.mueve_stock loop
      perform public.aplicar_movimiento(new.edificio_id, d.articulo_id, 'retorno_lavadero',
        'lavadero', 'deposito', coalesce(d.cantidad_validada, 0), new.id, null, 'Cierre remito ' || new.codigo);
    end loop;

  elsif new.estado = 'anulado' and old.estado = 'enviado' then
    for d in select * from public.detalle_remito where remito_id = new.id and new.mueve_stock loop
      perform public.aplicar_movimiento(new.edificio_id, d.articulo_id, 'anulacion',
        'lavadero', new.ubicacion_origen, d.cantidad_enviada, new.id, null, 'Anulación remito ' || new.codigo);
    end loop;
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('lavadero', 'anulado', 'Envío ' || new.codigo || ' anulado', new.anulado_motivo, new.id);
  end if;

  return new;
end $$;

create or replace function public.tg_observacion_despues()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.remitos_envio;
begin
  select * into r from public.remitos_envio where id = new.remito_id;

  if tg_op = 'INSERT' then
    update public.remitos_envio set tiene_observaciones = true where id = new.remito_id and not tiene_observaciones;
    if new.estado = 'pendiente' then
      insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
      values ('hotel', 'observacion', 'Observación en ' || r.codigo,
              initcap(new.tipo::text) || ' x' || new.cantidad || ' (cargo ' || new.responsable || ')'
              || coalesce(': ' || new.descripcion, ''), new.remito_id);
    end if;
  end if;

  -- Baja de stock al aprobarse una rotura o faltante (las prendas estaban "en lavadero").
  if new.estado = 'aprobada'
     and (tg_op = 'INSERT' or old.estado <> 'aprobada')
     and new.tipo in ('rotura', 'faltante')
     and new.articulo_id is not null
     and r.mueve_stock then
    perform public.aplicar_movimiento(r.edificio_id, new.articulo_id, 'baja', 'lavadero', null,
      new.cantidad, new.remito_id, new.id,
      initcap(new.tipo::text) || ' a cargo de ' || new.responsable || ' · ' || r.codigo);
  end if;

  return new;
end $$;

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

  for p in select pe.*, ro.codigo as origen_codigo, ro.mueve_stock as origen_mueve_stock
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

    if v_llego > 0 and r.mueve_stock then
      if p.origen_mueve_stock then
        perform public.aplicar_movimiento(p.edificio_id, p.articulo_id, 'retorno_lavadero', 'lavadero', 'deposito',
          v_llego, p_remito, null, 'Pendiente de ' || p.origen_codigo || ' entregada con ' || r.codigo);
      else
        -- Venía de un envío anterior al conteo: nunca figuró "en lavadero", entra directo al depósito.
        perform public.aplicar_movimiento(p.edificio_id, p.articulo_id, 'ajuste', null, 'deposito',
          v_llego, p_remito, null, 'Pendiente de ' || p.origen_codigo || ' (carga histórica) entregada con ' || r.codigo);
      end if;
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

-- -----------------------------------------------------------------------------
-- Corrección de los 2 envíos ya cargados
-- -----------------------------------------------------------------------------
do $$
declare
  v_ids uuid[];
  v_fechas date[] := array[date '2026-11-02', date '2026-11-03'];
  v_viejo text;
  v_nuevo text;
  i int;
begin
  select array_agg(id order by created_at) into v_ids
    from public.remitos_envio where estado <> 'anulado';

  if coalesce(array_length(v_ids, 1), 0) <> 2 then
    raise exception 'Se esperaban exactamente 2 envíos cargados y hay %. No se cambió nada.',
      coalesce(array_length(v_ids, 1), 0);
  end if;

  -- Revertir el stock que movieron (envío, cierre, bajas) y borrar esos movimientos.
  update public.stock_edificio s
     set cantidad = greatest(s.cantidad + x.neto, 0)
    from (
      select edificio_id, articulo_id, ubicacion, sum(delta) as neto
        from (
          select edificio_id, articulo_id, origen as ubicacion, cantidad as delta
            from public.movimientos_stock where remito_id = any (v_ids) and origen is not null
          union all
          select edificio_id, articulo_id, destino, -cantidad
            from public.movimientos_stock where remito_id = any (v_ids) and destino is not null
        ) m
       group by 1, 2, 3
    ) x
   where s.edificio_id = x.edificio_id and s.articulo_id = x.articulo_id and s.ubicacion = x.ubicacion;

  delete from public.movimientos_stock where remito_id = any (v_ids);

  -- Liberar los números del día antes de reasignar (evita choques con el índice único).
  update public.remitos_envio set codigo = codigo || '-TMP' where id = any (v_ids);

  for i in 1 .. 2 loop
    select replace(codigo, '-TMP', '') into v_viejo from public.remitos_envio where id = v_ids[i];
    update public.remitos_envio r
       set fecha = v_fechas[i],
           nro_envio_dia = 1,
           mueve_stock = false,
           codigo = e.codigo || '-' || to_char(v_fechas[i], 'YYYYMMDD') || '-1'
      from public.edificios e
     where r.id = v_ids[i] and e.id = r.edificio_id
    returning r.codigo into v_nuevo;

    update public.notificaciones set titulo = replace(titulo, v_viejo, v_nuevo), mensaje = replace(mensaje, v_viejo, v_nuevo)
     where remito_id = v_ids[i];
    raise notice '% -> %', v_viejo, v_nuevo;
  end loop;
end $$;

commit;

-- Verificación
select codigo, fecha, estado, mueve_stock from public.remitos_envio order by fecha, codigo;
