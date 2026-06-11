-- ============================================================
-- supabase-banco.sql
-- Catálogo indexado del banco de imágenes (Google Drive). Cada
-- fila = una foto del banco, descrita por IA (vision) para que el
-- Generador pueda ELEGIR la foto acorde a lo que se le pide.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================
create table if not exists ppweb_banco_imagenes (
  id          bigint generated always as identity primary key,
  drive_id    text not null unique,
  carpeta     text,
  nombre      text,
  descripcion text,           -- frase de qué se ve (la genera la IA)
  tipo        text,           -- producto | personas | local | ambiente | otro
  etiquetas   jsonb default '[]'::jsonb,
  usos        int default 0,  -- veces que se usó (para no repetir siempre la misma)
  created_at  timestamptz not null default now()
);
create index if not exists ppweb_banco_drive_idx on ppweb_banco_imagenes (drive_id);
create index if not exists ppweb_banco_tipo_idx on ppweb_banco_imagenes (tipo);

alter table ppweb_banco_imagenes enable row level security;
