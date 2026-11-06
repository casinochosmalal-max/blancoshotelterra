-- =============================================================================
--  Lavandería Hotel Terra Blancos · 0004 · Vistas para paneles y finanzas
--  Todas con security_invoker: respetan el RLS del usuario que consulta.
-- =============================================================================

-- Stock pivotado: una fila por edificio × artículo
create or replace view public.v_stock_resumen with (security_invoker = true) as
select e.id   as edificio_id,
       e.codigo as edificio_codigo,
       e.nombre as edificio_nombre,
       a.id   as articulo_id,
       a.codigo as articulo_codigo,
       a.nombre as articulo_nombre,
       a.categoria,
       a.orden,
       coalesce(max(s.cantidad) filter (where s.ubicacion = 'habitaciones'), 0) as habitaciones,
       coalesce(max(s.cantidad) filter (where s.ubicacion = 'deposito'), 0)     as deposito,
       coalesce(max(s.cantidad) filter (where s.ubicacion = 'lavadero'), 0)     as lavadero,
       coalesce(sum(s.cantidad), 0)::int                                         as total,
       coalesce(max(s.stock_minimo) filter (where s.ubicacion = 'deposito'), 0) as stock_minimo,
       coalesce(max(s.cantidad) filter (where s.ubicacion = 'deposito'), 0)
         < coalesce(max(s.stock_minimo) filter (where s.ubicacion = 'deposito'), 0) as bajo_minimo
  from public.stock_edificio s
  join public.edificios e on e.id = s.edificio_id
  join public.articulos a on a.id = s.articulo_id
 where e.activo and a.activo
 group by e.id, a.id;

-- Alertas de stock de seguridad (depósito central por debajo del mínimo)
create or replace view public.v_alertas_stock with (security_invoker = true) as
select edificio_id, edificio_codigo, edificio_nombre, articulo_id, articulo_nombre,
       deposito, stock_minimo, stock_minimo - deposito as faltan,
       case when deposito = 0 or deposito <= stock_minimo / 2 then 'critica' else 'advertencia' end as nivel
  from public.v_stock_resumen
 where bajo_minimo;

-- Remitos con totales
create or replace view public.v_remitos with (security_invoker = true) as
select r.*,
       e.codigo as edificio_codigo,
       e.nombre as edificio_nombre,
       coalesce(sum(d.cantidad_enviada), 0)::int  as prendas_enviadas,
       sum(d.cantidad_recibida)::int              as prendas_recibidas,
       sum(d.cantidad_devuelta)::int              as prendas_devueltas,
       sum(d.cantidad_validada)::int              as prendas_validadas,
       coalesce(sum(d.subtotal), 0)               as importe,
       (select count(*) from public.observaciones o
         where o.remito_id = r.id and o.estado = 'pendiente')::int as observaciones_pendientes
  from public.remitos_envio r
  join public.edificios e on e.id = r.edificio_id
  left join public.detalle_remito d on d.remito_id = r.id
 group by r.id, e.id;

-- -----------------------------------------------------------------------------
-- Finanzas (sólo hotel: el filtro es_hotel() evita filtrar importes al lavadero)
-- -----------------------------------------------------------------------------

-- Liquidación mensual por edificio: remitos cerrados del mes - cargos del lavadero
create or replace view public.v_liquidacion_mensual with (security_invoker = true) as
with lavado as (
  select date_trunc('month', r.fecha)::date as periodo, r.edificio_id,
         count(distinct r.id)::int as remitos,
         coalesce(sum(d.cantidad_recibida), 0)::int as prendas,
         coalesce(sum(d.subtotal), 0) as importe_lavado
    from public.remitos_envio r
    join public.detalle_remito d on d.remito_id = r.id
   where r.estado = 'cerrado'
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

-- Conciliación por mes (ambos edificios): neto a pagar vs. pagos imputados
create or replace view public.v_conciliacion_mensual with (security_invoker = true) as
with liq as (
  select periodo, sum(importe_lavado) as importe_lavado, sum(cargos_lavadero) as cargos_lavadero,
         sum(neto) as neto, sum(remitos)::int as remitos, sum(prendas)::int as prendas
    from public.v_liquidacion_mensual group by periodo
), pag as (
  select coalesce(periodo, date_trunc('month', fecha)::date) as periodo, sum(monto) as pagado
    from public.pagos_lavadero group by 1
)
select coalesce(l.periodo, p.periodo)  as periodo,
       coalesce(l.remitos, 0)          as remitos,
       coalesce(l.prendas, 0)          as prendas,
       coalesce(l.importe_lavado, 0)   as importe_lavado,
       coalesce(l.cargos_lavadero, 0)  as cargos_lavadero,
       coalesce(l.neto, 0)             as neto,
       coalesce(p.pagado, 0)           as pagado,
       coalesce(l.neto, 0) - coalesce(p.pagado, 0) as saldo,
       case when coalesce(l.neto, 0) - coalesce(p.pagado, 0) <= 0 then 'pagado'
            when coalesce(p.pagado, 0) > 0 then 'parcial'
            else 'pendiente' end as estado
  from liq l
  full join pag p on p.periodo = l.periodo
 where public.es_hotel();

-- Cuenta corriente con saldo acumulado (debe = liquidaciones, haber = pagos)
create or replace view public.v_cuenta_corriente with (security_invoker = true) as
with mov as (
  select (periodo + interval '1 month' - interval '1 day')::date as fecha,
         'Liquidación ' || to_char(periodo, 'MM/YYYY') as concepto,
         neto as debe, 0::numeric as haber, 1 as orden
    from public.v_conciliacion_mensual where neto <> 0
  union all
  select fecha,
         'Pago ' || metodo::text || coalesce(' #' || comprobante_nro, ''),
         0, monto, 2
    from public.pagos_lavadero
)
select fecha, concepto, debe, haber,
       sum(debe - haber) over (order by fecha, orden, concepto rows unbounded preceding) as saldo
  from mov
 where public.es_hotel();

-- Gasto por mes, edificio y artículo (para gráficos)
create or replace view public.v_gasto_articulo_mensual with (security_invoker = true) as
select date_trunc('month', r.fecha)::date as periodo, r.edificio_id, e.codigo as edificio_codigo,
       a.id as articulo_id, a.nombre as articulo_nombre,
       sum(d.cantidad_recibida)::int as prendas, sum(d.subtotal) as importe
  from public.detalle_remito d
  join public.remitos_envio r on r.id = d.remito_id and r.estado = 'cerrado'
  join public.edificios e on e.id = r.edificio_id
  join public.articulos a on a.id = d.articulo_id
 where public.es_hotel()
 group by 1, 2, 3, 4, 5;

revoke all on public.v_stock_resumen, public.v_alertas_stock, public.v_remitos,
              public.v_liquidacion_mensual, public.v_conciliacion_mensual,
              public.v_cuenta_corriente, public.v_gasto_articulo_mensual from anon;
