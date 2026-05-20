-- ============================================================
-- Pizzería Popular — Panel web · Schema Supabase
-- Proyecto Supabase compartido: "AJAX Sistema de Gestión"
-- Prefijo ppweb_  = grupo "página web", aislado del sistema AJAX.
-- Ejecutar UNA VEZ en: Supabase Dashboard -> SQL Editor.
-- ============================================================

-- ---- Administradores autorizados del panel /admin ----
create table if not exists public.ppweb_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.ppweb_admins enable row level security;
-- Sin policies: RLS activo + sin policy = solo el backend (service_role,
-- que bypassa RLS) puede leer/escribir. Nadie con anon/authenticated entra.

-- ---- Promociones ----
create table if not exists public.ppweb_promos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  subtitulo    text,
  descripcion  text,
  condiciones  text,
  badge        text,                       -- ej. "Promo"; null = sin badge
  imagen_url   text,                       -- imagen de fondo de la card
  boton_texto  text default 'Reservar mesa',
  boton_accion text not null default 'reservar'
               check (boton_accion in ('reservar','menus','ninguno')),
  activa       boolean not null default true,
  orden        integer not null default 0,
  idioma       text not null default 'es' check (idioma in ('es','en')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.ppweb_promos enable row level security;
-- Mismo criterio: todo el acceso pasa por el backend con service_role.

-- ---- Trigger: mantener updated_at ----
create or replace function public.ppweb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists ppweb_promos_touch on public.ppweb_promos;
create trigger ppweb_promos_touch
  before update on public.ppweb_promos
  for each row execute function public.ppweb_touch_updated_at();

-- ---- Alta del administrador ----
insert into public.ppweb_admins (user_id, email)
values ('34323240-a10f-4ac9-8ceb-b7a40cf611ce', 'piguillemsantiago@gmail.com')
on conflict (user_id) do nothing;

-- ---- Carga inicial: las 4 promos actuales del sitio ----
insert into public.ppweb_promos
  (titulo, subtitulo, descripcion, condiciones, badge, imagen_url, boton_texto, boton_accion, orden, idioma)
values
  ('2×1 en Pizzas', 'Todos los lunes',
   'Comés 2, pagás 1. Solo para consumir en el local.',
   'Válido solo en los locales de Valencia (Santa Clara y Russafa). No incluye días festivos.',
   'Promo', '/images/extracted/promo-2x1-pizzas.jpg', 'Reservar mesa', 'reservar', 1, 'es'),
  ('2×1 en Milanesas', 'Todos los miércoles',
   'Comés 2, pagás 1. Solo para consumir en el local.',
   'Válido solo en los locales de Valencia (Santa Clara y Russafa). No incluye días festivos.',
   'Promo', '/images/extracted/promo-2x1-milanesas.jpg', 'Reservar mesa', 'reservar', 2, 'es'),
  ('Menú del día', 'De lunes a viernes al mediodía',
   'Entrada + Principal + Postre + Bebida. Una experiencia completa al mejor precio.',
   'Disponible en todos nuestros locales. No incluye días festivos.',
   null, '/images/extracted/producto-pizza-dolce.jpg', 'Ver menús', 'menus', 3, 'es'),
  ('Happy Hour', 'Caña 2€ · Pinta 3€',
   'Cerveza tirada bien fría a precio amigo.',
   'Válido solo en los locales de Valencia (Santa Clara y Russafa).',
   'Promo', '/images/bg-promos.jpg', 'Reservar mesa', 'reservar', 4, 'es')
on conflict do nothing;
