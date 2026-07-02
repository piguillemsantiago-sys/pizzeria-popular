// lib/meta-ads.js — Métricas de Meta Ads (Marketing API) para el panel.
//
// La app está en modo desarrollo: el Marketing API tiene un rate limit muy bajo
// y solo deja leer un set básico (spend/reach/impressions/clicks con date_preset).
// Por eso NO se llama en vivo en cada carga: se snapshotea 1 vez por día y el
// panel lee del caché en Supabase. Una llamada diaria entra holgada en el límite.
//
// El token es de "usuario del sistema" (no caduca), guardado en META_ADS_TOKEN.
// Cuenta publicitaria en META_AD_ACCOUNT (formato act_<id>).

const { supabaseAdmin } = require('./supabase');

const API = 'https://graph.facebook.com/v21.0';
const TABLE = 'ppweb_meta_metrics';

function token() { return process.env.META_ADS_TOKEN || null; }
function account() { return process.env.META_AD_ACCOUNT || null; }
function configurado() { return !!(token() && account()); }

// Una sola llamada al Marketing API: totales de los últimos 30 días.
async function fetchInsights() {
  const url = `${API}/${account()}/insights` +
    `?fields=spend,reach,impressions,clicks&date_preset=last_30d` +
    `&access_token=${encodeURIComponent(token())}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`Meta API ${json.error.code}: ${json.error.message}`);
  const row = (json.data && json.data[0]) || {};
  return {
    spend: parseFloat(row.spend || 0),
    reach: parseInt(row.reach || 0, 10),
    impressions: parseInt(row.impressions || 0, 10),
    clicks: parseInt(row.clicks || 0, 10),
  };
}

// Snapshot diario: guarda los totales de los últimos 30 días.
async function snapshotMeta() {
  if (!configurado()) return null;
  const m = await fetchInsights();
  const row = {
    dia: new Date().toISOString().slice(0, 10),
    spend: m.spend,
    reach: m.reach,
    impressions: m.impressions,
    clicks: m.clicks,
    moneda: 'EUR',
  };
  const { error } = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: 'dia' });
  if (error) throw new Error(error.message);
  return row;
}

// Lee el último snapshot del caché y calcula métricas derivadas (CTR, CPC, etc.).
async function getMetaStats() {
  if (!configurado()) return { configurado: false };
  let snap = null;
  try {
    const { data } = await supabaseAdmin.from(TABLE)
      .select('dia,spend,reach,impressions,clicks,moneda')
      .order('dia', { ascending: false }).limit(1);
    snap = data && data[0];
  } catch (e) { /* sin caché todavía (tabla nueva) */ }
  if (!snap) return { configurado: true, sinDatos: true };

  const spend = Number(snap.spend) || 0;
  const reach = Number(snap.reach) || 0;
  const impr = Number(snap.impressions) || 0;
  const clicks = Number(snap.clicks) || 0;
  return {
    configurado: true,
    dia: snap.dia,
    moneda: snap.moneda || 'EUR',
    spend, reach, impressions: impr, clicks,
    ctr: impr ? Math.round((clicks / impr) * 1000) / 10 : 0,        // %
    cpc: clicks ? Math.round((spend / clicks) * 100) / 100 : 0,     // moneda por clic
    cpm: impr ? Math.round((spend / impr) * 1000 * 100) / 100 : 0,  // moneda por mil impr
    frecuencia: reach ? Math.round((impr / reach) * 10) / 10 : 0,
  };
}

// ============================================================
// PAUTA — snapshot por anuncio + lectura para el panel.
// Extiende el snapshot de cuenta a nivel campaña / conjunto (local)
// / anuncio (imagen). Una tabla (ppweb_meta_ads) con columna `level`.
// ============================================================
const TABLE_ADS = 'ppweb_meta_ads';

// Valor de una acción puntual del array `actions` de la Graph API.
function actionVal(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? parseInt(a.value || 0, 10) : 0;
}

// Insights a un nivel dado (campaign | adset | ad), totales de toda la vida.
async function fetchInsightsByLevel(level) {
  const fields = [
    'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
    'spend', 'reach', 'impressions', 'clicks', 'inline_link_clicks', 'actions',
  ].join(',');
  const url = `${API}/${account()}/insights` +
    `?level=${level}&fields=${fields}&date_preset=maximum&limit=500` +
    `&access_token=${encodeURIComponent(token())}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`Meta API ${json.error.code}: ${json.error.message}`);
  return json.data || [];
}

// Snapshot diario por anuncio: guarda campaign + adset + ad en ppweb_meta_ads.
async function snapshotMetaAds() {
  if (!configurado()) return null;
  const dia = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const level of ['campaign', 'adset', 'ad']) {
    const data = await fetchInsightsByLevel(level);
    for (const r of data) {
      const obj_id = level === 'ad' ? r.ad_id : level === 'adset' ? r.adset_id : r.campaign_id;
      if (!obj_id) continue;
      rows.push({
        dia, level, obj_id,
        campaign_id: r.campaign_id || null, campaign_name: r.campaign_name || null,
        adset_id: r.adset_id || null, adset_name: r.adset_name || null,
        ad_id: r.ad_id || null, ad_name: r.ad_name || null,
        spend: parseFloat(r.spend || 0),
        reach: parseInt(r.reach || 0, 10),
        impressions: parseInt(r.impressions || 0, 10),
        clicks: parseInt(r.clicks || 0, 10),
        link_clicks: parseInt(r.inline_link_clicks || 0, 10),
        landing_views: actionVal(r.actions, 'landing_page_view'),
        find_location: actionVal(r.actions, 'find_location'),
        moneda: 'EUR',
      });
    }
  }
  if (rows.length) {
    const { error } = await supabaseAdmin.from(TABLE_ADS).upsert(rows, { onConflict: 'dia,obj_id' });
    if (error) throw new Error(error.message);
  }
  return { dia, filas: rows.length };
}

// Métricas + derivadas (CTR al enlace, costo por clic al enlace).
function derivar(m) {
  const spend = Math.round((m.spend || 0) * 100) / 100;
  const impr = m.impressions || 0;
  const link = m.link_clicks || 0;
  return {
    spend,
    reach: m.reach || 0,
    impressions: impr,
    clicks: m.clicks || 0,
    link_clicks: link,
    landing_views: m.landing_views || 0,
    find_location: m.find_location || 0,
    ctr: impr ? Math.round((link / impr) * 1000) / 10 : 0,       // % clics al enlace
    cpl: link ? Math.round((spend / link) * 100) / 100 : 0,      // costo por clic al enlace
  };
}

// IDs de campañas ACTIVAS (en vivo, llamada liviana). El estado cambia seguido,
// por eso no se snapshotea. Si falla, devuelve null → el panel muestra todas.
async function fetchActiveCampaignIds() {
  try {
    const url = `${API}/${account()}/campaigns?fields=id,effective_status&limit=300` +
      `&access_token=${encodeURIComponent(token())}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) return null;
    return new Set((json.data || []).filter((c) => c.effective_status === 'ACTIVE').map((c) => c.id));
  } catch (e) { return null; }
}

// Lee el último snapshot y arma el árbol campaña → local → imagen para el panel.
async function getPautaData() {
  if (!configurado()) return { configurado: false };
  let dia = null;
  try {
    const { data } = await supabaseAdmin.from(TABLE_ADS)
      .select('dia').order('dia', { ascending: false }).limit(1);
    dia = data && data[0] && data[0].dia;
  } catch (e) { /* tabla nueva / sin datos todavía */ }
  if (!dia) return { configurado: true, sinDatos: true };

  const { data: rows, error } = await supabaseAdmin.from(TABLE_ADS).select('*').eq('dia', dia);
  if (error) throw new Error(error.message);

  const camps = {};
  const campOf = (id, name) => {
    if (!camps[id]) camps[id] = { id, name: name || id, total: null, _loc: {} };
    if (name) camps[id].name = name;
    return camps[id];
  };
  // create-or-get del conjunto (local) SIN pisar lo ya cargado. El orden de filas
  // del SELECT no está garantizado: la fila 'adset' puede llegar DESPUÉS de las 'ad'
  // → si se sobreescribiera el objeto se perderían los creativos ya agregados.
  const locOf = (c, adsetId, adsetName) => {
    if (!c._loc[adsetId]) c._loc[adsetId] = { id: adsetId, name: adsetName || adsetId, total: null, _ads: {} };
    else if (adsetName) c._loc[adsetId].name = adsetName;
    return c._loc[adsetId];
  };

  for (const r of rows || []) {
    if (r.level === 'campaign') {
      campOf(r.campaign_id, r.campaign_name).total = derivar(r);
    } else if (r.level === 'adset') {
      locOf(campOf(r.campaign_id, r.campaign_name), r.adset_id, r.adset_name).total = derivar(r);
    } else if (r.level === 'ad') {
      locOf(campOf(r.campaign_id, r.campaign_name), r.adset_id, r.adset_name)
        ._ads[r.ad_id] = Object.assign({ id: r.ad_id, name: r.ad_name || r.ad_id }, derivar(r));
    }
  }

  const activos = await fetchActiveCampaignIds();
  const campañas = Object.values(camps).map((c) => {
    const locales = Object.values(c._loc).map((l) => ({
      id: l.id, name: l.name, total: l.total || derivar({}),
      creativos: Object.values(l._ads).sort((a, b) => b.link_clicks - a.link_clicks),
    })).sort((a, b) => b.total.spend - a.total.spend);
    return {
      id: c.id, name: c.name,
      activa: activos ? activos.has(c.id) : true,   // sin estado disponible → no se oculta
      total: c.total || derivar({}), locales,
    };
  }).sort((a, b) => (b.activa - a.activa) || (b.total.spend - a.total.spend)); // activas primero, luego gasto

  return { configurado: true, dia, campañas };
}

module.exports = { configurado, snapshotMeta, getMetaStats, snapshotMetaAds, getPautaData };
