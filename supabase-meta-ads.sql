-- ============================================================
-- ppweb_meta_ads — Snapshot diario de Meta Ads POR NIVEL.
-- Guarda, una vez por día, los números de cada campaña / conjunto
-- (local) / anuncio (imagen). Desde esta tabla se arma todo el
-- panel "Pauta": total de campaña, desglose por local y por imagen,
-- y el embudo (vio → click → entró).
--
-- Un solo snapshot diario (3 llamadas: campaign/adset/ad) entra
-- holgado en el rate limit del modo desarrollo de Meta.
-- `reach` (alcance) NO se puede sumar entre anuncios → por eso se
-- guarda cada nivel por separado (campaña y conjunto traen su alcance
-- deduplicado real).
-- ============================================================

create table if not exists ppweb_meta_ads (
  dia            date    not null,
  level          text    not null,            -- 'campaign' | 'adset' | 'ad'
  obj_id         text    not null,            -- id de la entidad (campaign/adset/ad)
  campaign_id    text,
  campaign_name  text,
  adset_id       text,
  adset_name     text,                        -- = local (Russafa / Santa Clara / ...)
  ad_id          text,
  ad_name        text,                        -- = creativo / imagen
  spend          numeric  default 0,          -- gasto (EUR)
  reach          integer  default 0,          -- personas distintas (deduplicado, por nivel)
  impressions    integer  default 0,          -- veces mostrado
  clicks         integer  default 0,          -- clics totales
  link_clicks    integer  default 0,          -- clics al enlace (inline_link_clicks)
  landing_views  integer  default 0,          -- visitas a la landing (actions: landing_page_view)
  find_location  integer  default 0,          -- "Cómo llegar" (actions: find_location)
  moneda         text     default 'EUR',
  created_at     timestamptz default now(),
  primary key (dia, obj_id)
);

create index if not exists idx_meta_ads_dia      on ppweb_meta_ads (dia);
create index if not exists idx_meta_ads_campaign on ppweb_meta_ads (campaign_id);

-- Solo el backend (service_role) accede; sin policies públicas.
alter table ppweb_meta_ads enable row level security;
