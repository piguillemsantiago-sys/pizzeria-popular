-- ============================================================
-- Pizzería Popular — Panel web · Tabla de blog posts
-- Ejecutar UNA VEZ en: Supabase Dashboard -> SQL Editor.
-- Requiere que ya exista la función public.ppweb_touch_updated_at()
-- (creada en supabase-schema.sql).
-- ============================================================

create table if not exists public.ppweb_posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  idioma      text not null default 'es' check (idioma in ('es','en')),
  titulo      text not null,
  subtitulo   text,                                  -- bajada del hero
  eyebrow     text default 'Novedades',              -- etiqueta sobre el título
  fecha       date not null default current_date,
  hero_image  text,                                  -- URL de la imagen del hero
  meta_desc   text,                                  -- meta description (SEO)
  keyword     text,                                  -- keyword objetivo (seguimiento)
  contenido   text,                                  -- HTML del cuerpo (.article-body)
  estado      text not null default 'borrador'
              check (estado in ('borrador','publicado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (slug, idioma)
);
alter table public.ppweb_posts enable row level security;
-- RLS activo sin policies: solo el backend (service_role) accede.

drop trigger if exists ppweb_posts_touch on public.ppweb_posts;
create trigger ppweb_posts_touch
  before update on public.ppweb_posts
  for each row execute function public.ppweb_touch_updated_at();

-- Post de prueba para verificar el renderizado.
insert into public.ppweb_posts (slug, idioma, titulo, subtitulo, eyebrow, hero_image, meta_desc, keyword, contenido, estado)
values (
  'post-de-prueba', 'es',
  'Post de prueba del panel',
  'Este post se renderiza desde la base de datos.',
  'Prueba', '/images/blog/benidorm/benidorm-balcon.jpg',
  'Post de prueba para verificar el motor de blog del panel de Pizzería Popular.',
  'prueba',
  '<p class="lead">Si estás leyendo esto, el motor de blog desde la base de datos funciona.</p><h2 id="seccion-1"><span class="h2-num">01</span>Una sección de prueba</h2><p>Texto de ejemplo del cuerpo del artículo.</p>',
  'publicado'
)
on conflict (slug, idioma) do nothing;
