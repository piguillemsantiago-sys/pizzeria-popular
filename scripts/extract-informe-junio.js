// Extrae los datos de junio 2026 de todas las fuentes del sistema
// y los vuelca en informes/2026-06/datos-sistema.json (solo lectura, one-off).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../lib/supabase');
const menuAnalytics = require('../lib/menu-analytics');
const menu = require('../lib/menu');
const { getWebStats } = require('../lib/web-stats');
const { getGoogleStats } = require('../lib/google-stats');
const chatStats = require('../lib/chat-stats');

// Junio 2026 en horario Madrid (CEST, UTC+2)
const FROM = '2026-05-31T22:00:00.000Z';
const TO = '2026-06-30T21:59:59.999Z';

async function menuPorLocal() {
  const { data: restaurants, error } = await supabaseAdmin.from('restaurants').select('id, name');
  if (error) throw error;
  const ajaxId = await menu.getAjaxRestaurantId();
  const ctx = { access: { restaurantIds: (restaurants || []).map((r) => r.id) }, ajaxId };
  const out = {};
  for (const r of restaurants || []) {
    if (r.id === ajaxId) continue;
    const s = await menuAnalytics.getSummary(ctx, { restaurant_id: r.id, range: 'custom', from: FROM, to: TO });
    out[r.name] = {
      visitas_junio: s.visits_by_day.reduce((acc, d) => acc + d.count, 0),
      visitantes_unicos_junio: s.funnel.scan,
      funnel: s.funnel,
      top_items: s.top_items,
      top_categories: s.top_categories,
      top_searches: s.top_searches,
      languages: s.languages,
      devices: s.devices,
      origen: s.origen,
    };
  }
  return out;
}

async function googleJunio() {
  const actual = await getGoogleStats();
  const snapAt = async (dia) => {
    const { data } = await supabaseAdmin.from('ppweb_google_metrics')
      .select('dia, promedio, total, por_local')
      .lte('dia', dia).order('dia', { ascending: false }).limit(1);
    return (data && data[0]) || null;
  };
  return { actual, snapshot_inicio: await snapAt('2026-06-01'), snapshot_fin: await snapAt('2026-07-01') };
}

async function metaJunio() {
  const dias = await supabaseAdmin.from('ppweb_meta_ads')
    .select('dia').gte('dia', '2026-06-01').lte('dia', '2026-07-01')
    .order('dia', { ascending: true }).limit(1);
  const diasFin = await supabaseAdmin.from('ppweb_meta_ads')
    .select('dia').gte('dia', '2026-06-01').lte('dia', '2026-07-01')
    .order('dia', { ascending: false }).limit(1);
  const d0 = dias.data && dias.data[0] && dias.data[0].dia;
  const d1 = diasFin.data && diasFin.data[0] && diasFin.data[0].dia;
  if (!d0 || !d1) return { error: 'sin snapshots de junio' };
  const fetchDia = async (dia) => {
    const { data, error } = await supabaseAdmin.from('ppweb_meta_ads').select('*').eq('dia', dia);
    if (error) throw error;
    return data || [];
  };
  const inicio = await fetchDia(d0);
  const fin = await fetchDia(d1);
  const iniMap = new Map(inicio.map((r) => [r.obj_id, r]));
  const NUMS = ['spend', 'impressions', 'clicks', 'link_clicks', 'landing_views', 'find_location'];
  const junio = fin.map((r) => {
    const antes = iniMap.get(r.obj_id) || {};
    const delta = {};
    for (const k of NUMS) delta[k] = Math.round(((Number(r[k]) || 0) - (Number(antes[k]) || 0)) * 100) / 100;
    return {
      level: r.level, campaign_name: r.campaign_name, adset_name: r.adset_name, ad_name: r.ad_name,
      junio_delta: delta, acumulado_fin: { spend: r.spend, reach: r.reach, impressions: r.impressions, clicks: r.clicks, link_clicks: r.link_clicks, landing_views: r.landing_views, find_location: r.find_location },
    };
  }).filter((r) => Object.values(r.junio_delta).some((v) => v !== 0));
  return { snapshot_inicio: d0, snapshot_fin: d1, nota: 'junio_delta = fin - inicio de snapshots acumulados; si la campaña arrancó en junio el delta ES el total', objetos: junio };
}

async function chatJunio() {
  const { data, error } = await supabaseAdmin.from('ppweb_chat_logs')
    .select('session_id, user_msg, created_at')
    .gte('created_at', FROM).lte('created_at', TO)
    .order('created_at', { ascending: true }).limit(5000);
  if (error) throw error;
  const rows = data || [];
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const counts = new Map();
  for (const r of rows) {
    const k = norm(r.user_msg);
    if (k.length < 4) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const recurrentes = [...counts.entries()].filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 20).map(([q, c]) => ({ pregunta: q, veces: c }));
  const insight = await chatStats.getLatestInsight().catch(() => null);
  return { mensajes: rows.length, sesiones: new Set(rows.map((r) => r.session_id)).size, recurrentes, ultimo_insight: insight };
}

(async () => {
  const out = { generado_para: '2026-06', ventana_utc: { from: FROM, to: TO } };
  const paso = async (nombre, fn) => {
    try { out[nombre] = await fn(); console.log('OK', nombre); }
    catch (e) { out[nombre] = { error: e.message }; console.error('ERROR', nombre, e.message); }
  };
  await paso('menu_digital', menuPorLocal);
  await paso('web', () => getWebStats('2026-06'));
  await paso('google', googleJunio);
  await paso('meta_ads', metaJunio);
  await paso('chat_pepe', chatJunio);
  const dest = path.join(__dirname, '..', 'informes', '2026-06', 'datos-sistema.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log('Escrito', dest);
})();
