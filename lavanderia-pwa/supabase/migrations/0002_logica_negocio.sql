-- =============================================================================
--  Lavandería Hotel Terra Blancos · 0002 · Lógica de negocio
--  Helpers de rol, triggers de stock, máquina de estados del remito y RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers de rol (SECURITY DEFINER para que las políticas RLS no se recursen)
-- -----------------------------------------------------------------------------
create or replace function public.rol_actual()
returns public.rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.es_hotel()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'hotel', false)
$$;

create or replace function public.es_lavadero()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'lavadero', false)
$$;

create or replace function public.exigir_rol(p_roles public.rol_usuario[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.rol_actual() is null or not (public.rol_actual() = any (p_roles)) then
    raise exception 'Permiso denegado para el rol actual' using errcode = '42501';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- updated_at genérico
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger set_updated_at before update on public.articulos      for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.stock_edificio for each row execute function public.tg_set_updated_at();
create trigger set_updated_at before update on public.remitos_envio  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Alta automática de perfil al crear un usuario en Supabase Auth.
-- El rol se toma de raw_APP_meta_data (sólo editable por el service role),
-- nunca de user_meta_data, que el propio usuario puede escribir.
-- -----------------------------------------------------------------------------
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol, telefono_whatsapp)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    nullif(new.raw_app_meta_data ->> 'rol', '')::public.rol_usuario,
    new.raw_user_meta_data ->> 'telefono_whatsapp'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

-- -----------------------------------------------------------------------------
-- Matriz de stock: al crear un edificio o un artículo se crean sus 3 ubicaciones
-- -----------------------------------------------------------------------------
create or replace function public.tg_crear_filas_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'edificios' then
    insert into public.stock_edificio (edificio_id, articulo_id, ubicacion)
    select new.id, a.id, u.ubic
      from public.articulos a
     cross join unnest(enum_range(null::public.ubicacion_stock)) as u(ubic)
    on conflict do nothing;
  else
    insert into public.stock_edificio (edificio_id, articulo_id, ubicacion)
    select e.id, new.id, u.ubic
      from public.edificios e
     cross join unnest(enum_range(null::public.ubicacion_stock)) as u(ubic)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger crear_stock after insert on public.edificios for each row execute function public.tg_crear_filas_stock();
create trigger crear_stock after insert on public.articulos for each row execute function public.tg_crear_filas_stock();

-- -----------------------------------------------------------------------------
-- Histórico de precios: cada alta o cambio de precio queda registrado
-- -----------------------------------------------------------------------------
create or replace function public.tg_historico_precio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.precio_unitario_actual is distinct from old.precio_unitario_actual then
    insert into public.precios_historicos (articulo_id, precio_anterior, precio_nuevo, modificado_por, motivo)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.precio_unitario_actual end,
      new.precio_unitario_actual,
      auth.uid(),
      nullif(current_setting('app.motivo_precio', true), '')
    );
  end if;
  return new;
end $$;

create trigger historico_precio
  after insert or update of precio_unitario_actual on public.articulos
  for each row execute function public.tg_historico_precio();

-- -----------------------------------------------------------------------------
-- Núcleo: aplicar un movimiento de stock (único punto que toca cantidades)
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_movimiento(
  p_edificio    smallint,
  p_articulo    int,
  p_tipo        public.tipo_movimiento,
  p_origen      public.ubicacion_stock,
  p_destino     public.ubicacion_stock,
  p_cantidad    int,
  p_remito      uuid   default null,
  p_observacion bigint default null,
  p_motivo      text   default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_disponible int;
  v_nombre     text;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return;
  end if;

  if p_origen is not null then
    update public.stock_edificio
       set cantidad = cantidad - p_cantidad
     where edificio_id = p_edificio and articulo_id = p_articulo and ubicacion = p_origen
       and cantidad >= p_cantidad;

    if not found then
      select s.cantidad, a.nombre into v_disponible, v_nombre
        from public.stock_edificio s join public.articulos a on a.id = s.articulo_id
       where s.edificio_id = p_edificio and s.articulo_id = p_articulo and s.ubicacion = p_origen;
      raise exception 'Stock insuficiente de "%" en %: disponible %, solicitado %',
        coalesce(v_nombre, p_articulo::text), p_origen, coalesce(v_disponible, 0), p_cantidad
        using errcode = 'P0001';
    end if;
  end if;

  if p_destino is not null then
    insert into public.stock_edificio (edificio_id, articulo_id, ubicacion, cantidad)
    values (p_edificio, p_articulo, p_destino, p_cantidad)
    on conflict (edificio_id, articulo_id, ubicacion)
    do update set cantidad = public.stock_edificio.cantidad + excluded.cantidad;
  end if;

  insert into public.movimientos_stock
    (edificio_id, articulo_id, tipo, origen, destino, cantidad, remito_id, observacion_id, motivo, created_by)
  values
    (p_edificio, p_articulo, p_tipo, p_origen, p_destino, p_cantidad, p_remito, p_observacion, p_motivo, auth.uid());
end $$;

-- -----------------------------------------------------------------------------
-- Remito: numeración diaria (máx. 2 por edificio y día) y código legible
-- -----------------------------------------------------------------------------
create or replace function public.tg_remito_antes_insertar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_codigo_edificio text;
  v_cant int;
begin
  new.fecha := coalesce(new.fecha, public.hoy());
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

create trigger remito_antes_insertar
  before insert on public.remitos_envio
  for each row execute function public.tg_remito_antes_insertar();

-- -----------------------------------------------------------------------------
-- Detalle: copia el precio vigente y bloquea cambios fuera de borrador
-- -----------------------------------------------------------------------------
create or replace function public.tg_detalle_guardas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_estado public.estado_remito;
begin
  select estado into v_estado from public.remitos_envio
   where id = coalesce(new.remito_id, old.remito_id);

  if tg_op = 'INSERT' then
    if v_estado <> 'borrador' then
      raise exception 'Sólo se pueden agregar artículos a un remito en borrador';
    end if;
    select precio_unitario_actual into new.precio_unitario_historico
      from public.articulos where id = new.articulo_id;
    return new;
  elsif tg_op = 'UPDATE' then
    if v_estado <> 'borrador' and (new.cantidad_enviada <> old.cantidad_enviada
                                   or new.articulo_id <> old.articulo_id
                                   or new.precio_unitario_historico <> old.precio_unitario_historico) then
      raise exception 'Las cantidades enviadas y precios quedan fijos una vez enviado el remito';
    end if;
    return new;
  else -- DELETE
    if v_estado is not null and v_estado <> 'borrador' then
      raise exception 'No se pueden quitar artículos de un remito ya enviado';
    end if;
    return old;
  end if;
end $$;

create trigger detalle_guardas
  before insert or update or delete on public.detalle_remito
  for each row execute function public.tg_detalle_guardas();

-- -----------------------------------------------------------------------------
-- Máquina de estados del remito
--   borrador -> enviado -> recibido -> despachado -> cerrado
--   borrador | enviado -> anulado
-- -----------------------------------------------------------------------------
create or replace function public.tg_remito_transicion()
returns trigger language plpgsql as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
       (old.estado = 'borrador'   and new.estado in ('enviado', 'anulado'))
    or (old.estado = 'enviado'    and new.estado in ('recibido', 'anulado'))
    or (old.estado = 'recibido'   and new.estado = 'despachado')
    or (old.estado = 'despachado' and new.estado = 'cerrado')
  ) then
    raise exception 'Transición de estado no permitida: % -> %', old.estado, new.estado;
  end if;

  if new.estado = 'enviado' and not exists (select 1 from public.detalle_remito where remito_id = new.id) then
    raise exception 'El remito no tiene artículos';
  end if;

  if new.estado = 'enviado'    then new.enviado_at    := now(); end if;
  if new.estado = 'recibido'   then new.recibido_at   := now(); end if;
  if new.estado = 'despachado' then new.despachado_at := now(); end if;
  if new.estado = 'cerrado'    then new.cerrado_at    := now(); end if;
  -- El código del anulado se renombra para liberar el número del día.
  if new.estado = 'anulado'    then new.codigo := new.codigo || '-ANU' || new.numero; end if;
  return new;
end $$;

create trigger remito_transicion
  before update of estado on public.remitos_envio
  for each row execute function public.tg_remito_transicion();

-- -----------------------------------------------------------------------------
-- TRIGGER DE STOCK: mueve las prendas según el cambio de estado del remito
--   enviado : origen (depósito)  -> lavadero   (cantidad_enviada)
--   cerrado : lavadero           -> depósito   (cantidad_validada)
--   anulado (desde enviado): lavadero -> origen (revierte el envío)
-- Además genera la notificación in-app correspondiente.
-- -----------------------------------------------------------------------------
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
    for d in select * from public.detalle_remito where remito_id = new.id loop
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
    for d in select * from public.detalle_remito where remito_id = new.id loop
      perform public.aplicar_movimiento(new.edificio_id, d.articulo_id, 'retorno_lavadero',
        'lavadero', 'deposito', coalesce(d.cantidad_validada, 0), new.id, null, 'Cierre remito ' || new.codigo);
    end loop;

  elsif new.estado = 'anulado' and old.estado = 'enviado' then
    for d in select * from public.detalle_remito where remito_id = new.id loop
      perform public.aplicar_movimiento(new.edificio_id, d.articulo_id, 'anulacion',
        'lavadero', new.ubicacion_origen, d.cantidad_enviada, new.id, null, 'Anulación remito ' || new.codigo);
    end loop;
    insert into public.notificaciones (rol_destino, tipo, titulo, mensaje, remito_id)
    values ('lavadero', 'anulado', 'Envío ' || new.codigo || ' anulado', new.anulado_motivo, new.id);
  end if;

  return new;
end $$;

create trigger remito_stock
  after update of estado on public.remitos_envio
  for each row execute function public.tg_remito_stock();

-- -----------------------------------------------------------------------------
-- Observaciones: copia el costo de reposición, auto-aprueba las del hotel,
-- da de baja prendas rotas/faltantes al aprobarse y avisa al otro rol.
-- -----------------------------------------------------------------------------
create or replace function public.tg_observacion_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.reportado_por := coalesce(new.reportado_por, auth.uid());
    if new.articulo_id is not null then
      select costo_reposicion into new.cargo_unitario from public.articulos where id = new.articulo_id;
    end if;
    -- El lavadero sólo puede crear observaciones pendientes; el hotel aprueba directamente las propias.
    if public.es_lavadero() or new.automatica then
      new.estado := 'pendiente';
    elsif public.es_hotel() then
      new.estado := 'aprobada';
      new.resuelta_por := auth.uid();
      new.resuelta_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    if old.estado <> 'pendiente' and new.estado is distinct from old.estado then
      raise exception 'La observación ya fue resuelta';
    end if;
    if new.estado <> old.estado then
      new.resuelta_por := auth.uid();
      new.resuelta_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger observacion_antes
  before insert or update on public.observaciones
  for each row execute function public.tg_observacion_antes();

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
     and new.articulo_id is not null then
    perform public.aplicar_movimiento(r.edificio_id, new.articulo_id, 'baja', 'lavadero', null,
      new.cantidad, new.remito_id, new.id,
      initcap(new.tipo::text) || ' a cargo de ' || new.responsable || ' · ' || r.codigo);
  end if;

  return new;
end $$;

create trigger observacion_despues
  after insert or update of estado on public.observaciones
  for each row execute function public.tg_observacion_despues();

-- =============================================================================
--  RPCs (lo que llama la app). Todas validan rol y estado.
--  p_items: [{"articulo_id": 1, "cantidad": 10}, ...]
--  p_observaciones: [{"articulo_id": 1, "tipo": "rotura", "responsable": "lavadero",
--                     "cantidad": 1, "descripcion": "...", "foto_url": "..."}]
-- =============================================================================

create or replace function public._insertar_observaciones(
  p_remito uuid, p_etapa public.etapa_remito, p_observaciones jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.observaciones (remito_id, articulo_id, etapa, tipo, responsable, cantidad, descripcion, foto_url)
  select p_remito,
         nullif(o ->> 'articulo_id', '')::int,
         p_etapa,
         (o ->> 'tipo')::public.tipo_observacion,
         (o ->> 'responsable')::public.responsable_incidencia,
         coalesce(nullif(o ->> 'cantidad', '')::int, 1),
         nullif(o ->> 'descripcion', ''),
         nullif(o ->> 'foto_url', '')
    from jsonb_array_elements(coalesce(p_observaciones, '[]'::jsonb)) o;
end $$;

-- Crea observaciones automáticas por diferencias de conteo no explicadas.
create or replace function public._observaciones_por_diferencia(
  p_remito uuid, p_etapa public.etapa_remito, p_responsable_faltante public.responsable_incidencia
) returns int language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_esperado int;
  v_contado  int;
  v_explicado int;
  v_creadas int := 0;
begin
  for d in select * from public.detalle_remito where remito_id = p_remito loop
    v_esperado := case p_etapa when 'recepcion'  then d.cantidad_enviada
                               when 'despacho'   then d.cantidad_recibida
                               else d.cantidad_devuelta end;
    v_contado  := case p_etapa when 'recepcion'  then d.cantidad_recibida
                               when 'despacho'   then d.cantidad_devuelta
                               else d.cantidad_validada end;
    if v_esperado is null or v_contado is null or v_esperado = v_contado then
      continue;
    end if;

    select coalesce(sum(cantidad), 0) into v_explicado
      from public.observaciones
     where remito_id = p_remito and etapa = p_etapa and articulo_id = d.articulo_id
       and tipo in ('faltante', 'rotura', 'sobrante');

    if v_contado < v_esperado and (v_esperado - v_contado) > v_explicado then
      insert into public.observaciones (remito_id, articulo_id, etapa, tipo, responsable, cantidad, descripcion, automatica)
      values (p_remito, d.articulo_id, p_etapa, 'faltante', p_responsable_faltante,
              (v_esperado - v_contado) - v_explicado,
              format('Diferencia de conteo: esperado %s, contado %s', v_esperado, v_contado), true);
      v_creadas := v_creadas + 1;
    elsif v_contado > v_esperado and v_explicado = 0 then
      insert into public.observaciones (remito_id, articulo_id, etapa, tipo, responsable, cantidad, descripcion, automatica)
      values (p_remito, d.articulo_id, p_etapa, 'sobrante', 'hotel', v_contado - v_esperado,
              format('Sobrante: esperado %s, contado %s', v_esperado, v_contado), true);
      v_creadas := v_creadas + 1;
    end if;
  end loop;
  return v_creadas;
end $$;

-- Prendas que no vuelven al depósito: roturas de cualquier etapa previa
-- y faltantes declarados en el despacho (las de recepción ya están descontadas del conteo).
create or replace function public._bajas_remito(p_remito uuid, p_articulo int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(cantidad), 0)::int
    from public.observaciones
   where remito_id = p_remito and articulo_id = p_articulo and estado <> 'rechazada'
     and (tipo = 'rotura' or (tipo = 'faltante' and etapa = 'despacho'))
$$;

-- Paso A · Hotel envía el remito al lavadero
create or replace function public.enviar_remito(p_remito uuid)
returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare r public.remitos_envio;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  update public.remitos_envio set estado = 'enviado'
   where id = p_remito and estado = 'borrador'
  returning * into r;
  if r.id is null then raise exception 'El remito no existe o ya fue enviado'; end if;
  return r;
end $$;

-- Paso B · Lavadero recepciona, cuenta y firma
create or replace function public.recepcionar_remito(
  p_remito uuid, p_items jsonb, p_firma text, p_observaciones jsonb default '[]'
) returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare r public.remitos_envio;
begin
  perform public.exigir_rol(array['lavadero', 'hotel']::public.rol_usuario[]);
  select * into r from public.remitos_envio where id = p_remito for update;
  if r.id is null or r.estado <> 'enviado' then
    raise exception 'El remito no está pendiente de recepción';
  end if;
  if coalesce(p_firma, '') = '' then raise exception 'La firma es obligatoria'; end if;

  -- Sin conteo explícito se asume lo enviado.
  update public.detalle_remito d
     set cantidad_recibida = coalesce(
           (select (i ->> 'cantidad')::int from jsonb_array_elements(coalesce(p_items, '[]')) i
             where (i ->> 'articulo_id')::int = d.articulo_id limit 1),
           d.cantidad_enviada)
   where d.remito_id = p_remito;

  perform public._insertar_observaciones(p_remito, 'recepcion', p_observaciones);
  perform public._observaciones_por_diferencia(p_remito, 'recepcion', 'hotel');

  update public.remitos_envio
     set estado = 'recibido',
         recibido_por = auth.uid(),
         firma_recepcion = p_firma,
         conforme = not exists (select 1 from public.observaciones o where o.remito_id = p_remito and o.etapa = 'recepcion')
   where id = p_remito
  returning * into r;
  return r;
end $$;

-- Paso C1 · Lavadero despacha la ropa limpia
create or replace function public.despachar_remito(
  p_remito uuid, p_items jsonb, p_firma text, p_observaciones jsonb default '[]'
) returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare r public.remitos_envio;
begin
  perform public.exigir_rol(array['lavadero', 'hotel']::public.rol_usuario[]);
  select * into r from public.remitos_envio where id = p_remito for update;
  if r.id is null or r.estado <> 'recibido' then
    raise exception 'El remito no está listo para despacho';
  end if;
  if coalesce(p_firma, '') = '' then raise exception 'La firma es obligatoria'; end if;

  perform public._insertar_observaciones(p_remito, 'despacho', p_observaciones);

  -- Sin cantidad explícita se asume: recibido - roturas - faltantes del lavadero.
  -- (cantidad_devuelta = prendas en buen estado que vuelven al hotel)
  update public.detalle_remito d
     set cantidad_devuelta = coalesce(
           (select (i ->> 'cantidad')::int from jsonb_array_elements(coalesce(p_items, '[]')) i
             where (i ->> 'articulo_id')::int = d.articulo_id limit 1),
           greatest(d.cantidad_recibida - public._bajas_remito(p_remito, d.articulo_id), 0))
   where d.remito_id = p_remito;

  update public.remitos_envio
     set estado = 'despachado', despachado_por = auth.uid(), firma_despacho = p_firma
   where id = p_remito
  returning * into r;
  return r;
end $$;

-- Paso C2 · Hotel valida el ingreso al depósito, firma y cierra
create or replace function public.cerrar_remito(
  p_remito uuid, p_items jsonb, p_firma text, p_observaciones jsonb default '[]'
) returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare r public.remitos_envio;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  select * into r from public.remitos_envio where id = p_remito for update;
  if r.id is null or r.estado <> 'despachado' then
    raise exception 'El remito no está pendiente de validación';
  end if;
  if coalesce(p_firma, '') = '' then raise exception 'La firma es obligatoria'; end if;

  update public.detalle_remito d
     set cantidad_validada = coalesce(
           (select (i ->> 'cantidad')::int from jsonb_array_elements(coalesce(p_items, '[]')) i
             where (i ->> 'articulo_id')::int = d.articulo_id limit 1),
           d.cantidad_devuelta)
   where d.remito_id = p_remito;

  perform public._insertar_observaciones(p_remito, 'validacion', p_observaciones);
  -- Lo que el lavadero declaró devolver y no llegó queda como faltante (pendiente de aprobación).
  perform public._observaciones_por_diferencia(p_remito, 'validacion', 'lavadero');

  update public.remitos_envio
     set estado = 'cerrado', cerrado_por = auth.uid(), firma_cierre = p_firma
   where id = p_remito
  returning * into r;
  return r;
end $$;

create or replace function public.anular_remito(p_remito uuid, p_motivo text)
returns public.remitos_envio language plpgsql security definer set search_path = public as $$
declare r public.remitos_envio;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  update public.remitos_envio set estado = 'anulado', anulado_motivo = p_motivo
   where id = p_remito and estado in ('borrador', 'enviado')
  returning * into r;
  if r.id is null then raise exception 'Sólo se pueden anular remitos en borrador o enviados sin recepcionar'; end if;
  return r;
end $$;

-- Hotel aprueba o rechaza una observación del lavadero
create or replace function public.resolver_observacion(p_id bigint, p_aprobar boolean, p_nota text default null)
returns public.observaciones language plpgsql security definer set search_path = public as $$
declare o public.observaciones;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  update public.observaciones
     set estado = case when p_aprobar then 'aprobada'::public.estado_observacion else 'rechazada'::public.estado_observacion end,
         resolucion_nota = p_nota
   where id = p_id and estado = 'pendiente'
  returning * into o;
  if o.id is null then raise exception 'La observación no existe o ya fue resuelta'; end if;
  return o;
end $$;

-- Movimientos manuales del hotel (armado de habitaciones, compras, bajas, ajustes)
create or replace function public.transferir_stock(
  p_edificio smallint, p_articulo int,
  p_origen public.ubicacion_stock, p_destino public.ubicacion_stock,
  p_cantidad int, p_motivo text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  if p_origen = 'lavadero' or p_destino = 'lavadero' then
    raise exception 'El stock en lavadero sólo se mueve mediante remitos';
  end if;
  perform public.aplicar_movimiento(p_edificio, p_articulo,
    case when p_origen is null or p_destino is null then 'ajuste' else 'transferencia' end::public.tipo_movimiento,
    p_origen, p_destino, p_cantidad, null, null, p_motivo);
end $$;

-- Cambio de precio con motivo (queda en precios_historicos)
create or replace function public.actualizar_precio(p_articulo int, p_precio numeric, p_motivo text default null)
returns public.articulos language plpgsql security definer set search_path = public as $$
declare a public.articulos;
begin
  perform public.exigir_rol(array['hotel']::public.rol_usuario[]);
  perform set_config('app.motivo_precio', coalesce(p_motivo, ''), true);
  update public.articulos set precio_unitario_actual = p_precio where id = p_articulo returning * into a;
  return a;
end $$;

-- Funciones internas: no se exponen por la API.
revoke execute on function public.aplicar_movimiento(smallint, int, public.tipo_movimiento, public.ubicacion_stock, public.ubicacion_stock, int, uuid, bigint, text) from public;
revoke execute on function public._insertar_observaciones(uuid, public.etapa_remito, jsonb) from public;
revoke execute on function public._observaciones_por_diferencia(uuid, public.etapa_remito, public.responsable_incidencia) from public;
revoke execute on function public._bajas_remito(uuid, int) from public;
