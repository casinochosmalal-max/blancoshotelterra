-- =============================================================================
--  Lavandería Hotel Terra Blancos · 0005 · Storage
--  comprobantes : PDFs/fotos de comprobantes de pago (sólo hotel)
--  incidencias  : fotos de roturas/manchas (lavadero sube, ambos ven)
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false),
       ('incidencias',  'incidencias',  false)
on conflict (id) do nothing;

create policy "comprobantes hotel" on storage.objects for all to authenticated
  using (bucket_id = 'comprobantes' and public.es_hotel())
  with check (bucket_id = 'comprobantes' and public.es_hotel());

create policy "incidencias lectura" on storage.objects for select to authenticated
  using (bucket_id = 'incidencias' and public.rol_actual() is not null);

create policy "incidencias alta" on storage.objects for insert to authenticated
  with check (bucket_id = 'incidencias' and public.rol_actual() is not null);
