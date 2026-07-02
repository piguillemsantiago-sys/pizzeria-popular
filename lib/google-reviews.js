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
  if (hasta) q = q.lte('fecha_resena', hasta);

  const { data, error, count } = await q
    .order('fecha_resena', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw err(500, error.message);
  return { items: data || [], total: count || 0, limit, offset };
}

// ---- D) Métricas del mes ----
async function metricas(query = {}) {
  const { local_id } = query;
  const desde = new Date();
  desde.setDate(1);
  desde.setHours(0, 0, 0, 0);

  let q = supabaseAdmin.from(TABLE)
    .select('estrellas, estado, fecha_resena, fecha_respuesta')
    .gte('fecha_resena', desde.toISOString());
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
    puntuacion_media_mes: media,
    tiempo_medio_respuesta_horas: tiempoMedio,
    distribucion_estrellas: distribucion,
  };
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
async function pendientesCount() {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente');
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

module.exports = {
  LOCALES,
  localNombre,
  validateLocal,
  configurado,
  generar,
  guardar,
  historial,
  metricas,
  actualizar,
  pendientesCount,
  notificarTelegram,
  vozCliente,
};
