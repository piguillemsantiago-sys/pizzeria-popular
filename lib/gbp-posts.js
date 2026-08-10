// ============================================================
// lib/gbp-posts.js — Novedades de Google (localPosts v4), supervisadas.
// Un cron semanal genera UN borrador por local; el dueño edita/aprueba en el
// panel y recién ahí se publica. Nada sale solo.
//
// Cada local tiene una FRANJA: el momento del día que quiere vender y el
// ángulo del copy que le corresponde.
//   - Playa San Juan → MEDIODÍA (terraza o para llevar a la playa), 12:00.
//   - Luceros        → CENA, y cada 3ª semana DESAYUNO/BRUNCH (es el único
//                      local con perfil cafetería y "brunch" es la búsqueda
//                      más fuerte de las fichas).
//   - Benidorm       → CENA, copy bilingüe ES+EN (público turista).
// El post se programa a la hora de España (el server va en UTC), así que la
// franja se calcula contra Europe/Madrid y no se corre con el cambio de hora.
//
// REGLA DURA: en los posts no van promos, descuentos ni ofertas. Nunca.
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
const TZ = 'Europe/Madrid';
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Fotos reales ya hosteadas (descripciones verificadas a ojo) ----
const F = {
  pizza: { url: BASE + '/images/extracted/producto-pizza-argentina.jpg', desc: 'pizza de muzzarella con jamón, morrones y aceitunas sobre tabla de madera' },
  milanesa: { url: BASE + '/images/extracted/producto-milanesa.jpg', desc: 'milanesa fugazzeta (cebolla y queso) con papas fritas' },
  milaTernera: { url: BASE + '/images/extracted/producto-milanesa-ternera.jpg', desc: 'milanesa a caballo con huevos fritos y papas fritas' },
  horno: { url: BASE + '/images/blog/cta-horno.jpg', desc: 'pizza cocinándose dentro del horno de leña' },
  mesa: { url: BASE + '/images/bg-promos.jpg', desc: 'mesa con dos Spritz Popular y pizza de queso recién salida' },
  pizzero: { url: BASE + '/images/bg-carta.jpg', desc: 'pizzero revoleando la masa en el aire' },
  empanada: { url: BASE + '/images/productos/empanada-carne.jpg', desc: 'empanada criolla recién frita con chimichurri, en plato blanco' },
  ensalada: { url: BASE + '/images/productos/ensalada-popular.jpg', desc: 'ensalada fresca con tomate asado, queso, aceitunas y verduras a la parrilla' },
  bndSalon: { url: BASE + '/images/blog/benidorm/benidorm-interior-2.jpg', desc: 'salón de Benidorm con ventanal al mar' },
  bndTerraza: { url: BASE + '/images/blog/benidorm/benidorm-hero.jpg', desc: 'clientas en la terraza de Benidorm frente al mar' },
};

// ---- Ángulos de copy ----
// `brief` es lo único que cambia la cabeza del redactor; el resto de las
// reglas (honestidad, nada de promos, nada de "masa madre") son fijas.
const ANGULOS = {
  mediodia: {
    tema: 'mediodía',
    brief: [
      'Es un post de MEDIODÍA: lo lee alguien que a las 12 está decidiendo dónde almorzar.',
      'Doble salida, y las DOS tienen que aparecer: comer en la terraza del local, o pedirlo para llevar y comérselo en la playa (la playa de San Juan está a pasos).',
      'Para llevar, lo que viaja bien: la pizza en su caja y las empanadas criollas.',
      'Las Empanadas de Carne son EL producto más pedido de este local: tienen que ser las protagonistas del texto.',
      'Ligero y de día: nada de horno de noche ni de sobremesa larga.',
    ].join('\n'),
    fotos: [F.empanada, F.ensalada, F.pizza, F.mesa],
  },
  cena: {
    tema: 'cena',
    brief: [
      'Es un post de CENA: lo lee alguien decidiendo dónde cenar esta noche.',
      'El centro es el horno de leña y la pizza saliendo del horno.',
      'Tono de noche: mesa larga, amigos o familia, sin apuro.',
    ].join('\n'),
    fotos: [F.horno, F.pizza, F.pizzero, F.mesa],
  },
  brunch: {
    tema: 'desayuno y brunch',
    brief: [
      'Es un post de DESAYUNO / BRUNCH: lo lee alguien buscando dónde desayunar o hacer brunch por la mañana.',
      'OBLIGATORIO: el texto tiene que usar las palabras "desayuno" y "brunch", las dos, escritas tal cual.',
      'El producto ancla es el Combo Café + Tostada, que es lo más pedido de la mañana en este local.',
      'Es el único local de la casa con barra de cafetería: se abre temprano y se puede desayunar en la terraza sobre la plaza.',
      'NO hables de pizza ni del horno de leña acá: este post es de mañana.',
    ].join('\n'),
    // Todavía no hay foto real de café + tostada (pedida al local).
    // Sin foto es preferible a poner una pizza en un post de desayuno.
    fotos: [],
  },
  cenaEn: {
    tema: 'cena (ES+EN)',
    brief: [
      'Es un post de CENA para un local de Benidorm, en zona de turismo internacional.',
      'BILINGÜE OBLIGATORIO: primero el texto en español, después una línea en blanco, después el MISMO mensaje en inglés. Las dos versiones dicen lo mismo.',
      'El centro es el horno de leña y la pizza; el local tiene ventanal y terraza con vista directa al mar.',
      'En inglés, natural y simple (lo lee un turista): "wood-fired pizza", "Argentinian kitchen". Nada de traducir literal el voseo.',
    ].join('\n'),
    fotos: [F.bndSalon, F.bndTerraza, F.horno, F.pizza],
  },
  casa: {
    tema: 'contenido de la casa',
    brief: [
      'Post de contenido de la casa: horno de leña, masa artesanal, empanadas criollas, milanesas, el ambiente del local.',
      'Elegí UN solo tema y contalo bien; no hagas una lista de todo lo que hay.',
    ].join('\n'),
    fotos: [F.pizza, F.horno, F.milanesa, F.milaTernera, F.mesa, F.pizzero],
  },
};

// ---- Franja por local ----
// dia: 0=domingo … 6=sábado (hora de España). rotacion: se elige por nº de semana.
const FRANJAS = {
  'playa-san-juan': { dia: 4, hora: 12, rotacion: ['mediodia'] },
  luceros: { dia: 4, hora: 20, rotacion: ['cena', 'cena', 'brunch'] },
  benidorm: { dia: 4, hora: 20, rotacion: ['cenaEn'] },
  russafa: { dia: 4, hora: 20, rotacion: ['cena', 'casa'] },
  'santa-clara': { dia: 4, hora: 20, rotacion: ['cena', 'casa'] },
};
const FRANJA_DEFAULT = { dia: 4, hora: 20, rotacion: ['casa'] };

function err(status, message) { const e = new Error(message); e.status = status; return e; }

// La IA a veces mete saltos de línea CRUDOS dentro de un string —pasa seguido
// con el post bilingüe, que separa español e inglés con una línea en blanco— y
// eso es JSON inválido. Se escapan y se reintenta antes de dar el error.
function parseJsonIA(texto) {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw err(500, 'Respuesta IA sin JSON');
  try { return JSON.parse(m[0]); } catch (_) { /* se intenta reparar abajo */ }

  let dentroDeString = false, escapado = false, out = '';
  for (const ch of m[0]) {
    if (escapado) { out += ch; escapado = false; continue; }
    if (ch === '\\') { out += ch; escapado = true; continue; }
    if (ch === '"') { dentroDeString = !dentroDeString; out += ch; continue; }
    if (dentroDeString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      out += ch === '\t' ? '\\t' : (ch === '\r' ? '' : '\\n');
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}

// ---- Hora de España sobre un server en UTC ----
function partesMadrid(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  dtf.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  return p;
}

// Minutos que hay que sumarle a UTC para llegar a la hora de España (+120 en verano).
function desfaseMadrid(date) {
  const p = partesMadrid(date);
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((comoUTC - date.getTime()) / 60000);
}

// Instante real (UTC) del próximo <dia> a las <hora> de España.
function proximaFranja(dia, hora, desde = new Date()) {
  for (let i = 0; i < 9; i++) {
    const tanteo = new Date(desde.getTime() + i * 86400000);
    const p = partesMadrid(tanteo);
    const local = (off) => Date.UTC(+p.year, +p.month - 1, +p.day, hora, 0, 0) - off * 60000;
    let ms = local(desfaseMadrid(tanteo));
    // Recalcular con el desfase del instante candidato (fin de semana de cambio de hora).
    const off2 = desfaseMadrid(new Date(ms));
    if (off2 !== desfaseMadrid(tanteo)) ms = local(off2);
    const cand = new Date(ms);
    if (cand <= desde) continue;
    if (DIAS.indexOf(partesMadrid(cand).weekday) !== dia) continue;
    return cand;
  }
  return new Date(desde.getTime() + 3600000);
}

// Nº de semana, para rotar los ángulos de forma estable.
function semanaDelAnio(date = new Date()) {
  const p = partesMadrid(date);
  const d = Date.UTC(+p.year, +p.month - 1, +p.day);
  const inicio = Date.UTC(+p.year, 0, 1);
  return Math.floor((d - inicio) / 604800000);
}

function franjaDe(localId) { return FRANJAS[localId] || FRANJA_DEFAULT; }

function anguloDe(localId, cuando = new Date()) {
  const f = franjaDe(localId);
  const id = f.rotacion[semanaDelAnio(cuando) % f.rotacion.length];
  return { id, ...ANGULOS[id] };
}

// ---- IA: un borrador para un local ----
async function generarUno(localId, ultimos, cuando = new Date()) {
  if (!process.env.ANTHROPIC_API_KEY) throw err(500, 'ANTHROPIC_API_KEY no configurada');
  const angulo = anguloDe(localId, cuando);
  const franja = franjaDe(localId);
  const bilingue = angulo.id === 'cenaEn';

  const system = [
    'Sos el redactor de Pizzería Popular: pizza al horno de leña y cocina argentina en España.',
    'Escribís UN post de Google (Novedades) para la ficha de un local. Lo lee gente decidiendo dónde comer.',
    '',
    'ÁNGULO DE ESTE POST (mandatorio, no te salgas de acá):',
    angulo.brief,
    '',
    'REGLAS ESTRICTAS:',
    '- HONESTIDAD ABSOLUTA: solo podés afirmar lo que figura en DATOS o en el ángulo. Prohibido inventar precios, horarios, eventos, servicios o instalaciones.',
    '- NO describas cómo es el local por dentro (qué se ve al entrar, dónde está el horno, cómo está puesta la sala) salvo que esté en DATOS. Hablá del plato y del momento, no de la decoración que no conocés.',
    '- PROHIBIDO hablar de promos, descuentos, ofertas, 2x1, "precio especial" o cualquier cosa que suene a rebaja. Este post no vende precio.',
    '- PROHIBIDO decir "masa madre": la pizzería NO usa masa madre. Si hablás de la masa, decí "masa artesanal".',
    '- NO repitas el tema de los últimos posts listados.',
    '- Tono cercano y argentino suave (vení, probá), sin exagerar. Máximo 1 emoji. Sin hashtags, sin mayúsculas gritadas.',
    bilingue
      ? '- Largo: 250 a 400 caracteres en español + la misma idea en inglés. Total por debajo de 900.'
      : '- Largo del resumen: 300 a 600 caracteres.',
    angulo.fotos.length
      ? '- Elegí UNA foto de FOTOS cuya descripción acompañe el texto (no menciones la foto en el texto).'
      : '- Este post va SIN foto: devolvé "foto_url": "".',
    '',
    'Respondé SOLO este JSON: {"tema":"2-4 palabras","resumen":"...","foto_url":"..."}',
  ].join('\n');

  const DATOS = {
    luceros: 'En la Plaza de los Luceros de Alicante. Terraza sobre la plaza y comedor privado. Es el único local de la casa con barra de cafetería (desayunos y brunch). Junto a la parada Luceros del TRAM.',
    'playa-san-juan': 'En la Avenida de Niza, a pasos de la playa de San Juan. Terraza amplia. Se puede pedir para llevar. Lo más pedido: las Empanadas de Carne.',
    benidorm: 'Local con ventanal y terraza con vista directa a la playa de Benidorm. Mucho público turista, español e internacional.',
    russafa: 'En el barrio de Russafa, Valencia.',
    'santa-clara': 'En Valencia.',
  };

  const user = [
    'LOCAL: Pizzería Popular ' + NOMBRES[localId],
    'DATOS: ' + (DATOS[localId] || '(sin datos extra; usar solo lo genérico de la casa)'),
    '',
    'Últimos posts de este local (NO repetir tema):',
    ultimos.length ? ultimos.map((u) => `- [${u.tema || 'sin tema'}] ${String(u.resumen).slice(0, 90)}…`).join('\n') : '(ninguno)',
    '',
    angulo.fotos.length ? 'FOTOS disponibles:\n' + angulo.fotos.map((f) => `- ${f.url} → ${f.desc}`).join('\n') : 'FOTOS: (este post va sin foto)',
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
    body: JSON.stringify({ model: MODELO, max_tokens: 900, system, messages: [{ role: 'user', content: user }] }),
  });
  const body = await r.json();
  if (body.error) throw err(500, body.error.message || 'Error Anthropic');
  const text = (body.content || []).map((c) => c.text).join('');
  const p = parseJsonIA(text);
  if (!p.resumen || String(p.resumen).length < 50) throw err(500, 'Resumen IA inválido');

  const resumen = String(p.resumen).trim();
  // Red de seguridad: la regla de "masa madre" no puede depender de que la IA obedezca.
  if (/masa\s+madre/i.test(resumen)) throw err(500, 'La IA escribió "masa madre" (prohibido) — reintentar');
  if (angulo.id === 'brunch' && !(/desayun/i.test(resumen) && /brunch/i.test(resumen))) {
    throw err(500, 'El post de Luceros tiene que decir "desayuno" y "brunch" — reintentar');
  }
  // Benidorm va sí o sí ES+EN: sin esto la IA devuelve solo español.
  if (bilingue) {
    const marcasEn = (resumen.match(/\b(the|and|our|with|we|you|your|from|wood-fired|book|table)\b/gi) || []).length;
    if (marcasEn < 4) throw err(500, 'El post de Benidorm tiene que traer también la versión en inglés — reintentar');
  }

  const fotoOk = angulo.fotos.some((f) => f.url === p.foto_url);
  return {
    local_id: localId,
    tipo: 'evergreen',
    tema: p.tema || angulo.tema,
    resumen,
    imagen_url: angulo.fotos.length ? (fotoOk ? p.foto_url : angulo.fotos[0].url) : null,
    cta: 'CALL',
    cta_url: null,
    estado: 'pendiente',
    programado_para: proximaFranja(franja.dia, franja.hora, cuando).toISOString(),
  };
}

// ---- Genera borradores para los locales que no tengan nada esta semana ----
async function generarBorradores() {
  const desde = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
  const resultados = [];
  for (const localId of LOCALES) {
    try {
      // Saltar si ya hay uno en la cola, o si publicó hace menos de 6 días.
      const { data: pend } = await supabaseAdmin.from(TABLE).select('id')
        .eq('local_id', localId).in('estado', ['pendiente', 'aprobado']).limit(1);
      if (pend && pend.length) { resultados.push({ local_id: localId, skip: 'ya hay borrador en la cola' }); continue; }
      const { data: rec } = await supabaseAdmin.from(TABLE).select('id')
        .eq('local_id', localId).eq('estado', 'publicado').gte('publicado_en', desde).limit(1);
      if (rec && rec.length) { resultados.push({ local_id: localId, skip: 'ya publicó esta semana' }); continue; }

      const { data: ultimos } = await supabaseAdmin.from(TABLE).select('tema, resumen')
        .eq('local_id', localId).neq('estado', 'descartado')
        .order('creado_en', { ascending: false }).limit(5);

      // Las validaciones duras (masa madre, desayuno/brunch, ES+EN) tiran error
      // a propósito: se reintenta en vez de dejar al local sin novedad.
      let borrador = null, ultimoError = null;
      for (let intento = 0; intento < 3 && !borrador; intento++) {
        try { borrador = await generarUno(localId, ultimos || []); }
        catch (e) { ultimoError = e; console.warn('[GBP Posts] ' + localId + ' intento ' + (intento + 1) + ': ' + e.message); }
      }
      if (!borrador) throw ultimoError || err(500, 'No se pudo generar el borrador');

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

// ---- Publica un borrador en la ficha ----
async function publicar(id, resumenEditado) {
  const { data: row, error } = await supabaseAdmin.from(TABLE).select('*').eq('id', id).single();
  if (error) throw err(404, error.message);
  if (row.estado === 'publicado') throw err(400, 'Este borrador ya fue publicado');
  if (row.estado === 'descartado') throw err(400, 'Este borrador fue descartado');

  const m = gbp.loadLocations();
  const loc = m && m.locales && m.locales[row.local_id];
  if (!loc) throw err(500, 'Local sin mapear en Google (tocá «Detectar locales»)');

  const resumen = String(resumenEditado || row.resumen).trim();
  if (!resumen) throw err(400, 'El texto está vacío');
  if (/masa\s+madre/i.test(resumen)) throw err(400, 'El texto dice "masa madre" — la casa usa masa artesanal');

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

// ---- Cron: publica lo aprobado cuya franja ya llegó ----
async function publicarProgramados() {
  const { data, error } = await supabaseAdmin.from(TABLE).select('id, local_id')
    .eq('estado', 'aprobado').lte('programado_para', new Date().toISOString());
  if (error) throw err(500, error.message);
  const pendientes = data || [];
  const resultados = [];
  for (const row of pendientes) {
    try {
      await publicar(row.id);
      resultados.push({ local_id: row.local_id, ok: true });
    } catch (e) {
      console.error('[GBP Posts] programado ' + row.local_id + ':', e.message);
      resultados.push({ local_id: row.local_id, error: e.message });
    }
  }
  if (resultados.length) {
    console.log('[GBP Posts] ' + resultados.filter((r) => r.ok).length + '/' + resultados.length + ' novedades programadas publicadas.');
  }
  return resultados;
}

// ---- Listado para el panel ----
async function listar() {
  const { data: cola, error: e1 } = await supabaseAdmin.from(TABLE).select('*')
    .in('estado', ['pendiente', 'aprobado']).order('creado_en', { ascending: true });
  if (e1) throw err(500, e1.message);
  const { data: publicados, error: e2 } = await supabaseAdmin.from(TABLE).select('*')
    .eq('estado', 'publicado').order('publicado_en', { ascending: false }).limit(10);
  if (e2) throw err(500, e2.message);
  return { pendientes: cola || [], publicados: publicados || [] };
}

// ---- Editar texto, aprobar (programar) o descartar ----
async function guardar(id, { resumen, estado }) {
  const patch = {};
  if (typeof resumen === 'string' && resumen.trim()) {
    if (/masa\s+madre/i.test(resumen)) throw err(400, 'El texto dice "masa madre" — la casa usa masa artesanal');
    patch.resumen = resumen.trim();
  }
  if (estado === 'descartado') patch.estado = 'descartado';
  if (estado === 'aprobado') {
    patch.estado = 'aprobado';
    const { data: row } = await supabaseAdmin.from(TABLE).select('local_id, programado_para').eq('id', id).single();
    // Si la franja de este borrador ya pasó, se corre a la de la semana que viene.
    if (row && (!row.programado_para || new Date(row.programado_para) <= new Date())) {
      const f = franjaDe(row.local_id);
      patch.programado_para = proximaFranja(f.dia, f.hora).toISOString();
    }
  }
  if (!Object.keys(patch).length) throw err(400, 'Nada para guardar');
  const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw err(500, error.message);
  return data;
}

module.exports = {
  generarBorradores, publicar, publicarProgramados, listar, guardar,
  // expuesto para scripts y tests
  proximaFranja, anguloDe, FRANJAS,
};
