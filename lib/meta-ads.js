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

module.exports = { configurado, snapshotMeta, getMetaStats };
