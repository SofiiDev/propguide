-- =====================================================================
--  SUSCRIPTORES (pop-up "Recibí novedades")
--  Si ya ejecutaste schema.sql, pegá SOLO este archivo en
--  Supabase → SQL Editor → New query → Run. Se puede volver a ejecutar.
--  · Cualquiera puede dejar su email (solo agregar, no ver ni borrar).
--  · Solo vos (tabla admins) podés ver la lista, descargarla y borrar.
-- =====================================================================

create table if not exists public.suscriptores (
  id          bigint generated always as identity primary key,
  email       text not null,
  interes     text,
  zona        text,
  origen      text,
  created_at  timestamptz not null default now(),
  constraint suscriptores_email_valido check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  constraint suscriptores_campos_cortos check (
    coalesce(length(interes), 0) <= 60 and coalesce(length(zona), 0) <= 80 and coalesce(length(origen), 0) <= 80
  )
);

-- Un mismo email no se guarda dos veces (sin importar mayúsculas)
create unique index if not exists suscriptores_email_unico on public.suscriptores (lower(email));

alter table public.suscriptores enable row level security;

drop policy if exists "suscriptores: cualquiera se suscribe" on public.suscriptores;
drop policy if exists "suscriptores: admin ve"               on public.suscriptores;
drop policy if exists "suscriptores: admin borra"            on public.suscriptores;

create policy "suscriptores: cualquiera se suscribe" on public.suscriptores
  for insert to anon, authenticated with check (true);
create policy "suscriptores: admin ve" on public.suscriptores
  for select using (public.es_admin());
create policy "suscriptores: admin borra" on public.suscriptores
  for delete using (public.es_admin());
