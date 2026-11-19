-- =====================================================================
--  VIDEOS de los tours (bucket "videos" en Supabase Storage)
--  Pegá este archivo en Supabase → SQL Editor → Run. Se puede volver a ejecutar.
--  · Cualquiera puede ver los videos (los reproduce la galería).
--  · Solo vos (tabla admins) podés subir, reemplazar o borrar.
--  Límite por archivo: 50 MB (es el máximo del plan gratis de Supabase).
--  Videos más pesados: subilos a YouTube como "no listado" y pegá el link.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['video/mp4','video/quicktime','video/webm'];

drop policy if exists "videos: publico ve"  on storage.objects;
drop policy if exists "videos: admin sube"  on storage.objects;
drop policy if exists "videos: admin edita" on storage.objects;
drop policy if exists "videos: admin borra" on storage.objects;

create policy "videos: publico ve" on storage.objects
  for select using (bucket_id = 'videos');
create policy "videos: admin sube" on storage.objects
  for insert with check (bucket_id = 'videos' and public.es_admin());
create policy "videos: admin edita" on storage.objects
  for update using (bucket_id = 'videos' and public.es_admin());
create policy "videos: admin borra" on storage.objects
  for delete using (bucket_id = 'videos' and public.es_admin());
