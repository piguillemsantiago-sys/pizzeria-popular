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
-- Si la tabla ya existía sin estas columnas:
alter table ppweb_eventos add column if not exists device text;
alter table ppweb_eventos add column if not exists target text; -- local destino (wa/reserva)
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

-- Snapshot diario de reseñas de Google (Places API). Una fila por día.
-- Sirve para la tendencia del panel: reseñas nuevas y evolución de la valoración.
create table if not exists ppweb_google_metrics (
  dia         date primary key,
  promedio    numeric,   -- valoración media de la cadena (ej. 4.7)
  total       integer,   -- total de reseñas sumando todos los locales
  por_local   jsonb,     -- { slug: { rating, reviews } }
  created_at  timestamptz not null default now()
);

-- Snapshot diario de Meta Ads (Marketing API). Una fila por día.
-- App en modo desarrollo → solo set básico de los últimos 30 días.
create table if not exists ppweb_meta_metrics (
  dia          date primary key,
  spend        numeric,    -- gasto de los últimos 30 días
  reach        integer,    -- alcance
  impressions  integer,    -- impresiones
  clicks       integer,    -- clics
  moneda       text,       -- 'EUR'
  created_at   timestamptz not null default now()
);

-- RLS activo: sin policies públicas. Solo el backend (service_role) accede.
alter table ppweb_eventos        enable row level security;
alter table ppweb_ig_metrics     enable row level security;
alter table ppweb_google_metrics enable row level security;
alter table ppweb_meta_metrics   enable row level security;
