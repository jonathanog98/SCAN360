
-- === Add a catalog to store YOUR EXACT CHECKLIST ===
create table if not exists public.inspection_catalog (
  id uuid primary key default uuid_generate_v4(),
  grp text,             -- optional group/section name (e.g., 'Exterior', 'Interior')
  point_key text not null,   -- machine key (unique per label; generated from label by UI)
  point_label text not null, -- EXACT label you use in tu hoja
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique(point_key)
);

-- Seed helper: if empty, you can import from config page

-- Modify seeding logic: when creating a case, we copy from inspection_catalog.
-- (Front-end already handles it; no DB change needed beyond this catalog table.)
