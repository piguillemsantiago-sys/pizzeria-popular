// ============================================================
// lib/google-reviews.js — Gestión de reseñas de Google con IA.
// Portado desde habit-tracker (src/routes/resenas-google.js). Mismo proyecto
// Supabase; tabla pp_resenas_google. Fase 1 (semi-manual): se pega el texto de
// la reseña, Claude genera 3 variantes de respuesta con el tono Popular, el
// dueño elige/edita y copia a Google. Fase 2 (cuando Google apruebe la API):
// backfill + cron + publicación automática vía Business Profile API.
// ============================================================
const https = require('https');
const { supabaseAdmin } = require('./supabase');
const { loadRatings } = require('../google-places');

const TABLE = 'pp_resenas_google';
const MODELO = 'claude-haiku-4-5-20251001';

// Los 6 locales con perfil de Google que gestiona reseñas.
const LOCALES = {
  'luceros': 'Luceros',
  'playa-san-juan': 'Playa San Juan',
  'russafa': 'Russafa',
  'santa-clara': 'Santa Clara',
  'boadilla': 'Boadilla',
  'benidorm': 'Benidorm',
};

function localNombre(localId) {
  return LOCALES[localId] || localId;
}
function validateLocal(localId) {
  return Object.prototype.hasOwnProperty.call(LOCALES, localId);
}

const SYSTEM_PROMPT_POPULAR = (localNombre) => `Sos el responsable de atención al cliente de Pizzería Popular ${localNombre}, una pizzería argentina en España.

TONO:
- Cálido, cercano, argentino pero respetuoso con el público español
- Usá vos/tenés/pasá (no usted)
- Expresiones argentinas naturales: 'qué bueno que', 'la próxima', 'te invitamos a volver'
- NUNCA suene corporativo, plantilla, ni uses 'estimado cliente'
- Firma: 'El equipo de Popular ${localNombre}' o 'Abrazo del equipo de Popular ${localNombre}'

LONGITUD: 3-5 líneas máximo.

PERSONALIZACIÓN OBLIGATORIA:
- Si menciona producto específico (pizza, empanada, milanesa, café, postre), referirlo
- Si menciona personal, agradecer sin dar nombre pero reconocer
- Si es crítica: empatizar, disculpa concreta, ofrecer email mkt@grupoajax.es para diálogo privado

RESEÑAS NEGATIVAS (1-3 estrellas):
- NO ser defensivo, NO dar excusas largas
- Reconocer, disculpar, invitar al diálogo privado
- Mostrar ganas reales de mejorar

RESEÑAS POSITIVAS (4-5 estrellas):
- Agradecer genuino, no empalagoso
- Destacar algo específico de lo mencionado
- Invitar a volver con un gancho concreto

IDIOMA:
- Detectá el idioma de la reseña y respondé EN EL MISMO IDIOMA (español, inglés, francés)
- Si responde en inglés/francés, mantené el espíritu cercano adaptado culturalmente

RESTRICCIONES:
- Nunca prometas algo que no podés cumplir
- Nunca uses emojis salvo que la reseña los use
- Las 3 variantes deben tener apertura y cierre DIFERENTES entre sí

OUTPUT: Devolvé SOLO un JSON válido:
{"idioma_detectado": "es", "variantes": ["texto1", "texto2", "texto3"]}
Sin markdown, sin explicación, sin nada más.`;

// ---- Helpers ----

function httpsJSON(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Invalid JSON: ' + data.substring(0, 300))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function configurado() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Notifica por Telegram una reseña crítica (≤2★). Degrada silencioso si falta
// configuración (TELEGRAM_CHAT_ID_RESENAS no cargado todavía en el VPS).
async function notificarTelegram({ local_id, estrellas, texto_original, cliente_nombre }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_RESENAS;
  if (!token || !chatId) {
    console.log('[resenas] Telegram no configurado (falta TELEGRAM_CHAT_ID_RESENAS)');
    return { ok: false, reason: 'missing_config' };
  }

  const cliente = cliente_nombre ? cliente_nombre : 'Anónimo';
  const stars = '⭐'.repeat(estrellas) + '☆'.repeat(5 - estrellas);
  const preview = texto_original.length > 400 ? texto_original.slice(0, 400) + '…' : texto_original;
  const link = 'https://grupoajax.es/admin/';

  const text = [
    `🚨 *Reseña negativa* — Popular ${localNombre(local_id)}`,
    `${stars}  (${estrellas}/5)`,
    `👤 ${cliente}`,
    '',
    preview,
    '',
    `[Responder en el panel](${link})`,
  ].join('\n');

  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });

  try {
    const r = await httpsJSON({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body);
    return { ok: r.status === 200, response: r.body };
  } catch (e) {
    console.error('[resenas] Error enviando Telegram:', e.message);
    return { ok: false, error: e.message };
  }
}

// ---- A) Generar 3 variantes de respuesta con Claude ----
async function generar({ local_id, texto, estrellas, cliente_nombre }) {
  if (!validateLocal(local_id)) throw err(400, 'local_id inválido');
  if (!texto || typeof texto !== 'string' || !texto.trim()) throw err(400, 'texto requerido');
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) throw err(400, 'estrellas debe ser 1-5');
  if (!process.env.ANTHROPIC_API_KEY) throw err(500, 'ANTHROPIC_API_KEY no configurada');

  const userMsg = [
    `Reseña recibida en Pizzería Popular ${localNombre(local_id)}:`,
    `Estrellas: ${estrellas}/5`,
    cliente_nombre ? `Cliente: ${cliente_nombre}` : 'Cliente: (anónimo)',
    `Texto: """${texto.trim()}"""`,
    '',
    'Generá 3 variantes de respuesta siguiendo las instrucciones del system prompt. Devolvé solo el JSON.',
  ].join('\n');

  const payload = JSON.stringify({
    model: MODELO,
    max_tokens: 800,
    system: SYSTEM_PROMPT_POPULAR(localNombre(local_id)),
    messages: [{ role: 'user', content: userMsg }],
  });

  const r = await httpsJSON({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);

  if (r.body.error) throw err(500, r.body.error.message || 'Error Anthropic');

  const text = (r.body.content || []).map((c) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw err(500, 'Respuesta sin JSON');

  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch (e) { throw err(500, 'JSON inválido en la respuesta de la IA'); }

  const variantes = Array.isArray(parsed.variantes) ? parsed.variantes.slice(0, 3) : [];
  if (variantes.length !== 3) throw err(500, `Esperadas 3 variantes, llegaron ${variantes.length}`);

  return {
    variantes,
    idioma_detectado: parsed.idioma_detectado || 'es',
    modelo_usado: MODELO,
  };
}

// ---- B) Guardar la respuesta elegida ----
async function guardar(payload) {
  const {
    local_id, texto_original, estrellas, cliente_nombre,
    idioma_detectado, variantes_generadas, respuesta_elegida, respuesta_editada,
    modelo_usado, fecha_resena,
  } = payload || {};

  if (!validateLocal(local_id)) throw err(400, 'local_id inválido');
  if (!texto_original) throw err(400, 'texto_original requerido');
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) throw err(400, 'estrellas inválido');
  if (!respuesta_elegida) throw err(400, 'respuesta_elegida requerida');

  const fecha = fecha_resena ? new Date(fecha_resena) : new Date();
  if (isNaN(fecha.getTime())) throw err(400, 'fecha_resena inválida');

  const insert = {
    local_id,
    fecha_resena: fecha.toISOString(),
    estrellas,
    cliente_nombre: cliente_nombre || null,
    texto_original,
    idioma_detectado: idioma_detectado || null,
    variantes_generadas: variantes_generadas || null,
    respuesta_elegida,
    respuesta_editada: respuesta_editada || null,
    estado: 'respondida',
    modelo_usado: modelo_usado || MODELO,
    fecha_respuesta: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.from(TABLE).insert(insert).select().single();
  if (error) throw err(500, error.message);

  if (estrellas <= 2) {
    notificarTelegram({ local_id, estrellas, texto_original, cliente_nombre })
      .catch((e) => console.error('[resenas] Telegram fail:', e.message));
  }

  return data;
}

// ---- C) Histórico con filtros ----
async function historial(query = {}) {
  const { local_id, estrellas, desde, hasta, estado } = query;
  const limit = Math.min(parseInt(query.limit, 10) || 100, 500);
  const offset = parseInt(query.offset, 10) || 0;

  let q = supabaseAdmin.from(TABLE).select('*', { count: 'exact' });
  if (local_id && validateLocal(local_id)) q = q.eq('local_id', local_id);
  if (estrellas) q = q.eq('estrellas', parseInt(estrellas, 10));
  if (estado) q = q.eq('estado', estado);
  if (desde) q = q.gte('fecha_resena', desde);
  if (hasta) q = q.lte('fecha_resena', hasta.length === 10 ? hasta + 'T23:59:59' : hasta);

  const { data, error, count } = await q
    .order('fecha_resena', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw err(500, error.message);
  return { items: data || [], total: count || 0, limit, offset };
}

// ---- D) Métricas del período (default: mes en curso) ----
async function metricas(query = {}) {
  const { local_id } = query;
  let desde = query.desde ? new Date(query.desde) : null;
  if (!desde || isNaN(desde.getTime())) {
    desde = new Date();
    desde.setDate(1);
    desde.setHours(0, 0, 0, 0);
  }

  let q = supabaseAdmin.from(TABLE)
    .select('estrellas, estado, fecha_resena, fecha_respuesta')
    .gte('fecha_resena', desde.toISOString())
    .limit(10000);
  if (query.hasta) {
    const h = new Date(query.hasta);
    if (!isNaN(h.getTime())) { h.setHours(23, 59, 59, 999); q = q.lte('fecha_resena', h.toISOString()); }
  }
  if (local_id && validateLocal(local_id)) q = q.eq('local_id', local_id);

  const { data, error } = await q;
  if (error) throw err(500, error.message);

  const total = data.length;
  const respondidas = data.filter((r) => r.estado === 'respondida').length;
  const pendientes = data.filter((r) => r.estado === 'pendiente').length;
  const sumEstrellas = data.reduce((s, r) => s + r.estrellas, 0);
  const media = total > 0 ? +(sumEstrellas / total).toFixed(2) : 0;

  const tiempos = data
    .filter((r) => r.fecha_respuesta && r.fecha_resena)
    .map((r) => (new Date(r.fecha_respuesta) - new Date(r.fecha_resena)) / 3600000);
  const tiempoMedio = tiempos.length > 0
    ? +(tiempos.reduce((a, b) => a + b, 0) / tiempos.length).toFixed(1)
    : 0;

  const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  data.forEach((r) => { distribucion[r.estrellas] = (distribucion[r.estrellas] || 0) + 1; });

  return {
    total_mes: total,
    respondidas_mes: respondidas,
    pendientes_mes: pendientes,
    tasa_respuesta: total > 0 ? Math.round((respondidas / total) * 100) : null,
    puntuacion_media_mes: media,
    tiempo_medio_respuesta_horas: tiempoMedio,
    distribucion_estrellas: distribucion,
  };
}

// ---- D1b) Salud por local — exactos calculados del histórico sincronizado ----
// Mientras no haya backfill de la GBP API devuelve exacto:false por local y el
// panel sigue mostrando la estimación de siempre. Con histórico: promedio real
// con decimales, distribución por estrella, cuántas 5★ faltan para subir 0,1
// (matemático, no estimado), tasa de respuesta y evolución mensual.
let _saludCache = { hasta: 0, data: null };
async function salud(query = {}) {
  // Rango opcional: con desde/hasta las tarjetas muestran SOLO ese período
  // (media, total, tasa, evolución del rango). El "camino a X★" solo tiene
  // sentido sobre el histórico completo → en modo rango no se calcula.
  const desde = query.desde || null;
  const hasta = query.hasta ? query.hasta + 'T23:59:59' : null;
  const conRango = !!(desde || hasta);
  if (!conRango && _saludCache.data && Date.now() < _saludCache.hasta) return _saludCache.data;

  // Trae TODO el histórico sincronizado paginando (cap de 1000 de PostgREST).
  const rows = [];
  const STEP = 1000;
  for (let from = 0; ; from += STEP) {
    let q = supabaseAdmin.from(TABLE)
      .select('local_id, estrellas, estado, fecha_resena, respuesta_publicada')
      .eq('origen', 'google');
    if (desde) q = q.gte('fecha_resena', desde);
    if (hasta) q = q.lte('fecha_resena', hasta);
    const { data, error } = await q.range(from, from + STEP - 1);
    if (error) throw err(500, error.message);
    rows.push(...(data || []));
    if (!data || data.length < STEP) break;
  }

  const porLocal = {};
  for (const slug of Object.keys(LOCALES)) porLocal[slug] = [];
  rows.forEach((r) => { if (porLocal[r.local_id]) porLocal[r.local_id].push(r); });

  const out = {};
  for (const [slug, list] of Object.entries(porLocal)) {
    if (!list.length) { out[slug] = { exacto: false }; continue; }
    const n = list.length;
    const suma = list.reduce((s, r) => s + r.estrellas, 0);
    const media = suma / n;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    list.forEach((r) => { dist[r.estrellas]++; });
    const respondidas = list.filter((r) => r.estado === 'respondida').length;

    // Próximo décimo visible. Google muestra round(media,1); aparece el décimo
    // siguiente cuando la media real cruza target-0.05.
    let faltan = null, target = null;
    if (!conRango && media < 4.85) {
      target = Math.floor(media * 10 + 1) / 10;
      const umbral = target - 0.05;
      faltan = Math.max(1, Math.ceil((umbral * n - suma) / (5 - umbral)));
    }

    // Evolución: media por mes, últimos 12 meses con datos.
    const meses = {};
    list.forEach((r) => {
      const m = String(r.fecha_resena).slice(0, 7);
      (meses[m] = meses[m] || { suma: 0, n: 0 });
      meses[m].suma += r.estrellas; meses[m].n++;
    });
    const evolucion = Object.keys(meses).sort().slice(-12)
      .map((m) => ({ mes: m, media: +(meses[m].suma / meses[m].n).toFixed(2), n: meses[m].n }));

    out[slug] = {
      exacto: true,
      total: n,
      media: +media.toFixed(3),
      distribucion: dist,
      faltan_5: faltan,
      target,
      tasa_respuesta: Math.round((respondidas / n) * 100),
      evolucion,
    };
  }

  const data = { locales: out, rango: conRango, generado: new Date().toISOString() };
  if (!conRango) _saludCache = { hasta: Date.now() + 10 * 60 * 1000, data };
  return data;
}

// ---- D2) Actualizar una reseña existente (editar/regenerar respuesta) ----
async function actualizar(id, payload = {}) {
  if (!id) throw err(400, 'id requerido');
  const allowed = [
    'respuesta_elegida', 'respuesta_editada', 'estado',
    'variantes_generadas', 'idioma_detectado', 'modelo_usado',
  ];
  const patch = {};
  for (const k of allowed) if (k in payload) patch[k] = payload[k];
  if (!Object.keys(patch).length) throw err(400, 'nada para actualizar');
  if (patch.respuesta_elegida || patch.respuesta_editada) {
    patch.estado = patch.estado || 'respondida';
    patch.fecha_respuesta = new Date().toISOString();
  }
  const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw err(500, error.message);
  return data;
}

// ---- E) Conteo de pendientes (badge) ----
// Solo últimos 30 días: el backfill histórico de la GBP API trae reseñas
// viejas sin responder que no tiene sentido perseguir una por una.
async function pendientesCount() {
  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
    .gte('fecha_resena', desde);
  if (error) throw err(500, error.message);
  return { pendientes: count || 0 };
}

// ---- F) "Lo que dice la gente" — positivos/negativos del texto de las reseñas ----
// OJO: la API pública trae ~5 reseñas por local, casi todas 5★. Los positivos
// salen bien; los negativos casi no aparecen (se completan cuando entre la GBP
// API, o cargando a mano las reseñas de 1-2★). Se cachea por día para no
// llamar a Claude en cada carga del panel.
let _vozCache = { dia: null, data: null };
async function vozCliente() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (_vozCache.dia === hoy && _vozCache.data) return _vozCache.data;
  if (!process.env.ANTHROPIC_API_KEY) throw err(500, 'ANTHROPIC_API_KEY no configurada');

  const ratings = loadRatings();
  const bloques = [];
  let total = 0;
  ((ratings && ratings.locals) || []).forEach((l) => {
    const revs = (l.topReviews || []).slice(0, 5)
      .map((r) => ({ rating: (r && r.rating) || 5, text: String((r && r.text) || '').trim().replace(/\s+/g, ' ') }))
      .filter((r) => r.text);
    if (!revs.length) return;
    total += revs.length;
    bloques.push('### ' + l.name + '\n' + revs.map((r) => '- ' + r.rating + '★: ' + r.text.slice(0, 320)).join('\n'));
  });

  if (!total) {
    const empty = { positivo: [], negativo: [], porLocal: [], muestra: 0, sinDatos: true, generado: hoy };
    _vozCache = { dia: hoy, data: empty };
    return empty;
  }

  const system = `Sos analista de Pizzería Popular (pizzería argentina al horno de leña en España). Te paso una MUESTRA del texto de reseñas de Google, AGRUPADAS POR LOCAL. Resumí "lo que dice la gente", a nivel global y por cada local.
Devolvé SOLO un JSON válido (sin texto extra, sin markdown):
{"global":{"positivo":["hasta 3"],"negativo":["hasta 3"]},"porLocal":[{"local":"NOMBRE EXACTO DEL LOCAL","positivo":["hasta 3 concretos de ESE local"],"negativo":["hasta 2, SOLO si aparecen"]}]}
Reglas: usá SOLO el texto provisto. La muestra es chica y casi toda 5★, así que es NORMAL que "negativo" quede vacío []: NO inventes quejas. Incluí un objeto en porLocal por CADA local que tenga reseñas, usando su nombre EXACTO. Frases cortas, español rioplatense, sin humo.`;

  const payload = JSON.stringify({
    model: MODELO,
    max_tokens: 1400,
    system,
    messages: [{ role: 'user', content: 'Reseñas por local:\n\n' + bloques.join('\n\n') }],
  });

  const r = await httpsJSON({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);

  if (r.body.error) throw err(500, r.body.error.message || 'Error Anthropic');
  const text = (r.body.content || []).map((c) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw err(500, 'Respuesta sin JSON');
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) { throw err(500, 'JSON inválido de la IA'); }

  const g = parsed.global || {};
  const data = {
    positivo: Array.isArray(g.positivo) ? g.positivo.slice(0, 3) : [],
    negativo: Array.isArray(g.negativo) ? g.negativo.slice(0, 3) : [],
    porLocal: Array.isArray(parsed.porLocal) ? parsed.porLocal.map((x) => ({
      local: String(x.local || ''),
      positivo: Array.isArray(x.positivo) ? x.positivo.slice(0, 3) : [],
      negativo: Array.isArray(x.negativo) ? x.negativo.slice(0, 2) : [],
    })) : [],
    muestra: total,
    generado: hoy,
  };
  _vozCache = { dia: hoy, data };
  return data;
}

// ---- G) Insights IA — camareros, platos, temas repetidos e idiomas ----
// Analiza el TEXTO de las reseñas guardadas en la BD (con el backfill de la
// GBP API son miles; antes, las pocas de Fase 1 + la muestra pública). Se
// cachea por día+filtros para no llamar a Claude en cada carga.
const _insightsCache = new Map();

async function insights(query = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw err(500, 'ANTHROPIC_API_KEY no configurada');
  const { local_id, desde, hasta } = query;
  const hoy = new Date().toISOString().slice(0, 10);
  const key = [hoy, local_id || '', desde || '', hasta || ''].join('|');
  if (_insightsCache.has(key)) return _insightsCache.get(key);

  // Reseñas con texto de la BD (las más recientes primero, tope 1500 — cubre
  // cualquier local entero). PostgREST corta en 1000 por request → paginar.
  const MUESTRA_MAX = 1500;
  const data = [];
  const PAGE = 1000;
  for (let from = 0; from < MUESTRA_MAX; from += PAGE) {
    let q = supabaseAdmin.from(TABLE)
      .select('local_id, estrellas, texto_original')
      .neq('texto_original', '')
      .not('texto_original', 'is', null)
      .order('fecha_resena', { ascending: false })
      .range(from, Math.min(from + PAGE, MUESTRA_MAX) - 1);
    if (local_id && validateLocal(local_id)) q = q.eq('local_id', local_id);
    if (desde) q = q.gte('fecha_resena', desde);
    if (hasta) {
      const h = new Date(hasta);
      if (!isNaN(h.getTime())) { h.setHours(23, 59, 59, 999); q = q.lte('fecha_resena', h.toISOString()); }
    }
    const { data: page, error } = await q;
    if (error) throw err(500, error.message);
    data.push(...(page || []));
    if (!page || page.length < Math.min(PAGE, MUESTRA_MAX - from)) break;
  }
  let textos = data.map((r) => ({
    local: localNombre(r.local_id), estrellas: r.estrellas,
    texto: String(r.texto_original).trim().replace(/\s+/g, ' ').slice(0, 300),
  }));

  // Pre-backfill la BD tiene poco: sumar la muestra pública de la Places API.
  // SOLO sin rango de fechas: la muestra pública es de toda la vida y
  // contaminaría un período acotado (el usuario espera datos del rango exacto).
  if (textos.length < 30 && !desde && !hasta) {
    const ratings = loadRatings();
    ((ratings && ratings.locals) || []).forEach((l) => {
      if (local_id && l.slug !== local_id) return;
      (l.topReviews || []).forEach((r) => {
        const t = String((r && r.text) || '').trim().replace(/\s+/g, ' ');
        if (t) textos.push({ local: l.name, estrellas: (r && r.rating) || 5, texto: t.slice(0, 300) });
      });
    });
  }

  if (!textos.length) {
    const empty = { sinDatos: true, muestra: 0, generado: hoy };
    _insightsCache.set(key, empty);
    return empty;
  }
  textos = textos.slice(0, MUESTRA_MAX);

  const system = `Sos analista de reputación de Pizzería Popular (pizzería argentina al horno de leña en España). Te paso reseñas de Google con formato "LOCAL | ★N | texto". Extraé SOLO lo que está en el texto — nada inventado.
Devolvé SOLO un JSON válido (sin markdown, sin texto extra):
{"positivo":[{"tema":"frase corta","veces":N}],"negativo":[{"tema":"frase corta","veces":N}],"empleados":[{"nombre":"Nombre","menciones":N,"nota":"por qué lo mencionan"}],"platos":[{"plato":"nombre del plato","menciones":N}],"idiomas":{"es":N,"en":N,"fr":N,"otros":N}}
Reglas:
- positivo/negativo: hasta 6 temas cada uno, los que MÁS se repiten, con el conteo real de reseñas que los mencionan. Si no hay quejas, negativo=[] (NO inventar).
- empleados: SOLO nombres propios de personas mencionadas en el texto (no "el camarero"). Hasta 8, ordenados por menciones.
- empleados, UNIFICAR variantes: el mismo nombre escrito distinto es LA MISMA persona y se cuenta junto — con/sin tilde (Ines=Inés), errores de tipeo o letras cambiadas (Sergi/Serghio=Sergio, Inez/Ynes=Inés, Kata/Katta=Cata, c↔k, s↔z, i↔y), apodo/diminutivo vs nombre completo (Cata=Catalina, Agus=Agustina, Nacho=Ignacio). Usá como etiqueta la forma más frecuente y sumá TODAS las menciones.
- platos: platos/productos concretos nombrados (fugazzeta, milanesa, tiramisú...). Hasta 8, por menciones.
- idiomas: contá en qué idioma está escrita cada reseña.
- Frases cortas, español rioplatense, sin humo.`;

  const payload = JSON.stringify({
    model: MODELO,
    max_tokens: 2000,
    system,
    messages: [{
      role: 'user',
      content: 'Reseñas (' + textos.length + '):\n' +
        textos.map((t) => t.local + ' | ★' + t.estrellas + ' | ' + t.texto).join('\n'),
    }],
  });

  const r = await httpsJSON({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, payload);

  if (r.body.error) throw err(500, r.body.error.message || 'Error Anthropic');
  const text = (r.body.content || []).map((c) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw err(500, 'Respuesta sin JSON');
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) { throw err(500, 'JSON inválido de la IA'); }

  const lim = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  const result = {
    positivo: lim(parsed.positivo, 6),
    negativo: lim(parsed.negativo, 6),
    empleados: lim(parsed.empleados, 8),
    platos: lim(parsed.platos, 8),
    idiomas: parsed.idiomas || {},
    muestra: textos.length,
    generado: hoy,
  };
  if (_insightsCache.size > 40) _insightsCache.clear();
  _insightsCache.set(key, result);
  return result;
}

module.exports = {
  LOCALES,
  localNombre,
  validateLocal,
  configurado,
  generar,
  guardar,
  historial,
  metricas,
  salud,
  insights,
  actualizar,
  pendientesCount,
  notificarTelegram,
  vozCliente,
};
