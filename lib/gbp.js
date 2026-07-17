// ============================================================
// lib/gbp.js — Google Business Profile API (Fase 2 de reseñas).
// Sincroniza las reseñas reales de Google a pp_resenas_google y publica
// respuestas en la ficha vía la API. Requiere lib/google-oauth.js conectado.
//
// APIs usadas (proyecto GCP popular-reviews-automation, allowlisted):
//   - Account Management v1  → cuenta(s) del negocio
//   - Business Information v1 → locations + placeId (para mapear contra
//     google-places.js). Hay que tenerla HABILITADA en el proyecto.
//   - My Business v4 (legacy) → reviews.list / reviews.updateReply (las
//     reseñas nunca se migraron a v1; v4 sigue siendo la API oficial).
//
// El mapeo slug→location se descubre una vez ("Detectar locales" en el
// panel) y se guarda en gbp-locations.json (excluido de git y del deploy).
// ============================================================
const fs = require('fs');
const path = require('path');
const { getAccessToken, conectado } = require('./google-oauth');
const { supabaseAdmin } = require('./supabase');

const TABLE = 'pp_resenas_google';
const LOC_FILE = path.join(__dirname, '..', 'gbp-locations.json');

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

// ---- HTTP con Bearer ----
async function gapi(url, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data.error && data.error.message) || text.slice(0, 300) || ('HTTP ' + res.status);
    const e = new Error('GBP API ' + res.status + ': ' + msg);
    e.status = res.status;
    throw e;
  }
  return data;
}

// ---- Mapeo de locales ----
function loadLocations() {
  try {
    if (fs.existsSync(LOC_FILE)) return JSON.parse(fs.readFileSync(LOC_FILE, 'utf-8'));
  } catch (e) { console.error('[GBP] Error leyendo gbp-locations.json:', e.message); }
  return null;
}

function mapeado() {
  const m = loadLocations();
  return !!(m && m.locales && Object.keys(m.locales).length);
}

// Descubre cuenta + locations y los mapea contra los placeId de
// google-places.js. Se corre una vez desde el panel; reescribe el archivo.
async function descubrir() {
  const { LOCALS } = require('../google-places');

  const acc = await gapi('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  const accounts = acc.accounts || [];
  if (!accounts.length) throw new Error('La cuenta autorizada no administra ningún perfil de negocio');

  const byPlaceId = {};
  LOCALS.forEach((l) => { if (l.placeId) byPlaceId[l.placeId] = l; });

  const locales = {};
  const sinMatch = [];
  for (const account of accounts) {
    let pageToken = '';
    do {
      const url = 'https://mybusinessbusinessinformation.googleapis.com/v1/' + account.name +
        '/locations?readMask=name,title,metadata&pageSize=100' +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const r = await gapi(url);
      (r.locations || []).forEach((loc) => {
        const placeId = loc.metadata && loc.metadata.placeId;
        const local = placeId && byPlaceId[placeId];
        if (local) {
          // Para la v4 de reviews hace falta accounts/{a}/locations/{l}.
          locales[local.slug] = {
            v4: account.name + '/' + loc.name, // accounts/123/locations/456
            title: loc.title,
            placeId,
          };
        } else {
          sinMatch.push({ title: loc.title, placeId: placeId || null });
        }
      });
      pageToken = r.nextPageToken || '';
    } while (pageToken);
  }

  const data = {
    generado: new Date().toISOString(),
    cuentas: accounts.map((a) => ({ name: a.name, accountName: a.accountName })),
    locales,
    sinMatch,
  };
  fs.writeFileSync(LOC_FILE, JSON.stringify(data, null, 2));
  console.log('[GBP] Locations mapeadas:', Object.keys(locales).join(', ') || '(ninguna)');
  return data;
}

// ---- Normaliza una review v4 a fila de pp_resenas_google ----
function toRow(localId, rev) {
  const reply = rev.reviewReply || null;
  return {
    local_id: localId,
    origen: 'google',
    google_review_id: rev.name, // accounts/{a}/locations/{l}/reviews/{r}
    google_update_time: rev.updateTime || rev.createTime,
    fecha_resena: rev.createTime,
    estrellas: STARS[rev.starRating] || 5,
    cliente_nombre: (rev.reviewer && rev.reviewer.displayName) || null,
    texto_original: rev.comment || '',
    estado: reply ? 'respondida' : 'pendiente',
    respuesta_publicada: !!reply,
    ...(reply ? { respuesta_elegida: reply.comment || '', fecha_respuesta: reply.updateTime || null, fecha_publicacion: reply.updateTime || null } : {}),
  };
}

// Filas ya sincronizadas de un local (pagina de a 1000 — cap de PostgREST).
async function existingMap(localId) {
  const map = new Map();
  let from = 0;
  const STEP = 1000;
  for (;;) {
    const { data, error } = await supabaseAdmin.from(TABLE)
      .select('id, google_review_id, google_update_time')
      .eq('local_id', localId).eq('origen', 'google')
      .range(from, from + STEP - 1);
    if (error) throw new Error(error.message);
    (data || []).forEach((r) => map.set(r.google_review_id, r));
    if (!data || data.length < STEP) break;
    from += STEP;
  }
  return map;
}

// ---- Sincroniza un local. full=true trae TODO (backfill). ----
async function syncLocal(localId, v4Name, { full = false } = {}) {
  const existing = await existingMap(localId);
  let nuevas = 0, actualizadas = 0, vistas = 0;
  let pageToken = '';
  const inserts = [];

  paginas:
  do {
    const url = 'https://mybusiness.googleapis.com/v4/' + v4Name + '/reviews?pageSize=50' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const r = await gapi(url);
    const reviews = r.reviews || [];
    let cambiosEnPagina = 0;

    for (const rev of reviews) {
      vistas++;
      const prev = existing.get(rev.name);
      const updateTime = rev.updateTime || rev.createTime;
      if (!prev) {
        inserts.push(toRow(localId, rev));
        nuevas++; cambiosEnPagina++;
      } else if (prev.google_update_time !== updateTime &&
                 new Date(prev.google_update_time).getTime() !== new Date(updateTime).getTime()) {
        const { error } = await supabaseAdmin.from(TABLE).update(toRow(localId, rev)).eq('id', prev.id);
        if (error) throw new Error(error.message);
        actualizadas++; cambiosEnPagina++;
      }
    }

    // Incremental: v4 ordena por updateTime desc → si una página entera ya
    // estaba al día, lo que sigue es más viejo todavía. Cortar.
    if (!full && reviews.length && cambiosEnPagina === 0) break paginas;
    pageToken = r.nextPageToken || '';
  } while (pageToken);

  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await supabaseAdmin.from(TABLE).insert(inserts.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  // Alerta Telegram por reseñas malas NUEVAS y recientes (≤3★, últimos 14 días).
  // En el backfill histórico no dispara (las viejas no son accionables).
  if (!full) {
    const resenas = require('./google-reviews');
    const corte = Date.now() - 14 * 24 * 3600 * 1000;
    inserts
      .filter((r) => r.estrellas <= 3 && new Date(r.fecha_resena).getTime() > corte)
      .forEach((r) => {
        resenas.notificarTelegram({
          local_id: r.local_id, estrellas: r.estrellas,
          texto_original: r.texto_original || '(sin texto, solo estrellas)',
          cliente_nombre: r.cliente_nombre,
        }).catch((e) => console.error('[GBP] Telegram:', e.message));
      });
  }

  return { local_id: localId, nuevas, actualizadas, vistas };
}

// ---- Sincroniza todos los locales mapeados ----
async function sync({ full = false } = {}) {
  if (!conectado()) throw new Error('Google no conectado (autorizar desde el panel)');
  const m = loadLocations();
  if (!m || !m.locales || !Object.keys(m.locales).length) {
    throw new Error('Locales sin mapear: tocá «Detectar locales» primero');
  }
  const resultados = [];
  for (const [slug, loc] of Object.entries(m.locales)) {
    try {
      resultados.push(await syncLocal(slug, loc.v4, { full }));
    } catch (e) {
      console.error('[GBP] Sync ' + slug + ':', e.message);
      resultados.push({ local_id: slug, error: e.message });
    }
  }
  const tot = resultados.reduce((s, r) => s + (r.nuevas || 0), 0);
  console.log('[GBP] Sync ' + (full ? 'FULL' : 'incremental') + ': ' + tot + ' reseñas nuevas');
  return { full, resultados, cuando: new Date().toISOString() };
}

// ---- Publica una respuesta en Google (reviews.updateReply) ----
async function publicar(id) {
  const { data: row, error } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  if (!row.google_review_id) throw new Error('Esta reseña no vino de la API (se responde a mano en Google)');
  const comment = (row.respuesta_editada || row.respuesta_elegida || '').trim();
  if (!comment) throw new Error('No hay respuesta elegida para publicar');

  await gapi('https://mybusiness.googleapis.com/v4/' + row.google_review_id + '/reply', {
    method: 'PUT',
    body: JSON.stringify({ comment }),
  });

  const patch = {
    estado: 'respondida',
    respuesta_publicada: true,
    fecha_publicacion: new Date().toISOString(),
    fecha_respuesta: row.fecha_respuesta || new Date().toISOString(),
  };
  const { data: updated, error: e2 } = await supabaseAdmin.from(TABLE).update(patch).eq('id', id).select().single();
  if (e2) throw new Error(e2.message);
  return updated;
}

// ---- Estado para el panel ----
function estado() {
  const oauth = require('./google-oauth');
  const m = loadLocations();
  return {
    oauth_configurado: oauth.configurado(),
    conectado: oauth.conectado(),
    locales: (m && m.locales) || {},
    sin_match: (m && m.sinMatch) || [],
    mapeado_el: (m && m.generado) || null,
  };
}

module.exports = { descubrir, sync, publicar, estado, mapeado, loadLocations };
