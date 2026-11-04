-- =============================================================================
--  Lavandería Hotel Terra Blancos · 0001 · Esquema base
--  Tablas, tipos, claves foráneas e índices.
-- =============================================================================

-- gen_random_uuid() es nativo desde PostgreSQL 13.

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.rol_usuario            as enum ('hotel', 'lavadero');
create type public.ubicacion_stock        as enum ('habitaciones', 'deposito', 'lavadero');
create type public.estado_remito          as enum ('borrador', 'enviado', 'recibido', 'despachado', 'cerrado', 'anulado');
create type public.tipo_observacion       as enum ('faltante', 'rotura', 'mancha', 'sobrante', 'otro');
create type public.responsable_incidencia as enum ('hotel', 'lavadero');
create type public.estado_observacion     as enum ('pendiente', 'aprobada', 'rechazada');
create type public.etapa_remito           as enum ('recepcion', 'despacho', 'validacion');
create type public.metodo_pago            as enum ('efectivo', 'transferencia', 'cheque', 'mercado_pago', 'otro');
create type public.tipo_movimiento        as enum ('envio_lavadero', 'retorno_lavadero', 'baja', 'transferencia', 'ajuste', 'anulacion');

-- Fecha "de negocio" del hotel (no la del servidor, que corre en UTC).
create or replace function public.hoy()
returns date language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- -----------------------------------------------------------------------------
-- Edificios
-- -----------------------------------------------------------------------------
create table public.edificios (
  id          smallint generated always as identity primary key,
  codigo      text not null unique check (codigo ~ '^[A-Z0-9]{1,3}$'),
  nombre      text not null,
  direccion   text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users). El rol lo asigna un administrador.
-- -----------------------------------------------------------------------------
create table public.perfiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nombre             text not null,
  rol                public.rol_usuario,          -- null = sin acceso
  telefono_whatsapp  text,                         -- formato internacional, ej. 5491122334455
  activo             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Artículos y precios
-- -----------------------------------------------------------------------------
create table public.articulos (
  id                      int generated always as identity primary key,
  codigo                  text not null unique,
  nombre                  text not null,
  categoria               text not null default 'cama' check (categoria in ('cama', 'baño', 'otros')),
  precio_unitario_actual  numeric(12, 2) not null default 0 check (precio_unitario_actual >= 0),
  costo_reposicion        numeric(12, 2) not null default 0 check (costo_reposicion >= 0),
  orden                   smallint not null default 0,
  activo                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.articulos.precio_unitario_actual is 'Precio de lavado por unidad vigente. Cada remito guarda su propia copia histórica.';
comment on column public.articulos.costo_reposicion       is 'Valor de la prenda; se usa para calcular el cargo al lavadero por rotura o faltante.';

create table public.precios_historicos (
  id               bigint generated always as identity primary key,
  articulo_id      int not null references public.articulos (id) on delete cascade,
  precio_anterior  numeric(12, 2),
  precio_nuevo     numeric(12, 2) not null,
  variacion_pct    numeric(7, 2) generated always as (
                     case when coalesce(precio_anterior, 0) = 0 then null
                          else round((precio_nuevo - precio_anterior) / precio_anterior * 100, 2) end
                   ) stored,
  vigente_desde    timestamptz not null default now(),
  modificado_por   uuid references public.perfiles (id) on delete set null,
  motivo           text
);
create index on public.precios_historicos (articulo_id, vigente_desde desc);

-- -----------------------------------------------------------------------------
-- Stock por edificio × artículo × ubicación
-- -----------------------------------------------------------------------------
create table public.stock_edificio (
  edificio_id   smallint not null references public.edificios (id) on delete cascade,
  articulo_id   int      not null references public.articulos (id) on delete cascade,
  ubicacion     public.ubicacion_stock not null,
  cantidad      int not null default 0 constraint stock_no_negativo check (cantidad >= 0),
  stock_minimo  int not null default 0 check (stock_minimo >= 0),
  updated_at    timestamptz not null default now(),
  primary key (edificio_id, articulo_id, ubicacion)
);
comment on column public.stock_edificio.stock_minimo is 'Stock de seguridad. Sólo se evalúa en la ubicación deposito.';

-- -----------------------------------------------------------------------------
-- Remitos de envío (un "lote" que viaja hotel -> lavadero -> hotel)
-- -----------------------------------------------------------------------------
create table public.remitos_envio (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,
  codigo            text unique,                                  -- ej. A-20261104-1 (lo genera un trigger)
  edificio_id       smallint not null references public.edificios (id),
  fecha             date not null default public.hoy(),
  nro_envio_dia     smallint not null check (nro_envio_dia between 1 and 2),
  ubicacion_origen  public.ubicacion_stock not null default 'deposito' check (ubicacion_origen <> 'lavadero'),
  estado            public.estado_remito not null default 'borrador',
  conforme          boolean,                                      -- resultado del conteo del lavadero
  tiene_observaciones boolean not null default false,
  notas             text,

  creado_por        uuid references public.perfiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  enviado_at        timestamptz,

  recibido_por      uuid references public.perfiles (id) on delete set null,
  recibido_at       timestamptz,
  firma_recepcion   text,                                         -- data URL PNG de la firma táctil

  despachado_por    uuid references public.perfiles (id) on delete set null,
  despachado_at     timestamptz,
  firma_despacho    text,

  cerrado_por       uuid references public.perfiles (id) on delete set null,
  cerrado_at        timestamptz,
  firma_cierre      text,

  anulado_motivo    text,
  updated_at        timestamptz not null default now()
);
-- Máximo 2 envíos por edificio y día (los anulados liberan su número).
create unique index max_dos_envios_por_dia on public.remitos_envio (edificio_id, fecha, nro_envio_dia)
  where estado <> 'anulado';
create index on public.remitos_envio (estado);
create index on public.remitos_envio (fecha desc);

create table public.detalle_remito (
  id                         bigint generated always as identity primary key,
  remito_id                  uuid not null references public.remitos_envio (id) on delete cascade,
  articulo_id                int  not null references public.articulos (id),
  cantidad_enviada           int  not null check (cantidad_enviada > 0),
  cantidad_recibida          int  check (cantidad_recibida >= 0),   -- conteo del lavadero
  cantidad_devuelta          int  check (cantidad_devuelta >= 0),   -- despacho limpio del lavadero
  cantidad_validada          int  check (cantidad_validada >= 0),   -- ingreso real al depósito
  precio_unitario_historico  numeric(12, 2) not null default 0,
  -- Se factura lo que el lavadero recibió y aceptó lavar.
  subtotal                   numeric(14, 2) generated always as (coalesce(cantidad_recibida, 0) * precio_unitario_historico) stored,
  unique (remito_id, articulo_id)
);
create index on public.detalle_remito (articulo_id);

-- -----------------------------------------------------------------------------
-- Observaciones: faltantes, roturas, manchas, etc.
-- -----------------------------------------------------------------------------
create table public.observaciones (
  id               bigint generated always as identity primary key,
  remito_id        uuid not null references public.remitos_envio (id) on delete cascade,
  articulo_id      int references public.articulos (id),
  etapa            public.etapa_remito not null,
  tipo             public.tipo_observacion not null,
  responsable      public.responsable_incidencia not null,
  cantidad         int not null default 1 check (cantidad > 0),
  descripcion      text,
  foto_url         text,
  estado           public.estado_observacion not null default 'pendiente',
  automatica       boolean not null default false,                 -- generada por diferencia de conteo
  cargo_unitario   numeric(12, 2) not null default 0,               -- copia de costo_reposicion
  importe_cargo    numeric(14, 2) generated always as (
                     case when responsable = 'lavadero'::public.responsable_incidencia
                               and tipo in ('rotura'::public.tipo_observacion, 'faltante'::public.tipo_observacion)
                          then cantidad * cargo_unitario else 0 end
                   ) stored,
  reportado_por    uuid references public.perfiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  resuelta_por     uuid references public.perfiles (id) on delete set null,
  resuelta_at      timestamptz,
  resolucion_nota  text
);
create index on public.observaciones (remito_id);
create index on public.observaciones (estado);

-- -----------------------------------------------------------------------------
-- Movimientos de stock (auditoría inmutable de cada cambio de stock)
-- -----------------------------------------------------------------------------
create table public.movimientos_stock (
  id              bigint generated always as identity primary key,
  edificio_id     smallint not null references public.edificios (id),
  articulo_id     int not null references public.articulos (id),
  tipo            public.tipo_movimiento not null,
  origen          public.ubicacion_stock,     -- null = alta (compra / ajuste positivo)
  destino         public.ubicacion_stock,     -- null = baja (rotura / faltante / ajuste negativo)
  cantidad        int not null check (cantidad > 0),
  remito_id       uuid references public.remitos_envio (id) on delete set null,
  observacion_id  bigint references public.observaciones (id) on delete set null,
  motivo          text,
  created_by      uuid references public.perfiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (origen is not null or destino is not null),
  check (origen is distinct from destino)
);
create index on public.movimientos_stock (edificio_id, created_at desc);
create index on public.movimientos_stock (remito_id);

-- -----------------------------------------------------------------------------
-- Pagos al lavadero
-- -----------------------------------------------------------------------------
create table public.pagos_lavadero (
  id               bigint generated always as identity primary key,
  fecha            date not null default public.hoy(),
  monto            numeric(14, 2) not null check (monto > 0),
  metodo           public.metodo_pago not null,
  comprobante_nro  text,
  comprobante_url  text,                       -- ruta en el bucket "comprobantes"
  periodo          date check (periodo is null or extract(day from periodo) = 1),  -- mes que se cancela (opcional)
  notas            text,
  registrado_por   uuid references public.perfiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index on public.pagos_lavadero (fecha desc);

-- -----------------------------------------------------------------------------
-- Notificaciones dentro de la app (se escuchan por Realtime)
-- -----------------------------------------------------------------------------
create table public.notificaciones (
  id           bigint generated always as identity primary key,
  rol_destino  public.rol_usuario not null,
  tipo         text not null,
  titulo       text not null,
  mensaje      text,
  remito_id    uuid references public.remitos_envio (id) on delete cascade,
  leida        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on public.notificaciones (rol_destino, leida, created_at desc);
