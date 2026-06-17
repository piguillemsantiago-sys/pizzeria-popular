-- ============================================================
-- supabase-web-analytics.sql
-- Analítica propia del sitio (sin cookies) + snapshots de Instagram.
-- Correr una vez en el SQL Editor de Supabase.
-- ============================================================

-- Cada fila = un evento del sitio público.
-- tipo: pageview | whatsapp | reserva | instagram | formulario
-- visitor: hash anónimo (IP+UA+salt), NO se guarda la IP real → sin cookies.
create table if not exists ppweb_eventos (
  id          bigint generated always as identity primary key,
  tipo        text not null,
  path        text,
  referrer    text,
  visitor     text,
  device      text,            -- 'movil' | 'escritorio'
  created_at  timestamptz not null default now()
);
-- Si la tabla ya existía sin la columna device:
alter table ppweb_eventos add column if not exists device text;
create index if not exists ppweb_eventos_created_idx
  on ppweb_eventos (created_at desc);
create index if not exists ppweb_eventos_tipo_idx
  on ppweb_eventos (tipo, created_at desc);

-- Snapshot diario de métricas de Instagram (Graph API). Una fila por día.
create table if not exists ppweb_ig_metrics (
  dia            date primary key,
  seguidores     integer,
  alcance        integer,   -- reach del día
  interacciones  integer,   -- total_interactions del día
  guardados      integer,   -- saves del día
  publicaciones  integer,   -- media_count
  created_at     timestamptz not null default now()
);

-- RLS activo: sin policies públicas. Solo el backend (service_role) accede.
alter table ppweb_eventos    enable row level security;
alter table ppweb_ig_metrics enable row level security;
