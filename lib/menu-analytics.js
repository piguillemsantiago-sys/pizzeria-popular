// ============================================================
// lib/menu-analytics.js — dashboard de analítica del Menú Digital (admin).
// Portado desde habit-tracker/src/routes/menu-analytics.js a funciones puras.
// Lee de menu_analytics (lo alimenta el menú público en Railway) y agrega en JS.
//
//   getSummary(ctx, query)  → métricas de un local
//   getGlobal(ctx, query)   → comparativa entre los locales accesibles
//   ctx = { userId, access: {restaurantIds, ...}, ajaxId }
// ============================================================
const { supabaseAdmin } = require('./supabase');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// PostgREST capa cada request a max_rows (1000 en este proyecto): un .limit(50000)
// devuelve solo las 1000 filas más recientes y se subcuentan los días viejos de
// la ventana. Para agregar sobre TODA la ventana hay que paginar con .range().
// buildQuery() debe devolver una query fresca (sin .range() aplicado).
async function fetchAllRows(buildQuery) {
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
    if (error) throw httpError(500, error.message || 'Error leyendo analytics');
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < PAGE || offset > 500000) break; // fin, o tope de seguridad
  }
  return all;
}

// Compatibilidad de event_type: el código se renombró a mitad de proyecto;
// la data vieja usa los nombres legacy, así que matcheamos ambos.
const EVT = {
  page: ['page_view', 'session_start'],
  category: ['category_open', 'view_category'],
  item: ['item_view', 'view_item'],
  language: ['language_change', 'change_language'],
  search: ['search'],
  wifi: ['wifi_open'],
  instagram: ['instagram_click'],
  whatsapp: ['whatsapp_click'],
  google: ['google_review_click'],
};

// Clasifica el referrer (URL de origen) en un canal. '' = QR/directo (tracked).
// null/undefined = evento sin tracking (fila vieja) — se filtra antes de llamar.
function classifyReferrer(ref) {
  if (!ref) return 'directo'; // '' → directo/QR/favorito
  let host;
  try { host = new URL(ref).hostname.toLowerCase(); } catch (_) { host = String(ref).toLowerCase(); }
  host = host.replace(/^www\./, '');
  // Auto-referencia (recarga / navegación interna del propio menú) cuenta como directo.
  if (host.includes('railway.app') || host.includes('habit-tracker')) return 'directo';
  if (host.includes('pizzeriapopular') || host.includes('grupoajax')) return 'web';
  if (host.includes('google') || host === 'g.page' || host.endsWith('.g.page') || host.includes('goo.gl') || host.includes('gstatic')) return 'google';
  if (host.includes('instagram') || host.includes('facebook') || host.includes('fb.com') || host.includes('fb.me') || host.includes('tiktok') || host === 't.co' || host.includes('twitter') || host === 'x.com' || host.includes('whatsapp') || host.includes('wa.me')) return 'redes';
  return 'otros';
}

function resolveRange(range, fromQ, toQ) {
  const now = new Date();
  const to = toQ ? new Date(toQ) : new Date(now);
  let from;
  if (range === 'today') {
    from = new Date(now); from.setHours(0, 0, 0, 0);
  } else if (range === '7d') {
    from = new Date(now); from.setDate(from.getDate() - 7);
  } else if (range === '90d') {
    from = new Date(now); from.setDate(from.getDate() - 90);
  } else if (range === 'custom' && fromQ) {
    from = new Date(fromQ);
  } else {
    from = new Date(now); from.setDate(from.getDate() - 30); // default 30d
  }
  return { from, to };
}

function isMobileUA(ua) {
  if (!ua) return false;
  return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);
}

// Agrupa por keyFn → [{key, count}] ordenado desc por count.
function groupCount(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function fillDailyRange(from, to, byDay) {
  const out = [];
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (d <= end) {
    const k = d.toISOString().slice(0, 10);
    out.push({ date: k, count: byDay.get(k) || 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Traduce campos JSONB de nombre (o strings planos) a español para mostrar.
function pickName(name) {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name.es || name.en || Object.values(name)[0] || '';
}

// ---------- PER-RESTAURANT SUMMARY ----------
async function getSummary(ctx, query) {
  const restaurantId = query.restaurant_id;
  if (!restaurantId || !ctx.access.restaurantIds.includes(restaurantId)) {
    throw httpError(403, 'Sin acceso a este local');
  }
  if (restaurantId === ctx.ajaxId) {
    throw httpError(400, 'AJAX no es un local público; usá /global.');
  }

  const { from, to } = resolveRange(query.range, query.from, query.to);

  const rows = await fetchAllRows(() => supabaseAdmin.from('menu_analytics')
    .select('event_type, menu_item_id, category_id, language, search_query, session_id, user_agent, referrer, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false }));

  const isPage = (r) => EVT.page.includes(r.event_type);
  const isItem = (r) => EVT.item.includes(r.event_type);
  const isCategory = (r) => EVT.category.includes(r.event_type);
  const isSearch = (r) => EVT.search.includes(r.event_type);

  // ----- Cards -----
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30);

  const pageEvents = rows.filter(isPage);
  const visitsToday = pageEvents.filter((r) => new Date(r.created_at) >= todayStart).length;
  const visitsWeek = pageEvents.filter((r) => new Date(r.created_at) >= weekStart).length;
  const visitsMonth = pageEvents.filter((r) => new Date(r.created_at) >= monthStart).length;
  const uniqueVisitorsMonth = new Set(
    pageEvents.filter((r) => new Date(r.created_at) >= monthStart && r.session_id).map((r) => r.session_id)
  ).size;

  // ----- Visits by day (rango completo, con días en cero) -----
  const byDay = new Map();
  for (const r of pageEvents) {
    const k = dayKey(r.created_at);
    byDay.set(k, (byDay.get(k) || 0) + 1);
  }
  const visitsByDay = fillDailyRange(from, to, byDay);

  // ----- Top items (con nombres) -----
  const itemEvents = rows.filter(isItem);
  const itemGroups = groupCount(itemEvents, (r) => r.menu_item_id).slice(0, 10);
  const itemIds = itemGroups.map((g) => g.key);
  let itemNames = new Map();
  if (itemIds.length) {
    const { data: items } = await supabaseAdmin.from('menu_items').select('id, name').in('id', itemIds);
    for (const it of items || []) itemNames.set(it.id, pickName(it.name));
  }
  const topItems = itemGroups.map((g) => ({
    menu_item_id: g.key,
    name: itemNames.get(g.key) || '(eliminado)',
    count: g.count,
  }));

  // ----- Top categories -----
  const catEvents = rows.filter(isCategory);
  const catGroups = groupCount(catEvents, (r) => r.category_id).slice(0, 5);
  const catIds = catGroups.map((g) => g.key);
  let catNames = new Map();
  if (catIds.length) {
    const { data: cats } = await supabaseAdmin.from('menu_categories').select('id, name').in('id', catIds);
    for (const c of cats || []) catNames.set(c.id, pickName(c.name));
  }
  const topCategories = catGroups.map((g) => ({
    category_id: g.key,
    name: catNames.get(g.key) || '(eliminada)',
    count: g.count,
  }));

  // ----- Languages distribution -----
  const langGroups = groupCount(pageEvents, (r) => r.language || 'es');
  const langTotal = langGroups.reduce((s, g) => s + g.count, 0) || 1;
  const languages = langGroups.map((g) => ({
    lang: g.key,
    count: g.count,
    percent: Math.round((g.count / langTotal) * 1000) / 10,
  }));

  // ----- Top searches -----
  const searchEvents = rows.filter((r) => isSearch(r) && r.search_query);
  const searchGroups = groupCount(searchEvents, (r) => String(r.search_query).trim().toLowerCase()).slice(0, 10);
  const topSearches = searchGroups.map((g) => ({ query: g.key, count: g.count }));

  // ----- Devices (una fila por sesión, deduplicada) -----
  const seenSessions = new Set();
  let mobile = 0, desktop = 0;
  for (const r of rows) {
    if (!r.session_id || !r.user_agent) continue;
    if (seenSessions.has(r.session_id)) continue;
    seenSessions.add(r.session_id);
    if (isMobileUA(r.user_agent)) mobile++; else desktop++;
  }
  const devTotal = (mobile + desktop) || 1;
  const devices = {
    mobile,
    desktop,
    mobile_percent: Math.round((mobile / devTotal) * 1000) / 10,
    desktop_percent: Math.round((desktop / devTotal) * 1000) / 10,
  };

  // ----- Hourly (page views por hora 0-23, en UTC) -----
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const r of pageEvents) {
    const h = new Date(r.created_at).getUTCHours();
    hourly[h].count += 1;
  }

  // ----- Embudo por sesión: visitantes que alcanzan cada etapa -----
  const sessionsWith = (pred) => {
    const s = new Set();
    for (const r of rows) if (r.session_id && pred(r)) s.add(r.session_id);
    return s;
  };
  const ACTION_TYPES = [...EVT.wifi, ...EVT.instagram, ...EVT.whatsapp, ...EVT.google];
  const visitSessions = sessionsWith(isPage);
  const interOf = (set) => { let n = 0; for (const id of set) if (visitSessions.has(id)) n++; return n; };
  const funnel = {
    scan: visitSessions.size,
    category: interOf(sessionsWith(isCategory)),
    item: interOf(sessionsWith(isItem)),
    action: interOf(sessionsWith((r) => ACTION_TYPES.includes(r.event_type))),
  };

  // ----- Heatmap día×hora (page views, UTC). dow: Lun=0 … Dom=6 -----
  const heatGrid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let heatMax = 0;
  for (const r of pageEvents) {
    const dt = new Date(r.created_at);
    const dow = (dt.getUTCDay() + 6) % 7;
    const v = ++heatGrid[dow][dt.getUTCHours()];
    if (v > heatMax) heatMax = v;
  }
  const heatmap = { days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], grid: heatGrid, max: heatMax };

  // ----- Origen de la visita (solo aperturas con tracking: referrer es string) -----
  const trackedOpens = pageEvents.filter((r) => typeof r.referrer === 'string');
  const origenCounts = { directo: 0, web: 0, google: 0, redes: 0, otros: 0 };
  for (const r of trackedOpens) origenCounts[classifyReferrer(r.referrer)]++;
  const origen = { total: trackedOpens.length, counts: origenCounts };

  return {
    range: query.range || '30d',
    from: from.toISOString(),
    to: to.toISOString(),
    metrics: {
      visits_today: visitsToday,
      visits_week: visitsWeek,
      visits_month: visitsMonth,
      unique_visitors_month: uniqueVisitorsMonth,
    },
    visits_by_day: visitsByDay,
    top_items: topItems,
    top_categories: topCategories,
    languages,
    top_searches: topSearches,
    devices,
    hourly,
    funnel,
    heatmap,
    origen,
  };
}

// ---------- GLOBAL VIEW (AJAX seleccionado) ----------
// Agrega los locales accesibles (excluyendo AJAX) para comparar.
async function getGlobal(ctx, query) {
  const { from, to } = resolveRange(query.range, query.from, query.to);

  const accessibleIds = ctx.access.restaurantIds.filter((id) => id !== ctx.ajaxId);
  let restaurants = [];
  if (accessibleIds.length) {
    const { data } = await supabaseAdmin.from('restaurants')
      .select('id, name, slug').in('id', accessibleIds);
    restaurants = (data || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  if (!restaurants.length) {
    return {
      range: query.range || '30d',
      from: from.toISOString(),
      to: to.toISOString(),
      restaurants: [],
      totals: { visits: 0, unique_visitors: 0 },
    };
  }

  const ids = restaurants.map((r) => r.id);
  const events = await fetchAllRows(() => supabaseAdmin.from('menu_analytics')
    .select('restaurant_id, event_type, menu_item_id, session_id, created_at')
    .in('restaurant_id', ids)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false }));

  const isPage = (r) => EVT.page.includes(r.event_type);
  const isItem = (r) => EVT.item.includes(r.event_type);

  const buckets = new Map();
  for (const r of restaurants) buckets.set(r.id, { visits: [], items: [] });
  for (const ev of events || []) {
    const b = buckets.get(ev.restaurant_id);
    if (!b) continue;
    if (isPage(ev)) b.visits.push(ev);
    else if (isItem(ev)) b.items.push(ev);
  }

  const allTopIds = new Set();
  const perRestaurantTops = new Map();
  for (const [rid, b] of buckets) {
    const top = groupCount(b.items, (r) => r.menu_item_id).slice(0, 1)[0];
    perRestaurantTops.set(rid, top || null);
    if (top) allTopIds.add(top.key);
  }
  let itemNames = new Map();
  if (allTopIds.size) {
    const { data: items } = await supabaseAdmin.from('menu_items')
      .select('id, name').in('id', Array.from(allTopIds));
    for (const it of items || []) itemNames.set(it.id, pickName(it.name));
  }

  let totalVisits = 0;
  const allSessions = new Set();
  const result = restaurants.map((r) => {
    const b = buckets.get(r.id) || { visits: [], items: [] };
    const visits = b.visits.length;
    const sessions = new Set(b.visits.filter((e) => e.session_id).map((e) => e.session_id));
    totalVisits += visits;
    sessions.forEach((s) => allSessions.add(s));
    const top = perRestaurantTops.get(r.id);
    return {
      restaurant_id: r.id,
      slug: r.slug,
      name: r.name,
      visits,
      unique_visitors: sessions.size,
      top_item: top ? { menu_item_id: top.key, name: itemNames.get(top.key) || '(eliminado)', count: top.count } : null,
    };
  }).sort((a, b) => b.visits - a.visits);

  return {
    range: query.range || '30d',
    from: from.toISOString(),
    to: to.toISOString(),
    restaurants: result,
    totals: { visits: totalVisits, unique_visitors: allSessions.size },
  };
}

module.exports = { getSummary, getGlobal };
