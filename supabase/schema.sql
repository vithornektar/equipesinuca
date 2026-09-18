-- Schema para o ranking_sinuca.html
-- Cole este arquivo inteiro no SQL Editor do Supabase (dashboard do projeto) e rode.
-- Pode rodar de novo com seguranca: usa "if not exists" / "or replace" onde da.

-- ============ TABELAS ============

create table if not exists competitions (
  id text primary key,
  name text not null,
  type text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table if not exists results (
  id bigint generated always as identity primary key,
  comp text not null,
  edition text not null,
  pos int not null,
  players jsonb not null, -- [{name, apelido, curso, genero}]
  created_at timestamptz not null default now()
);

create table if not exists gallery_photos (
  id text primary key,
  comp text,
  edition text,
  caption text,
  image_path text not null, -- caminho dentro do bucket "photos"
  created_at timestamptz not null default now()
);

create table if not exists player_photos (
  slug text primary key,
  name text not null,
  image_path text not null, -- caminho dentro do bucket "photos"
  created_at timestamptz not null default now()
);

create table if not exists retired_players (
  name text primary key,
  created_at timestamptz not null default now()
);

-- ============ ROW LEVEL SECURITY ============
-- Leitura publica (qualquer visitante ve o ranking/galeria sem login).
-- Escrita (insert/update/delete) só pra quem estiver autenticado (o admin logado).

alter table competitions enable row level security;
alter table results enable row level security;
alter table gallery_photos enable row level security;
alter table player_photos enable row level security;
alter table retired_players enable row level security;

drop policy if exists "public read" on competitions;
create policy "public read" on competitions for select using (true);
drop policy if exists "admin write" on competitions;
create policy "admin write" on competitions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read" on results;
create policy "public read" on results for select using (true);
drop policy if exists "admin write" on results;
create policy "admin write" on results for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read" on gallery_photos;
create policy "public read" on gallery_photos for select using (true);
drop policy if exists "admin write" on gallery_photos;
create policy "admin write" on gallery_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read" on player_photos;
create policy "public read" on player_photos for select using (true);
drop policy if exists "admin write" on player_photos;
create policy "admin write" on player_photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read" on retired_players;
create policy "public read" on retired_players for select using (true);
drop policy if exists "admin write" on retired_players;
create policy "admin write" on retired_players for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============ STORAGE (fotos) ============
-- Bucket publico para leitura (as fotos aparecem no site pra qualquer um),
-- mas so quem estiver autenticado pode subir/apagar arquivo.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "public read photos" on storage.objects;
create policy "public read photos" on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "admin write photos" on storage.objects;
create policy "admin write photos" on storage.objects for insert
  with check (bucket_id = 'photos' and auth.role() = 'authenticated');

drop policy if exists "admin update photos" on storage.objects;
create policy "admin update photos" on storage.objects for update
  using (bucket_id = 'photos' and auth.role() = 'authenticated');

drop policy if exists "admin delete photos" on storage.objects;
create policy "admin delete photos" on storage.objects for delete
  using (bucket_id = 'photos' and auth.role() = 'authenticated');
