-- =============================================================================
--  Datos iniciales: 2 edificios, artículos con precios y stock de arranque.
--  Ajustar precios, cantidades y mínimos a la realidad del hotel.
-- =============================================================================

insert into public.edificios (codigo, nombre, direccion) values
  ('A', 'Edificio A', null),
  ('B', 'Edificio B', null);

insert into public.articulos (codigo, nombre, categoria, precio_unitario_actual, costo_reposicion, orden) values
  ('SAB-1P',  'Sábana 1 plaza',        'cama',  450,  9000, 10),
  ('SAB-2P',  'Sábana 2 plazas',       'cama',  550, 12000, 20),
  ('FUN-ALM', 'Funda de almohada',     'cama',  200,  3500, 30),
  ('CUB-1P',  'Cubrecama 1 plaza',     'cama', 1200, 25000, 40),
  ('CUB-2P',  'Cubrecama 2 plazas',    'cama', 1500, 32000, 50),
  ('TOA-MAN', 'Toalla de mano',        'baño',  250,  4000, 60),
  ('TOA-CUE', 'Toallón de cuerpo',     'baño',  450,  8500, 70),
  ('ALF-BAN', 'Alfombrín de baño',     'baño',  300,  5000, 80);

-- Stock inicial (las filas ya las creó el trigger; acá se cargan cantidades y mínimos)
update public.stock_edificio s set
  cantidad = case s.ubicacion
               when 'deposito'     then 120
               when 'habitaciones' then 80
               else 0 end,
  stock_minimo = case when s.ubicacion = 'deposito' then 40 else 0 end;

-- -----------------------------------------------------------------------------
-- Usuarios: crearlos en Supabase > Authentication > Users y luego asignar rol:
--
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"hotel"}'
--    where email in ('recepcion@hotel.com', 'gerencia@hotel.com');
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"lavadero"}'
--    where email = 'lavadero@proveedor.com';
--   update public.perfiles p set rol = (u.raw_app_meta_data->>'rol')::public.rol_usuario
--     from auth.users u where u.id = p.id;
--   update public.perfiles set telefono_whatsapp = '5491100000000' where ...;
-- -----------------------------------------------------------------------------
