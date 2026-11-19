-- =====================================================================
--  GALERÍA DE PROPIEDADES — esquema de Supabase
--  Pegá todo este archivo en Supabase → SQL Editor → New query → Run.
--  Se puede volver a ejecutar sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Administradores: solo los emails de esta tabla pueden editar.
--    ⚠️ Cambiá el email de abajo por el tuyo antes de ejecutar.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);

insert into public.admins (email) values ('TU_EMAIL@ejemplo.com')
on conflict do nothing;

-- ¿El usuario que hace la consulta es administrador?
create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Propiedades
--    Cada propiedad se guarda completa en "data" (jsonb), así podés
--    sumar campos desde el panel sin tocar la base.
-- ---------------------------------------------------------------------
create table if not exists public.propiedades (
  codigo      text primary key,
  publicada   boolean not null default true,
  orden       integer not null default 0,
  data        jsonb   not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists propiedades_publicada_idx on public.propiedades (publicada);

-- ---------------------------------------------------------------------
-- 3) Configuración: tu perfil y los textos de la galería (una sola fila)
-- ---------------------------------------------------------------------
create table if not exists public.config (
  id          integer primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into public.config (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4) Permisos (Row Level Security)
--    · Cualquiera puede VER las propiedades publicadas y la configuración.
--    · Solo un administrador puede ver las ocultas, crear, editar y borrar.
-- ---------------------------------------------------------------------
alter table public.admins      enable row level security;
alter table public.propiedades enable row level security;
alter table public.config      enable row level security;

drop policy if exists "admins: solo admin lee"        on public.admins;
drop policy if exists "propiedades: publico ve publicadas" on public.propiedades;
drop policy if exists "propiedades: admin ve todo"    on public.propiedades;
drop policy if exists "propiedades: admin crea"       on public.propiedades;
drop policy if exists "propiedades: admin edita"      on public.propiedades;
drop policy if exists "propiedades: admin borra"      on public.propiedades;
drop policy if exists "config: publico lee"           on public.config;
drop policy if exists "config: admin crea"            on public.config;
drop policy if exists "config: admin edita"           on public.config;

create policy "admins: solo admin lee" on public.admins
  for select using (public.es_admin());

create policy "propiedades: publico ve publicadas" on public.propiedades
  for select using (publicada = true);
create policy "propiedades: admin ve todo" on public.propiedades
  for select using (public.es_admin());
create policy "propiedades: admin crea" on public.propiedades
  for insert with check (public.es_admin());
create policy "propiedades: admin edita" on public.propiedades
  for update using (public.es_admin()) with check (public.es_admin());
create policy "propiedades: admin borra" on public.propiedades
  for delete using (public.es_admin());

create policy "config: publico lee" on public.config
  for select using (true);
create policy "config: admin crea" on public.config
  for insert with check (public.es_admin());
create policy "config: admin edita" on public.config
  for update using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- 5) Fotos: bucket público "fotos" en Supabase Storage
--    · Cualquiera puede ver las fotos (las muestra la galería).
--    · Solo un administrador puede subir, reemplazar o borrar.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "fotos: publico ve"   on storage.objects;
drop policy if exists "fotos: admin sube"   on storage.objects;
drop policy if exists "fotos: admin edita"  on storage.objects;
drop policy if exists "fotos: admin borra"  on storage.objects;

create policy "fotos: publico ve" on storage.objects
  for select using (bucket_id = 'fotos');
create policy "fotos: admin sube" on storage.objects
  for insert with check (bucket_id = 'fotos' and public.es_admin());
create policy "fotos: admin edita" on storage.objects
  for update using (bucket_id = 'fotos' and public.es_admin());
create policy "fotos: admin borra" on storage.objects
  for delete using (bucket_id = 'fotos' and public.es_admin());
