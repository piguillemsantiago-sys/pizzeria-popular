-- ============================================================
-- supabase-informes.sql
-- Informes semanales de Inteligencia (marketing). Los genera el
-- cron (lunes 8am) o el botón del panel. Correr una vez en el
-- SQL Editor de Supabase.
-- ============================================================

-- Cada fila = un informe. data guarda el informe IA + las métricas
-- crudas del momento (para calcular variaciones semana a semana).
create table if not exists ppweb_informes (
  id          bigint generated always as identity primary key,
  data        jsonb not null,
  enviado     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ppweb_informes_created_idx
  on ppweb_informes (created_at desc);

-- RLS activo: sin policies públicas. Solo el backend (service_role) accede.
alter table ppweb_informes enable row level security;
