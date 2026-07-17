-- ============================================================
-- supabase-resenas-gbp.sql — Fase 2 de reseñas (Business Profile API).
-- Agrega a pp_resenas_google las columnas para sincronizar con Google.
-- Correr UNA vez en el SQL Editor de Supabase (proyecto zaoaxkewnratzenklyth).
-- ============================================================

alter table pp_resenas_google
  add column if not exists origen text not null default 'manual',
  add column if not exists google_review_id text,
  add column if not exists google_update_time timestamptz,
  add column if not exists respuesta_publicada boolean not null default false,
  add column if not exists fecha_publicacion timestamptz;

-- Una fila por reseña de Google (NULL repetidos permitidos → las manuales no chocan).
do $$ begin
  alter table pp_resenas_google
    add constraint pp_resenas_google_review_id_key unique (google_review_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- Las reseñas sincronizadas pueden venir sin texto (solo estrellas) y sin
-- respuesta todavía → esas columnas tienen que aceptar vacío/null.
alter table pp_resenas_google alter column texto_original drop not null;
alter table pp_resenas_google alter column respuesta_elegida drop not null;

create index if not exists pp_resenas_google_local_origen
  on pp_resenas_google (local_id, origen);
