// Prueba de 0008: corrección de los 2 envíos cargados y carga de envíos atrasados.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const M = new URL('../supabase/', import.meta.url).pathname;
const db = new PGlite();
const q = async (sql, label) => { try { const r = await db.query(sql); if (label) console.log(label, JSON.stringify(r.rows)); return r.rows; } catch (e) { console.log('ERR', label ?? sql.slice(0,60), '→', e.message); return null; } };
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
grant usage on schema public to anon, authenticated;`);
for (const f of ['0001_esquema.sql','0002_logica_negocio.sql','0003_rls.sql','0004_vistas.sql','0006_admin_usuarios.sql','0007_pendientes_entrega.sql'])
  await db.exec(fs.readFileSync(M+'migrations/'+f,'utf8'));
await db.exec(fs.readFileSync(M+'seed.sql','utf8'));
const H='11111111-1111-1111-1111-111111111111', L='22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email,raw_app_meta_data) values ('${H}','h@x.com','{"rol":"hotel"}'),('${L}','l@x.com','{"rol":"lavadero"}');`);
const as = async (uid) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`); };
const stock = (l) => q(`select edificio_id e, ubicacion u, cantidad c from stock_edificio where articulo_id=2 and ubicacion<>'habitaciones' order by 1,2`, l);
await stock('stock inicial');
// Situación actual: 2 envíos de hoy (A cerrado con 1 retenida, B despachado)
const ciclo = async (edif, retener, cerrar) => {
  await as(H); const id = (await q(`insert into remitos_envio(edificio_id) values (${edif}) returning id`))[0].id;
  await q(`insert into detalle_remito(remito_id, articulo_id, cantidad_enviada) values ('${id}',2,10)`);
  await q(`select enviar_remito('${id}')`);
  await as(L); await q(`select recepcionar_remito('${id}','[]','f')`);
  await q(`select despachar_remito('${id}','[{"articulo_id":2,"cantidad":${10-retener}}]','f','[{"articulo_id":2,"tipo":"mancha","responsable":"lavadero","cantidad":${retener||1}}]')`);
  if (cerrar) { await as(H); await q(`select cerrar_remito('${id}','[]','f')`); }
  return id;
};
await ciclo(1, 1, true);
await ciclo(2, 0, false);
await as(H);
await q(`select codigo, fecha, estado from remitos_envio order by created_at`, 'antes');
await stock('stock antes de 0008');
await db.exec('reset role');
try { await db.exec(fs.readFileSync(M+'migrations/0008_envios_atrasados.sql','utf8')); console.log('OK 0008'); } catch (e) { console.log('FAIL 0008', e.message); process.exit(1); }
await q(`select codigo, fecha, nro_envio_dia, estado, mueve_stock from remitos_envio order by fecha`, 'después');
await stock('stock después (= inicial)');
await q(`select count(*) from movimientos_stock where remito_id is not null`, 'movimientos de remitos (0)');
await q(`select titulo from notificaciones order by id`, 'notif');
await q(`select remito_origen_codigo, cantidad, estado from v_pendientes_entrega`, 'pendiente sigue');
// Carga atrasada: 01/11, más de lo que hay en depósito
await as(H);
const v = (await q(`insert into remitos_envio(edificio_id, fecha) values (1, '2026-11-01') returning id, codigo, mueve_stock`, 'atrasado 01/11'))[0].id;
await q(`insert into detalle_remito(remito_id, articulo_id, cantidad_enviada) values ('${v}',2,9999)`);
await q(`select estado from enviar_remito('${v}')`, 'enviar sin stock suficiente (ok, no mueve)');
await q(`insert into remitos_envio(edificio_id, fecha) values (1, '2026-12-01')`, 'fecha futura (falla)');
await as(L); await q(`select recepcionar_remito('${v}','[]','f','[{"articulo_id":2,"tipo":"rotura","responsable":"lavadero","cantidad":1}]')`);
await q(`select estado from despachar_remito('${v}','[]','f')`, 'despacho atrasado');
await as(H);
for (const o of await q(`select id from observaciones where estado='pendiente'`)) await q(`select estado from resolver_observacion(${o.id}, true)`, 'aprobar rotura atrasada');
await q(`select estado from cerrar_remito('${v}','[]','f')`, 'cierre atrasado');
await stock('stock sin cambios');
// Remito actual (hoy) entrega la pendiente histórica: entra directo al depósito
const hoyid = (await q(`insert into remitos_envio(edificio_id) values (1) returning id`))[0].id;
await q(`insert into detalle_remito(remito_id, articulo_id, cantidad_enviada) values ('${hoyid}',2,5)`);
await q(`select enviar_remito('${hoyid}')`);
await as(L); await q(`select recepcionar_remito('${hoyid}','[]','f')`);
const pid = (await q(`select id from pendientes_entrega where estado='pendiente' and edificio_id=1`))[0].id;
await q(`select estado from despachar_remito('${hoyid}','[]','f','[]','[{"id":${pid}}]')`, 'despacho hoy + pendiente histórica');
await as(H); await q(`select estado from cerrar_remito('${hoyid}','[]','f')`, 'cierre hoy');
await stock('stock: depósito T1 +1 (la pendiente)');
await q(`select codigo, importe from v_remitos order by fecha, codigo`, 'importes');
