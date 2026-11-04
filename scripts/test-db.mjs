import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const M = new URL('../supabase/', import.meta.url).pathname;
const db = new PGlite();
const q = async (sql, label) => { try { const r = await db.query(sql); if (label) console.log(label, JSON.stringify(r.rows)); return r.rows; } catch (e) { console.log('ERR', label ?? sql.slice(0,60), '→', e.message); return null; } };
await db.exec(`
create role anon; create role authenticated; 
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
grant usage on schema public to anon, authenticated;
`);
for (const f of ['0001_esquema.sql','0002_logica_negocio.sql','0003_rls.sql','0004_vistas.sql']) {
  try { await db.exec(fs.readFileSync(M+'migrations/'+f,'utf8')); console.log('OK', f); } catch(e) { console.log('FAIL', f, e.message); process.exit(1); }
}
await db.exec(fs.readFileSync(M+'seed.sql','utf8')); console.log('OK seed');
const H='11111111-1111-1111-1111-111111111111', L='22222222-2222-2222-2222-222222222222', X='33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users(id,email,raw_app_meta_data) values ('${H}','h@x.com','{"rol":"hotel"}'),('${L}','l@x.com','{"rol":"lavadero"}'),('${X}','x@x.com','{}');`);
await q(`select nombre, rol from perfiles order by nombre`, 'perfiles');
const as = async (uid) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`); };
await as(H);
let r = await q(`insert into remitos_envio(edificio_id) values (1) returning id, codigo, nro_envio_dia`, 'remito1');
const id = r[0].id;
await q(`insert into detalle_remito(remito_id, articulo_id, cantidad_enviada) values ('${id}',1,50),('${id}',2,30),('${id}',7,20)`, 'detalle');
await q(`select articulo_id, precio_unitario_historico from detalle_remito`, 'precios');
await as(L); await q(`select count(*) from remitos_envio`, 'lavadero ve borradores (0)');
await as(H); await q(`select estado, enviado_at is not null from enviar_remito('${id}')`, 'enviar');
await q(`select articulo_id, ubicacion, cantidad from stock_edificio where edificio_id=1 and articulo_id in (1,2,7) and ubicacion<>'habitaciones' order by 1,2`, 'stock tras envío');
await as(L); await q(`select count(*) from remitos_envio`, 'lavadero ve enviados (1)');
await q(`select count(*) from stock_edificio`, 'lavadero stock (0)');
await q(`select count(*) from v_liquidacion_mensual`, 'lavadero liquidacion (0)');
await q(`select * from enviar_remito('${id}')`, 'lavadero no puede enviar');
await q(`update remitos_envio set estado='cerrado' where id='${id}'`, 'lavadero update directo');
await q(`select estado, conforme from recepcionar_remito('${id}', '[{"articulo_id":1,"cantidad":48}]', 'data:firma', '[{"articulo_id":7,"tipo":"rotura","responsable":"hotel","cantidad":1,"descripcion":"rota de origen"}]')`, 'recepcion');
await q(`select articulo_id, tipo, responsable, cantidad, estado, automatica, importe_cargo from observaciones order by id`, 'obs');
await q(`select estado from despachar_remito('${id}', '[{"articulo_id":2,"cantidad":29}]', 'data:f2', '[{"articulo_id":2,"tipo":"rotura","responsable":"lavadero","cantidad":1}]')`, 'despacho');
await as(H);
await q(`select id, estado from observaciones where estado='pendiente'`, 'pendientes');
const pend = await q(`select id from observaciones where estado='pendiente' order by id`);
for (const p of pend) await q(`select estado from resolver_observacion(${p.id}, true, 'ok')`, 'aprobar '+p.id);
await q(`select estado from cerrar_remito('${id}', '[{"articulo_id":1,"cantidad":47}]', 'data:f3')`, 'cierre');
await q(`select articulo_id, ubicacion, cantidad from stock_edificio where edificio_id=1 and articulo_id in (1,2,7) and ubicacion<>'habitaciones' order by 1,2`, 'stock final');
await q(`select articulo_id, cantidad_enviada, cantidad_recibida, cantidad_devuelta, cantidad_validada, subtotal from detalle_remito order by 1`, 'detalle final');
await q(`select articulo_id, tipo, responsable, cantidad, estado, importe_cargo from observaciones order by id`, 'obs final');
for (const p of await q(`select id from observaciones where estado='pendiente'`)) await q(`select estado from resolver_observacion(${p.id}, true)`, 'aprobar faltante');
await q(`select articulo_id, ubicacion, cantidad from stock_edificio where edificio_id=1 and articulo_id in (1) and ubicacion='lavadero'`, 'lavadero art1 tras faltante');
await q(`insert into pagos_lavadero(monto, metodo) values (20000,'transferencia')`, 'pago');
await q(`select * from v_liquidacion_mensual`, 'liq');
await q(`select * from v_conciliacion_mensual`, 'conc');
await q(`select * from v_cuenta_corriente`, 'cc');
await q(`select id, codigo, prendas_enviadas, importe, observaciones_pendientes from v_remitos`, 'v_remitos');
// límite 2 por día
await q(`insert into remitos_envio(edificio_id) values (1) returning codigo`, 'remito2');
await q(`insert into remitos_envio(edificio_id) values (1) returning codigo`, 'remito3 (debe fallar)');
// stock insuficiente
const r2 = await q(`select id from remitos_envio where nro_envio_dia=2`);
await q(`insert into detalle_remito(remito_id, articulo_id, cantidad_enviada) values ('${r2[0].id}',3,999)`);
await q(`select * from enviar_remito('${r2[0].id}')`, 'stock insuficiente');
await q(`select * from anular_remito('${r2[0].id}','test')`, 'anular');
await q(`insert into remitos_envio(edificio_id) values (1) returning codigo`, 'remito tras anulación (falla: nro 2 ocupado? )');
// transferencias y precios
await q(`select transferir_stock(1::smallint, 3, 'deposito', 'habitaciones', 10, 'armado')`, 'transferir');
await q(`select precio_unitario_actual from actualizar_precio(1, 500, 'aumento nov')`, 'precio');
await q(`select articulo_id, precio_anterior, precio_nuevo, variacion_pct, motivo from precios_historicos where articulo_id=1`, 'hist');
await q(`update stock_edificio set cantidad = 9999 where edificio_id=1`, 'update cantidad directo (debe fallar)');
await q(`update stock_edificio set stock_minimo = 200 where edificio_id=1 and articulo_id=1 and ubicacion='deposito'`, 'min');
await q(`select * from v_alertas_stock`, 'alertas');
await as(X); await q(`select count(*) from remitos_envio`, 'sin rol (0)'); await q(`select count(*) from articulos`, 'sin rol art (0)');
await as(L); await q(`select count(*), rol_destino from notificaciones group by 2`, 'notif lavadero');
await as(H); await q(`select tipo, titulo from notificaciones`, 'notif hotel');
await as(L); await q(`update perfiles set rol='hotel' where id='${L}'`, 'escalada (debe fallar)');
