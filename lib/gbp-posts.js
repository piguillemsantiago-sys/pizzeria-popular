// ============================================================
// lib/gbp-posts.js — Novedades de Google (localPosts v4), supervisadas.
// Un cron semanal genera UN borrador por local (promo activa que aplique
// o contenido de la casa); el dueño edita/aprueba en el panel y recién
// ahí se publica en la ficha. Nada sale solo.
// Boadilla queda fuera (está fuera del frente de fichas).
// ============================================================
const { getAccessToken } = require('./google-oauth');
const gbp = require('./gbp');
const { supabaseAdmin } = require('./supabase');

const TABLE = 'pp_gbp_posts';
const MODELO = 'claude-haiku-4-5-20251001';
const LOCALES = ['luceros', 'playa-san-juan', 'russafa', 'santa-clara', 'benidorm'];
const NOMBRES = {
  luceros: 'Luceros (Alicante)',
  'playa-san-juan': 'Playa San Juan (Alicante)',
  russafa: 'Russafa (Valencia)',
  'santa-clara': 'Santa Clara (Valencia)',
  benidorm: 'Benidorm (Alicante)',
};
const BASE = 'https://grupoajax.es';
const PROMOS_URL = BASE + '/promos/';

// Fotos reales ya hosteadas en la web (descripciones verificadas a ojo).
const FOTOS_GENERICAS = [
  { url: BASE + '/images/extracted/producto-pizza-argentina.jpg', desc: 'pizza de muzzarella con jamón, morrones y aceitunas sobre tabla de madera' },
  { url: BASE + '/images/extracted/producto-milanesa.jpg', desc: 'milanesa fugazzeta (cebolla y queso) con papas fritas' },
  { url: BASE + '/images/extracted/producto-milanesa-ternera.jpg', desc: 'milanesa a caballo con huevos fritos y papas fritas' },
  { url: BASE + '/images/blog/cta-horno.jpg', desc: 'pizza cocinándose dentro del horno' },
  { url: BASE + '/images/bg-promos.jpg', desc: 'mesa con dos Spritz Popular y pizza de queso recién salida' },
  { url: BASE + '/images/bg-carta.jpg', desc: 'pizzero revoleando la masa en el aire' },
];
const FOTOS_LOCAL = {
  benidorm: [
    { url: BASE + '/images/blog/benidorm/benidorm-interior-1.jpg', desc: 'salón del local de Benidorm con ventanal a la playa' },
    { url: BASE + '/images/blog/benidorm/benidorm-hero.jpg', desc: 'clientas en la terraza de Benidorm al atardecer frente al mar' },
  ],
};
const DATOS_LOCAL = {
  benidorm: 'El local tiene vista directa a la playa de Benidorm.',
};

function err(status, message) { const e = new Error(message); e.status = status; return e; }

function fotosDe(localId) {
  return [...(FOTOS_LOCAL[localId] || []), ...FOTOS_GENERICAS];
}

// ---- IA: un borrador para un local ----
async function generarUno(localId, promos, ultimos) {
  if (!process.env.ANTHROPIC_API_KEY) throw err(500, 'ANTHROPIC_API_KEY no configurada');
  const fotos = fotosDe(localId);

  const system = [
    'Sos el redactor de Pizzería Popular: pizza al horno de leña y cocina argentina en España.',
    'Escribís UN post de Google (Novedades) para la ficha de un local. Lo lee gente decidiendo dónde comer.',
    'REGLAS ESTRICTAS:',
    '- HONESTIDAD ABSOLUTA: solo podés afirmar lo que figura en DATOS o PROMOS. Prohibido inventar precios, descuentos, horarios, eventos o servicios.',
    '- Si una PROMO aplica a este local (leé sus condiciones con cuidado), el post es sobre esa promo → tipo "promo". Si ninguna aplica, contenido de la casa (horno de leña, masa madre, empanadas criollas, milanesas, el local) → tipo "evergreen".',
    '- NO repitas el tema de los últimos posts listados.',
    '- Tono cercano y argentino suave (vení, probá), sin exagerar. Máximo 1 emoji. Sin hashtags, sin mayúsculas gritadas.',
    '- Largo del resumen: 300 a 600 caracteres.',
    '- Elegí UNA foto de FOTOS cuya descripción acompañe el texto (no menciones la foto en el texto).',
    'Respondé SOLO este JSON: {"tipo":"promo"|"evergreen","tema":"2-4 palabras","resumen":"...","foto_url":"..."}',
  ].join('\n');

  const user = [
    'LOCAL: Pizzería Popular ' + NOMBRES[localId],
    'DATOS: ' + (DATOS_LOCAL[localId] || '(sin datos extra; usar solo lo genérico de la casa)'),
    '',
    'PROMOS activas hoy (título — detalle — condiciones):',
    promos.length
      ? promos.map((p) => `- ${p.titulo} — ${[p.subtitulo, p.descripcion].filter(Boolean).join('. ')} — Condiciones: ${p.condiciones || 'sin condiciones'}`).join('\n')
      : '(ninguna)',
    '',
    'Últimos posts de este local (NO repetir tema):',
    ultimos.length ? ultimos.map((u) => `- [${u.tema || 'sin tema'}] ${String(u.resumen).slice(0, 90)}…`).join('\n') : '(ninguno)',
    '',
    'FOTOS disponibles:',
    fotos.map((f) => `- ${f.url} → ${f.desc}`).join('\n'),
    '',
    'Generá el post. Devolvé solo el JSON.',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODELO, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
  });
  const body = await r.json();
  if (body.error) throw err(500, body.error.message || 'Error Anthropic');
  const text = (body.content || []).map((c) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw err(500, 'Respuesta IA sin JSON');
  const p = JSON.parse(match[0]);
  if (!p.resumen || String(p.resumen).length < 50) throw err(500, 'Resumen IA inválido');

  const fotoOk = fotos.some((f) => f.url === p.foto_url);
  const esPromo = p.tipo === 'promo';
  return {
    local_id: localId,
    tipo: esPromo ? 'promo' : 'evergreen',
    tema: p.tema || null,
    resumen: String(p.resumen).trim(),
    imagen_url: fotoOk ? p.foto_url : fotos[0].url,
    cta: esPromo ? 'LEARN_MORE' : 'CALL',
    cta_url: esPromo ? PROMOS_URL : null,
    estado: 'pendiente',
  };
}

// ---- Genera borradores para los locales que no tengan nada esta semana ----
async function generarBorradores() {
  const { data: promosData, error: e1 } = await supabaseAdmin
    .from('ppweb_promos').select('titulo, subtitulo, descripcion, condiciones')
    .eq('activa', true).eq('idioma', 'es');
  if (e1) throw err(500, e1.message);
  const promos = promosData || [];

  const desde = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
  const resultados = [];
  for (const localId of LOCALES) {
    try {
      // Saltar si ya hay un pendiente, o un publicado hace menos de 6 días.
      const { data: pend } = await supabaseAdmin.from(TABLE).select('id')
        .eq('local_id', localId).eq('estado', 'pendiente').limit(1);
      if (pend && pend.length) { resultados.push({ local_id: localId, skip: 'ya hay borrador pendiente' }); continue; }
      const { data: rec } = await supabaseAdmin.from(TABLE).select('id')
        .eq('local_id', localId).eq('estado', 'publicado').gte('publicado_en', desde).limit(1);
      if (rec && rec.length) { resultados.push({ local_id: localId, skip: 'ya publicó esta semana' }); continue; }

      const { data: ultimos } = await supabaseAdmin.from(TABLE).select('tema, resumen')
        .eq('local_id', localId).neq('estado', 'descartado')
        .order('creado_en', { ascending: false }).limit(5);

      const borrador = await generarUno(localId, promos, ultimos || []);
      const { data: row, error: e2 } = await supabaseAdmin.from(TABLE).insert(borrador).select().single();
      if (e2) throw err(500, e2.message);
      resultados.push({ local_id: localId, id: row.id, tema: row.tema });
    } catch (e) {
      console.error('[GBP Posts] ' + localId + ':', e.message);
      resultados.push({ local_id: localId, error: e.message });
    }
  }
  return { resultados, cuando: new Date().toISOString() };
}

// ---- Publica un borrador aprobado en la ficha ----
async function publicar(id, resumenEditado) {
  const { data: row, error } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).single();
  if (error) throw err(404, error.message);
  if (row.estado !== 'pendiente') throw err(400, 'Este borrador ya fue ' + row.estado);

  const m = gbp.loadLocations();
  const loc = m && m.locales && m.locales[row.local_id];
  if (!loc) throw err(500, 'Local sin mapear en Google (tocá «Detectar locales»)');

  const resumen = String(resumenEditado || row.resumen).trim();
  if (!resumen) throw err(400, 'El texto está vacío');

  const body = {
    languageCode: 'es',
    topicType: 'STANDARD',
    summary: resumen,
    callToAction: row.cta === 'LEARN_MORE' && row.cta_url
      ? { actionType: 'LEARN_MORE', url: row.cta_url }
      : { actionType: 'CALL' },
  };
  if (row.imagen_url) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: row.imagen_url }];

  const token = await getAccessToken();
  const r = await fetch('https://mybusiness.googleapis.com/v4/' + loc.v4 + '/localPosts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw err(r.status, (d.error && d.error.message) || 'Error de Google al publicar');

  const patch = {
    resumen,
    estado: 'publicado',
    google_post_name: d.name || null,
    search_url: d.searchUrl || null,
    publicado_en: new Date().toISOString(),
  };
  const { data: updated, error: e2 } = await supabaseAdmin.from(TABLE).update(patch).eq('id', id).select().single();
  if (e2) throw err(500, e2.message);
  return updated;
}

// ---- Listado para el panel ----
async function listar() {
  const { data: pendientes, error: e1 } = await supabaseAdmin.from(TABLE).select('*')
    .eq('estado', 'pendiente').order('creado_en', { ascending: true });
  if (e1) throw err(500, e1.message);
  const { data: publicados, error: e2 } = await supabaseAdmin.from(TABLE).select('*')
    .eq('estado', 'publicado').order('publicado_en', { ascending: false }).limit(10);
  if (e2) throw err(500, e2.message);
  return { pendientes: pendientes || [], publicados: publicados || [] };
}

// ---- Editar texto o descartar ----
async function guardar(id, { resumen, estado }) {
  const patch = {};
  if (typeof resumen === 'string' && resumen.trim()) patch.resumen = resumen.trim();
  if (estado === 'descartado') patch.estado = 'descartado';
  if (!Object.keys(patch).length) throw err(400, 'Nada para guardar');
  const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw err(500, error.message);
  return data;
}

module.exports = { generarBorradores, publicar, listar, guardar };
