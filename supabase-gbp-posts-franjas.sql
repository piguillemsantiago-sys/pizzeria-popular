-- ============================================================
-- Novedades de Google: franjas horarias.
-- El borrador ya no se publica sí o sí en el momento en que el dueño lo
-- aprueba: se aprueba y queda AGENDADO para la franja del local (Playa San
-- Juan al mediodía, Luceros y Benidorm de noche). Un cron horario publica
-- lo que ya venció.
--   pendiente → aprobado → publicado   (o → descartado)
-- ============================================================

alter table pp_gbp_posts
  add column if not exists programado_para timestamptz;

comment on column pp_gbp_posts.programado_para is
  'Instante (UTC) en que se publica si el estado es «aprobado». Se calcula contra la hora de España.';

alter table pp_gbp_posts drop constraint if exists pp_gbp_posts_estado_check;
alter table pp_gbp_posts add constraint pp_gbp_posts_estado_check
  check (estado = any (array['pendiente', 'aprobado', 'publicado', 'descartado']));

-- El cron busca por estado + fecha.
create index if not exists pp_gbp_posts_agenda_idx
  on pp_gbp_posts (estado, programado_para)
  where estado = 'aprobado';
