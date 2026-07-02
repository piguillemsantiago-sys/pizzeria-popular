-- ============================================================
-- supabase-brand-kit.sql
-- Brand Kit del Generador: la identidad de la marca en palabras
-- (paleta, tipografías, fotografía, tono, reglas duras) que se
-- inyecta en TODOS los prompts de imagen. Una sola fila (id=1);
-- el código trae defaults si la fila no existe todavía.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================
create table if not exists ppweb_brand_kit (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table ppweb_brand_kit enable row level security;
