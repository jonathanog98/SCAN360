
-- Supabase SQL schema for Courtesy Vehicle Digital Inspections
-- Replace schemas/roles as needed. Run in the SQL editor.

-- 0) Enable required extensions
create extension if not exists "uuid-ossp";

-- 1) Master table: an "inspection_case" per tablilla (plate) per cycle
create table if not exists public.inspection_case (
  id uuid primary key default uuid_generate_v4(),
  plate text not null,
  status text not null default 'open' check (status in ('open','closed')),
  salida_at timestamptz,
  entrada_at timestamptz,
  salida_by text,
  entrada_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_case_plate_idx on public.inspection_case(plate);
create index if not exists inspection_case_status_idx on public.inspection_case(status);

-- 2) Points table: one row per checklist item for the case
--  salida_value / entrada_value: 'Sí' | 'No' | 'No Aplica'
create table if not exists public.inspection_points (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references public.inspection_case(id) on delete cascade,
  point_key text not null,     -- machine key (e.g., 'luces_delanteras')
  point_label text not null,   -- human label (e.g., 'Luces delanteras')
  salida_value text check (salida_value in ('Sí','No','No Aplica')),
  entrada_value text check (entrada_value in ('Sí','No','No Aplica')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id, point_key)
);

create index if not exists inspection_points_case_idx on public.inspection_points(case_id);

-- 3) Photos table (stored in Supabase Storage; keep URL + meta here)
create table if not exists public.inspection_photos (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references public.inspection_case(id) on delete cascade,
  phase text not null check (phase in ('salida','entrada')), -- which side the photo belongs to
  url text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists inspection_photos_case_idx on public.inspection_photos(case_id);

-- 4) Quick view for reporting (optional)
create or replace view public.v_inspections_summary as
select
  c.id as case_id,
  c.plate,
  c.status,
  c.salida_at,
  c.entrada_at,
  (select count(*) from inspection_points p where p.case_id=c.id) as total_points,
  (select count(*) from inspection_photos f where f.case_id=c.id and f.phase='salida') as fotos_salida,
  (select count(*) from inspection_photos f where f.case_id=c.id and f.phase='entrada') as fotos_entrada
from inspection_case c;

-- 5) RLS (simple defaults; adjust to your needs)
alter table public.inspection_case enable row level security;
alter table public.inspection_points enable row level security;
alter table public.inspection_photos enable row level security;

-- Policy: any authenticated user can read everything
create policy if not exists "read_all_cases" on public.inspection_case
for select using (auth.role() = 'authenticated');

create policy if not exists "write_all_cases" on public.inspection_case
for insert with check (auth.role() = 'authenticated');

create policy if not exists "update_all_cases" on public.inspection_case
for update using (auth.role() = 'authenticated');

create policy if not exists "read_all_points" on public.inspection_points
for select using (auth.role() = 'authenticated');

create policy if not exists "write_all_points" on public.inspection_points
for insert with check (auth.role() = 'authenticated');

create policy if not exists "update_all_points" on public.inspection_points
for update using (auth.role() = 'authenticated');

create policy if not exists "read_all_photos" on public.inspection_photos
for select using (auth.role() = 'authenticated');

create policy if not exists "write_all_photos" on public.inspection_photos
for insert with check (auth.role() = 'authenticated');

-- Optional: restrict updates if case is closed
create or replace function public.block_updates_when_closed() returns trigger language plpgsql as $$
begin
  if exists (select 1 from inspection_case c where c.id = coalesce(new.case_id, old.case_id) and c.status='closed') then
    raise exception 'Cannot modify closed case';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_updates_points on public.inspection_points;
create trigger trg_block_updates_points
before insert or update or delete on public.inspection_points
for each row execute procedure public.block_updates_when_closed();

drop trigger if exists trg_block_updates_photos on public.inspection_photos;
create trigger trg_block_updates_photos
before insert or update or delete on public.inspection_photos
for each row execute procedure public.block_updates_when_closed();

-- Update updated_at automatically
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_case on public.inspection_case;
create trigger trg_touch_case before update on public.inspection_case
for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_touch_points on public.inspection_points;
create trigger trg_touch_points before update on public.inspection_points
for each row execute procedure public.touch_updated_at();
