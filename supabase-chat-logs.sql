-- ============================================================
-- supabase-chat-logs.sql
-- Registro de conversaciones del chatbot Pepe (web pública) +
-- análisis IA cacheado. Correr una vez en el SQL Editor de Supabase.
-- ============================================================

-- Cada fila = un turno de conversación (consulta + respuesta).
create table if not exists ppweb_chat_logs (
  id          bigint generated always as identity primary key,
  session_id  text,
  user_msg    text not null,
  bot_reply   text,
  created_at  timestamptz not null default now()
);
create index if not exists ppweb_chat_logs_created_idx
  on ppweb_chat_logs (created_at desc);

-- Análisis IA generado (diario por cron + manual desde el panel).
create table if not exists ppweb_chat_insights (
  id          bigint generated always as identity primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists ppweb_chat_insights_created_idx
  on ppweb_chat_insights (created_at desc);

-- RLS activo: sin policies públicas. Solo el backend (service_role) accede.
alter table ppweb_chat_logs     enable row level security;
alter table ppweb_chat_insights enable row level security;
