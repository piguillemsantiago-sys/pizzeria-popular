// ============================================================
// lib/gbp-performance.js — Rendimiento oficial de las fichas (GBP
// Performance API). Todo lo que Google mide por día y por local:
// impresiones (Maps/Búsqueda × móvil/desktop), llamadas, clicks a la
// web, cómo llegar, chats, reservas, pedidos, clicks al menú, y las
// búsquedas con las que la gente encuentra cada ficha (mensual).
// Google publica con ~3-5 días de retraso; los últimos días vienen en 0.
// ============================================================
const { getAccessToken } = require('./google-oauth');
const gbp = require('./gbp');

const LOCALES = ['luceros', 'playa-san-juan', 'russafa', 'benidorm']; // santa-clara cerró 1/9/2026
const BASE = 'https://businessprofileperformance.googleapis.com/v1/';

// Dos tandas porque la API acepta hasta 10 métricas por request.
const METRICAS_IMPRESIONES = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
];
const METRICAS_ACCIONES = [
  'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_CONVERSATIONS', 'BUSINESS_BOOKINGS', 'BUSINESS_FOOD_ORDERS',
  'BUSINESS_FOOD_MENU_CLICKS',
];

function err(status, message) { const e = new Error(message); e.status = status; return e; }

function fmtDate(d) { return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }; }

// La API cubre 18 meses como máximo; sin rango, últimos 30 días.
function resolverRango(desde, hasta) {
  const hoy = new Date();
  let fin = hasta ? new Date(hasta) : hoy;
  if (isNaN(fin.getTime()) || fin > hoy) fin = hoy;
  let ini = desde ? new Date(desde) : new Date(fin.getTime() - 29 * 24 * 3600 * 1000);
  const minimo = new Date(hoy.getTime() - 540 * 24 * 3600 * 1000);
  if (isNaN(ini.getTime()) || ini < minimo) ini = minimo;
  return { ini, fin };
}

function rangoQs(ini, fin) {
  const s = fmtDate(ini), e = fmtDate(fin);
  return `dailyRange.startDate.year=${s.year}&dailyRange.startDate.month=${s.month}&dailyRange.startDate.day=${s.day}` +
    `&dailyRange.endDate.year=${e.year}&dailyRange.endDate.month=${e.month}&dailyRange.endDate.day=${e.day}`;
}

async function fetchSeries(token, locId, metricas, ini, fin) {
  const qs = metricas.map((m) => 'dailyMetrics=' + m).join('&') + '&' + rangoQs(ini, fin);
  const r = await fetch(BASE + 'locations/' + locId + ':fetchMultiDailyMetricsTimeSeries?' + qs, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const d = await r.json();
  if (!r.ok) throw err(r.status, (d.error && d.error.message) || 'Performance API ' + r.status);
  const out = {};
  (d.multiDailyMetricTimeSeries || []).forEach((s) => (s.dailyMetricTimeSeries || []).forEach((x) => {
    out[x.dailyMetric] = ((x.timeSeries && x.timeSeries.datedValues) || [])
      .map((v) => ({ fecha: v.date, valor: +(v.value || 0) }));
  }));
  return out;
}

// Las búsquedas solo vienen por MES CERRADO (el mes en curso devuelve vacío), así
// que el rango del panel se recorta a meses completos. Antes eran siempre los
// últimos 3 meses, sin importar el filtro de fechas elegido.
function resolverMeses(ini, fin) {
  const hoy = new Date();
  const ultimoCerrado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  let finM = new Date(fin.getFullYear(), fin.getMonth(), 1);
  if (finM > ultimoCerrado) finM = ultimoCerrado;
  let iniM = new Date(ini.getFullYear(), ini.getMonth(), 1);
  if (iniM > finM) iniM = finM;  // rango dentro del mes en curso → último mes cerrado
  return { iniM, finM };
}

function mesISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

// Búsquedas con las que aparece la ficha (granularidad mensual).
async function fetchKeywords(token, locId, iniM, finM) {
  const qs = `monthlyRange.startMonth.year=${iniM.getFullYear()}&monthlyRange.startMonth.month=${iniM.getMonth() + 1}` +
    `&monthlyRange.endMonth.year=${finM.getFullYear()}&monthlyRange.endMonth.month=${finM.getMonth() + 1}&pageSize=15`;
  const r = await fetch(BASE + 'locations/' + locId + '/searchkeywords/impressions/monthly?' + qs, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const d = await r.json();
  if (!r.ok) return [];
  return (d.searchKeywordsCounts || []).map((k) => ({
    termino: k.searchKeyword,
    // Bajo cierto volumen Google da un umbral ("<15") en vez del valor exacto.
    veces: k.insightsValue ? +(k.insightsValue.value || k.insightsValue.threshold || 0) : 0,
    aproximado: !!(k.insightsValue && k.insightsValue.threshold),
  }));
}

// Cache simple: la API es diaria, no hace falta pegarle en cada carga del panel.
const _cache = new Map();

async function rendimiento({ local_id, desde, hasta } = {}) {
  const slugs = local_id && LOCALES.includes(local_id) ? [local_id] : LOCALES;
  const { ini, fin } = resolverRango(desde, hasta);
  const key = [slugs.join(','), ini.toISOString().slice(0, 10), fin.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)].join('|');
  if (_cache.has(key)) return _cache.get(key);

  const m = gbp.loadLocations();
  if (!m || !m.locales) throw err(500, 'Locales sin mapear');
  const token = await getAccessToken();

  const totales = {};   // métrica → total del período (todas las fichas pedidas)
  const porDia = {};    // fecha → vistas totales (para la serie)
  const kwAcum = new Map();
  const { iniM, finM } = resolverMeses(ini, fin);

  for (const slug of slugs) {
    const loc = m.locales[slug];
    if (!loc) continue;
    const locId = loc.v4.split('/locations/')[1];
    const [imp, acc] = await Promise.all([
      fetchSeries(token, locId, METRICAS_IMPRESIONES, ini, fin),
      fetchSeries(token, locId, METRICAS_ACCIONES, ini, fin),
    ]);
    for (const [met, serie] of Object.entries({ ...imp, ...acc })) {
      totales[met] = (totales[met] || 0) + serie.reduce((s, v) => s + v.valor, 0);
      if (met.startsWith('BUSINESS_IMPRESSIONS')) {
        serie.forEach((v) => {
          const f = v.fecha.year + '-' + String(v.fecha.month).padStart(2, '0') + '-' + String(v.fecha.day).padStart(2, '0');
          porDia[f] = (porDia[f] || 0) + v.valor;
        });
      }
    }
    (await fetchKeywords(token, locId, iniM, finM)).forEach((k) => {
      const prev = kwAcum.get(k.termino) || { veces: 0, aproximado: false };
      kwAcum.set(k.termino, { veces: prev.veces + k.veces, aproximado: prev.aproximado || k.aproximado });
    });
  }

  const vistas = METRICAS_IMPRESIONES.reduce((s, k) => s + (totales[k] || 0), 0);
  const data = {
    desde: ini.toISOString().slice(0, 10),
    hasta: fin.toISOString().slice(0, 10),
    locales: slugs,
    vistas_perfil: vistas,
    vistas_maps: (totales.BUSINESS_IMPRESSIONS_DESKTOP_MAPS || 0) + (totales.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0),
    vistas_busqueda: (totales.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0) + (totales.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0),
    vistas_movil: (totales.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0) + (totales.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0),
    llamadas: totales.CALL_CLICKS || 0,
    clicks_web: totales.WEBSITE_CLICKS || 0,
    como_llegar: totales.BUSINESS_DIRECTION_REQUESTS || 0,
    chats: totales.BUSINESS_CONVERSATIONS || 0,
    reservas: totales.BUSINESS_BOOKINGS || 0,
    pedidos_comida: totales.BUSINESS_FOOD_ORDERS || 0,
    clicks_menu: totales.BUSINESS_FOOD_MENU_CLICKS || 0,
    serie_vistas: Object.keys(porDia).sort().map((f) => ({ fecha: f, vistas: porDia[f] })),
    busquedas: [...kwAcum.entries()]
      .map(([termino, v]) => ({ termino, veces: v.veces, aproximado: v.aproximado }))
      .sort((a, b) => b.veces - a.veces).slice(0, 15),
    // Las búsquedas cubren meses cerrados: puede ser menos que el rango pedido.
    busquedas_desde: mesISO(iniM),
    busquedas_hasta: mesISO(finM),
    generado: new Date().toISOString(),
  };
  _cache.set(key, data);
  if (_cache.size > 50) _cache.delete(_cache.keys().next().value);
  return data;
}

module.exports = { rendimiento };
