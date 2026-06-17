// ============================================================
// lib/instagram.js — métricas de Instagram vía la API de Instagram
// con login de Instagram (graph.instagram.com).
// Guarda un snapshot diario en ppweb_ig_metrics (para la evolución y
// para no pegarle a la API en cada carga del panel).
//
// Requiere en .env:
//   IG_USER_ID = id de la cuenta de Instagram (ej. 17841460186822471)
//   IG_TOKEN   = token de acceso de larga duración (empieza con IGAA...)
//
// El token de larga duración dura 60 días. Se renueva solo cada semana
// (cron) y se guarda el renovado en ig-token.json (excluido del deploy),
// así nunca se vence. Sin IG_USER_ID/IG_TOKEN, todo queda "no configurado".
// ============================================================
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('./supabase');

const API = 'https://graph.instagram.com/v21.0';
const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';
const IG_USER_ID = process.env.IG_USER_ID;
const ENV_TOKEN = process.env.IG_TOKEN;
const TOKEN_FILE = path.join(__dirname, '..', 'ig-token.json');

function configurado() {
  return !!(IG_USER_ID && ENV_TOKEN);
}

// Token vigente: el renovado (archivo) tiene prioridad; si no, el de .env.
function currentToken() {
  try {
    const j = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (j && j.token) return j.token;
  } catch (e) { /* sin archivo: usa el de .env */ }
  return ENV_TOKEN;
}

function storeToken(token) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, updated_at: new Date().toISOString() }));
  } catch (e) { console.error('[Instagram] No se pudo guardar el token:', e.message); }
}

async function gget(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Error de la API de Instagram');
  return json;
}

// ---- Renueva el token de larga duración (extiende 60 días más) ----
async function refreshToken() {
  if (!configurado()) return;
  const token = currentToken();
  const r = await gget(`${REFRESH_URL}?grant_type=ig_refresh_token&access_token=${token}`);
  if (r.access_token) {
    storeToken(r.access_token);
    console.log('[Instagram] Token renovado (60 días más).');
  }
}

// ---- Trae las métricas de hoy desde la API y las guarda ----
async function snapshotIg() {
  if (!configurado()) return { configurado: false };
  const token = currentToken();

  // Perfil: seguidores y nº de publicaciones.
  const perfil = await gget(
    `${API}/${IG_USER_ID}?fields=followers_count,media_count&access_token=${token}`);

  // Insights del día: alcance, interacciones y guardados (tolerante a fallos).
  const insights = { reach: null, total_interactions: null, saves: null };
  try {
    const r = await gget(
      `${API}/${IG_USER_ID}/insights?metric=reach,total_interactions,saves` +
      `&period=day&metric_type=total_value&access_token=${token}`);
    (r.data || []).forEach((m) => {
      const v = m.total_value ? m.total_value.value : null;
      if (v != null) insights[m.name] = v;
    });
  } catch (e) {
    console.error('[Instagram] insights:', e.message);
  }

  const dia = new Date().toISOString().slice(0, 10);
  const row = {
    dia,
    seguidores: perfil.followers_count ?? null,
    publicaciones: perfil.media_count ?? null,
    alcance: insights.reach,
    interacciones: insights.total_interactions,
    guardados: insights.saves,
  };
  const { error } = await supabaseAdmin
    .from('ppweb_ig_metrics').upsert(row, { onConflict: 'dia' });
  if (error) console.error('[Instagram] No se pudo guardar el snapshot:', error.message);
  return Object.assign({ configurado: true }, row);
}

// ---- Backfill: trae los últimos N días de insights y los guarda ----
// (followers/publicaciones no tienen histórico en la API → se usan los
// valores actuales para esos días; alcance/interacciones/guardados son reales.)
async function backfillIg(days = 30) {
  if (!configurado()) return { configurado: false };
  const token = currentToken();
  const perfil = await gget(
    `${API}/${IG_USER_ID}?fields=followers_count,media_count&access_token=${token}`);

  const hoy = new Date();
  const rows = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - i));
    const since = Math.floor(d.getTime() / 1000);
    const until = since + 86400;
    const ins = { reach: null, total_interactions: null, saves: null };
    try {
      const r = await gget(
        `${API}/${IG_USER_ID}/insights?metric=reach,total_interactions,saves` +
        `&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${token}`);
      (r.data || []).forEach((m) => {
        const v = m.total_value ? m.total_value.value : null;
        if (v != null) ins[m.name] = v;
      });
    } catch (e) { /* día sin datos: se guarda en null */ }
    rows.push({
      dia: d.toISOString().slice(0, 10),
      seguidores: perfil.followers_count ?? null,
      publicaciones: perfil.media_count ?? null,
      alcance: ins.reach,
      interacciones: ins.total_interactions,
      guardados: ins.saves,
    });
  }
  const { error } = await supabaseAdmin
    .from('ppweb_ig_metrics').upsert(rows, { onConflict: 'dia' });
  if (error) throw new Error(error.message);
  return { configurado: true, dias: rows.length };
}

// ---- Mejores publicaciones del mes (ranking por engagement) ----
async function getTopMedia(mes) {
  if (!configurado()) return { configurado: false, media: [] };
  const token = currentToken();
  const ahora = new Date();
  const [y, m] = (mes && /^\d{4}-\d{2}$/.test(mes))
    ? mes.split('-').map(Number)
    : [ahora.getFullYear(), ahora.getMonth() + 1];
  const desde = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
  const hasta = Math.floor(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000);

  const r = await gget(
    `${API}/${IG_USER_ID}/media?fields=id,caption,media_type,permalink,thumbnail_url,` +
    `media_url,timestamp,like_count,comments_count&limit=50&access_token=${token}`);
  let media = (r.data || []).filter((x) => {
    const t = Math.floor(new Date(x.timestamp).getTime() / 1000);
    return t >= desde && t < hasta;
  });
  // Ordena por engagement (likes + comentarios) y se queda con las mejores 6.
  media.sort((a, b) =>
    ((b.like_count || 0) + (b.comments_count || 0)) -
    ((a.like_count || 0) + (a.comments_count || 0)));
  media = media.slice(0, 6);

  // Alcance y guardados por publicación (en paralelo, tolerante a fallos).
  await Promise.all(media.map(async (x) => {
    try {
      const ins = await gget(`${API}/${x.id}/insights?metric=reach,saved&access_token=${token}`);
      (ins.data || []).forEach((mm) => {
        const v = mm.total_value ? mm.total_value.value
          : (mm.values && mm.values[0] ? mm.values[0].value : null);
        if (v != null) x[mm.name] = v;
      });
    } catch (e) { /* algunos tipos no exponen insights */ }
  }));

  return {
    configurado: true,
    media: media.map((x) => ({
      id: x.id,
      caption: (x.caption || '').replace(/\s+/g, ' ').slice(0, 100),
      tipo: x.media_type,
      permalink: x.permalink,
      img: x.media_type === 'VIDEO' ? x.thumbnail_url : x.media_url,
      fecha: x.timestamp,
      likes: x.like_count || 0,
      comentarios: x.comments_count || 0,
      alcance: x.reach != null ? x.reach : null,
      guardados: x.saved != null ? x.saved : null,
    })),
  };
}

// ---- Métricas del mes para el panel (lee los snapshots cacheados) ----
async function getIgStats(mes) {
  if (!configurado()) return { configurado: false };

  const ahora = new Date();
  const [y, m] = (mes && /^\d{4}-\d{2}$/.test(mes))
    ? mes.split('-').map(Number)
    : [ahora.getFullYear(), ahora.getMonth() + 1];
  const desde = y + '-' + String(m).padStart(2, '0') + '-01';
  const hasta = (m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-01';

  const { data, error } = await supabaseAdmin
    .from('ppweb_ig_metrics')
    .select('dia,seguidores,alcance,interacciones,guardados,publicaciones')
    .gte('dia', desde).lt('dia', hasta)
    .order('dia', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data || [];

  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const ultimo = rows[rows.length - 1] || {};

  // Nuevos seguidores POR DÍA (métrica follower_count, en vivo). Es el
  // "resultado del día", no el total acumulado. Tolerante a fallos.
  let porDia = [];
  let nuevosMes = null;
  try {
    const token = currentToken();
    const since = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
    const until = Math.floor(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000);
    const r = await gget(`${API}/${IG_USER_ID}/insights?metric=follower_count` +
      `&period=day&since=${since}&until=${until}&access_token=${token}`);
    const vals = (r.data && r.data[0] && r.data[0].values) || [];
    porDia = vals.map((v) => ({
      label: v.end_time.slice(8, 10) + '/' + v.end_time.slice(5, 7),
      nuevos: v.value || 0,
    }));
    nuevosMes = vals.reduce((a, v) => a + (v.value || 0), 0);
  } catch (e) {
    console.error('[Instagram] follower_count:', e.message);
  }

  return {
    configurado: true,
    seguidores: ultimo.seguidores ?? null,
    nuevosSeguidores: nuevosMes,   // suma de nuevos del mes
    alcance: sum('alcance'),
    interacciones: sum('interacciones'),
    guardados: sum('guardados'),
    publicaciones: ultimo.publicaciones ?? null,
    porDia,                        // [{ label, nuevos }] — nuevos por día
  };
}

module.exports = { configurado, snapshotIg, getIgStats, refreshToken, backfillIg, getTopMedia };
