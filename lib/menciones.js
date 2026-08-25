// ============================================================
// lib/menciones.js — Informe de menciones del equipo en reseñas de Google.
//
// El QUIÉN lo descubre la IA (insights de google-reviews.js, que ya venía
// unificando apodos y errores de tipeo). El CUÁNTO se cuenta ACÁ, sobre TODAS
// las reseñas del rango y con variantes de escritura generadas por reglas
// (c↔k, th↔t, i↔y, s↔z, letras dobles, vocal final estirada). Así "Kathalina"
// y "Martinaaa" suman aunque la IA no las haya listado en esa corrida — el
// conteo deja de moverse entre corridas, que es lo que hacía dudar del número.
//
// El rango es el mismo que el del panel, con una corrección: el día "hasta"
// entra COMPLETO (antes se cortaba a las 23:59 hora del servidor y se perdían
// las reseñas de la última noche del mes).
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('./supabase');
const { localNombre, validateLocal } = require('./google-reviews');

const TABLE = 'pp_resenas_google';
const MODELO = 'claude-haiku-4-5-20251001';
// Cuántas reseñas lee la IA para DESCUBRIR nombres. El conteo después es sobre
// todas: si a alguien lo nombran una sola vez fuera de la muestra, esa mención
// igual suma; lo único que se juega acá es que el nombre aparezca en la lista.
const MUESTRA_MAX = 1200;

const anthropic = new Anthropic();

function err(status, message) {
  const e = new Error(message); e.status = status; return e;
}

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Google guarda el original y su traducción en el mismo campo, en dos formatos:
//   "<original> (Translated by Google) <traducción>"
//   "(Translated by Google) <traducción> (Original) <original>"
// Para la frase que se le muestra al camarero vale lo que escribió el cliente.
function textoOriginal(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  const iOrig = s.indexOf('(Original)');
  if (iOrig >= 0) return s.slice(iOrig + 10).trim();
  const iTrad = s.indexOf('(Translated by Google)');
  if (iTrad > 0) return s.slice(0, iTrad).trim();
  return s;
}

// Un nombre escrito de todas las formas en que la gente lo escribe mal.
// Ejemplos reales de julio en Playa San Juan: Cata/Kata, Catalina/Kathalina,
// Martina/Martinaaa, Sergio/Sergiooo.
function patronNombre(nombre) {
  const n = normalizar(nombre).replace(/[^a-z0-9]/g, '');
  if (!n) return null;
  let re = '';
  for (const ch of n) {
    if (ch === 'c' || ch === 'k' || ch === 'q') re += '[ckq]h?';
    else if (ch === 's' || ch === 'z') re += '[sz]{1,2}';
    else if (ch === 'i' || ch === 'y') re += '[iy]';
    else if (ch === 'b' || ch === 'v') re += '[bv]';
    else if (ch === 'g' || ch === 'j') re += '[gj]';
    else if (ch === 't') re += 't{1,2}h?';
    else if ('lnrmf'.includes(ch)) re += ch + '{1,2}';
    else re += ch;
  }
  // "Martinaaa", "Sergiooo": la última vocal se estira para dar énfasis.
  if (/[aeiou]$/.test(n)) re += '+';
  return re;
}

// Apodo ↔ nombre completo. La IA suele resolverlo sola, pero no siempre la
// misma corrida: fijarlo acá hace que el número no se mueva entre informes.
const ALIAS = [
  ['cata', 'catalina'], ['agus', 'agustina'], ['nacho', 'ignacio'], ['santi', 'santiago'],
  ['guille', 'guillermo'], ['fede', 'federico'], ['manu', 'manuel'], ['nico', 'nicolas'],
  ['maxi', 'maximiliano'], ['mati', 'matias'], ['tomi', 'tomas'], ['lauti', 'lautaro'],
  ['fran', 'francisco'], ['caro', 'carolina'], ['dani', 'daniela'], ['gaby', 'gabriela'],
  ['sofi', 'sofia'], ['vale', 'valentina'], ['flor', 'florencia'], ['juli', 'julieta'],
  ['martu', 'martina'], ['pau', 'paula'], ['leo', 'leonardo'], ['rocio', 'ro'],
  ['belu', 'belen'], ['guada', 'guadalupe'], ['mica', 'micaela'], ['ine', 'ines'],
  // Ailin de Luceros: la nombran Ailin, Ailu, Aillin y Ailyne (dato del dueño,
  // 1 ago). OJO: "Ailén" de Santa Clara/Russafa es OTRA persona — no unificar,
  // las reseñas de una y otra nunca se cruzan de local.
  ['ailu', 'ailin'], ['ailyne', 'ailin'],
];

// Nombre canónico para agrupar: si la IA devolvió "Cata" en una corrida y
// "Catalina" en otra, las dos caen en la misma persona.
function claveNombre(n) {
  const x = normalizar(n);
  for (const [corto, largo] of ALIAS) { if (x === corto || x === largo) return largo; }
  return x;
}

// Misma palabra al oído: sin h, c/k/q iguales, s/z iguales, i/y iguales,
// letras repetidas colapsadas. "Kathalina" y "Catalina" caen en lo mismo.
function foldear(s) {
  return normalizar(s).replace(/[^a-z0-9]/g, '').replace(/h/g, '')
    .replace(/[ckq]/g, 'k').replace(/[sz]/g, 's').replace(/[iy]/g, 'i')
    .replace(/[bv]/g, 'b').replace(/[gj]/g, 'g').replace(/(.)\1+/g, '$1');
}

// Filtro de cordura para lo que propone la IA: una variante tiene que sonar
// como el nombre. Sin esto, la IA llegó a listar "August" como variante de
// Agustina y una reseña en inglés que hablaba del mes sumaba una mención.
function variantePlausible(nombre, v) {
  const a = foldear(nombre); const b = foldear(v);
  if (!a || !b) return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 3;
}

// Todas las formas conocidas de un nombre: la etiqueta, lo que vio la IA (si
// pasa el filtro de cordura) y el apodo/nombre completo de la tabla de arriba.
function formasDe(nombre, variantes) {
  const base = [nombre, ...(Array.isArray(variantes) ? variantes : []).filter((v) => variantePlausible(nombre, v))]
    .map((v) => normalizar(v)).filter(Boolean);
  const conAlias = new Set(base);
  base.forEach((b) => ALIAS.forEach(([corto, largo]) => {
    if (b === corto) conAlias.add(largo);
    if (b === largo) conAlias.add(corto);
  }));
  return [...conAlias];
}

// Devuelve un test(reseña) para un empleado y sus variantes conocidas.
// Los nombres de 3 letras o menos (Sol, Ana) piden mayúscula en el texto
// original: si no, "sol" se lleva puesto "nos sentamos al sol".
function detector(nombre, variantes) {
  const formas = formasDe(nombre, variantes);
  const largos = formas.filter((f) => f.length > 3)
    // En los nombres largos se tolera una letra pegada al final: "martinan"
    // (por "Martina n...") es un tipeo real, no otra persona. En los cortos no,
    // que "catas" sería una cata de vinos.
    .map((f) => { const p = patronNombre(f); return p && f.length >= 6 ? p + '[sn]?' : p; })
    .filter(Boolean);
  const cortos = formas.filter((f) => f.length <= 3).map((f) => f.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const reLargos = largos.length ? new RegExp('(^|[^a-z0-9])(' + largos.join('|') + ')([^a-z0-9]|$)') : null;
  const reCortos = cortos.length
    ? new RegExp('(^|[^\\wÁÉÍÓÚÑ])(' + cortos.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join('|') + ')([^\\wáéíóúñ]|$)')
    : null;
  return (texto) => {
    if (reLargos && reLargos.test(normalizar(texto))) return true;
    return !!(reCortos && reCortos.test(String(texto || '')));
  };
}

// El día "hasta" entra entero: se filtra con < día siguiente a las 00:00 UTC.
function limiteSuperior(hasta) {
  if (!hasta) return null;
  const iso = String(hasta).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + 'T00:00:00.000Z');
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

async function traerResenas({ local_id, desde, hasta }) {
  const filas = [];
  const PAGE = 1000;
  const tope = limiteSuperior(hasta);
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin.from(TABLE)
      .select('id, local_id, fecha_resena, estrellas, cliente_nombre, texto_original')
      .order('fecha_resena', { ascending: false })
      .order('id', { ascending: false });
    if (local_id && validateLocal(local_id)) q = q.eq('local_id', local_id);
    if (desde) q = q.gte('fecha_resena', String(desde).slice(0, 10));
    if (tope) q = q.lt('fecha_resena', tope);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw err(500, error.message);
    filas.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return filas;
}

// Corta sin partir un par suplente de emoji al medio: un carácter huérfano hace
// que la API de Anthropic rechace el request entero.
function recortar(s, n) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
}

// ---- Descubrimiento de nombres ----
// La sección "Lo que dice la gente" del panel también saca empleados, pero
// corta en 8 y la lista cambia según la corrida. Un informe que se le entrega
// al equipo no puede dejar a nadie afuera, así que pide su propia lista larga.
async function descubrirEquipo(conTexto) {
  if (!process.env.ANTHROPIC_API_KEY) throw err(500, 'ANTHROPIC_API_KEY no configurada');
  let textos = conTexto.map((r) => recortar(textoOriginal(r.texto_original), 260)).filter(Boolean);
  if (textos.length > MUESTRA_MAX) {
    const paso = textos.length / MUESTRA_MAX;
    const sel = [];
    for (let i = 0; i < MUESTRA_MAX; i++) sel.push(textos[Math.floor(i * paso)]);
    textos = sel;
  }

  const system = `Sos analista de reseñas de Pizzería Popular (pizzería argentina en España). Te paso reseñas de Google.
Tu única tarea: listar los NOMBRES PROPIOS DE PERSONAS DEL PERSONAL que los clientes nombran (camareros, encargados, cocineros).
Devolvé SOLO un JSON válido, sin markdown:
{"empleados":[{"nombre":"Nombre","variantes":["Nombre","variante1"],"nota":"por qué lo nombran, en 6 palabras"}]}
Reglas:
- Hasta 20 personas. Si hay menos, menos.
- SOLO nombres propios. Nada de "el camarero", "la chica de la terraza".
- NO son personas: platos ni productos (nachos, napolitana, margarita, milanesa), ciudades, meses (August/Agosto), marcas.
- UNIFICAR variantes de la misma persona: con y sin tilde, tipeos y letras cambiadas (Kata=Cata, Inez=Inés, Serghio=Sergio), apodo y nombre completo (Cata=Catalina, Agus=Agustina, Nacho=Ignacio). Una persona = una entrada, con TODAS las formas vistas en "variantes" (incluida la etiqueta).
- Etiqueta = la forma más frecuente en las reseñas.
- No cuentes menciones: de eso se encarga el sistema.`;

  const resp = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content: 'Reseñas (' + textos.length + '):\n' + textos.join('\n') }],
  });
  const texto = (resp.content || []).map((c) => c.text || '').join('');
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) throw err(500, 'La IA no devolvió una lista de nombres');
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw err(500, 'La IA devolvió un JSON inválido'); }
  return Array.isArray(parsed.empleados) ? parsed.empleados.slice(0, 20) : [];
}

// Junta en una sola persona lo que la IA pudo haber devuelto partido ("Cata" y
// "Catalina" como dos empleados) y elige de etiqueta la forma que la gente
// escribe más veces, no la que le tocó a la IA esa corrida.
function agrupar(empleados, conTexto) {
  const grupos = new Map();
  empleados.forEach((e) => {
    if (!e || !e.nombre) return;
    const k = claveNombre(e.nombre);
    const g = grupos.get(k) || { nombres: [], variantes: [], nota: '' };
    g.nombres.push(e.nombre);
    g.variantes.push(...(e.variantes || []));
    if (!g.nota && e.nota) g.nota = e.nota;
    grupos.set(k, g);
  });
  const frecuencia = (forma) => {
    const test = detector(forma, []);
    return conTexto.filter((r) => test(r.texto_original)).length;
  };
  // El detector es difuso a propósito (para pescar "Ailu" cuando escriben "Ailin"),
  // así que dos formas de la misma persona empatan y el desempate terminaba
  // eligiendo la más corta — el apodo por encima del nombre real. Para etiquetar
  // manda cuántas veces está escrita ESA forma exacta.
  const frecuenciaExacta = (forma) => {
    const f = normalizar(forma).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!f) return 0;
    const re = new RegExp('\\b' + f + '\\b');
    return conTexto.filter((r) => re.test(normalizar(textoOriginal(r.texto_original)))).length;
  };
  return [...grupos.values()].map((g) => {
    const principal = g.nombres[0];
    const candidatos = [...new Set([...g.nombres, ...g.variantes])]
      .filter((c) => c && variantePlausible(principal, c));
    const etiqueta = candidatos
      .map((c) => ({ c, exacta: frecuenciaExacta(c), n: frecuencia(c) }))
      .sort((a, b) => b.exacta - a.exacta || b.n - a.n || a.c.length - b.c.length)[0];
    return { nombre: etiqueta ? etiqueta.c : principal, nota: g.nota, variantes: candidatos };
  });
}

/**
 * Informe de menciones del equipo.
 * @param {object} query - { local_id, desde, hasta, empleado, frases }
 *   empleado: si viene, el informe trae SOLO a esa persona (para entregárselo).
 *   frases: cuántas frases textuales guardar por persona (por defecto 10; en
 *           el informe individual conviene subirlo).
 */
const _cache = new Map();
const _cacheEquipo = new Map();

async function menciones(query = {}) {
  const { local_id, desde, hasta, empleado } = query;
  const maxFrases = Math.min(Math.max(parseInt(query.frases, 10) || 10, 1), 60);
  if (local_id && !validateLocal(local_id)) throw err(400, 'local_id inválido');

  // Cache por día: el ranking que se ve en el panel y el PDF que se descarga
  // después tienen que dar lo mismo (y no pagar dos pasadas de IA).
  const clave = [new Date().toISOString().slice(0, 10), local_id || '', desde || '',
    hasta || '', normalizar(empleado || ''), maxFrases].join('|');
  if (_cache.has(clave)) return _cache.get(clave);

  const filas = await traerResenas({ local_id, desde, hasta });
  const conTexto = filas.filter((r) => String(r.texto_original || '').trim());

  // Descubrimiento de nombres: la IA sobre la muestra del rango. Si el rango no
  // tiene reseñas con texto no hay nada que informar.
  // La lista de nombres se descubre UNA vez por local+rango: bajar el PDF de
  // cada persona no puede costar una pasada de IA por persona (y el proxy del
  // panel AJAX corta a los 60s).
  const claveEquipo = [new Date().toISOString().slice(0, 10), local_id || '', desde || '', hasta || '', conTexto.length].join('|');
  let equipoCrudo = _cacheEquipo.get(claveEquipo);
  if (!equipoCrudo) {
    equipoCrudo = conTexto.length ? await descubrirEquipo(conTexto) : [];
    if (_cacheEquipo.size > 20) _cacheEquipo.clear();
    _cacheEquipo.set(claveEquipo, equipoCrudo);
  }
  let equipo = agrupar(equipoCrudo, conTexto);

  const buscado = empleado ? claveNombre(empleado) : null;
  if (buscado) equipo = equipo.filter((e) => claveNombre(e.nombre) === buscado ||
    (e.variantes || []).some((v) => claveNombre(v) === buscado));
  if (buscado && !equipo.length) throw err(404, 'No hay menciones de "' + empleado + '" en el período elegido');

  const conNombre = new Set();
  const empleados = equipo.map((e) => {
    const test = detector(e.nombre, e.variantes);
    const suyas = conTexto.filter((r) => test(r.texto_original));
    suyas.forEach((r) => conNombre.add(r.id));
    const estrellas = {};
    suyas.forEach((r) => { estrellas[r.estrellas] = (estrellas[r.estrellas] || 0) + 1; });
    const suma = suyas.reduce((a, r) => a + (Number(r.estrellas) || 0), 0);
    const frases = suyas
      .map((r) => ({
        fecha: String(r.fecha_resena || '').slice(0, 10),
        estrellas: Number(r.estrellas) || 0,
        autor: r.cliente_nombre || '',
        local: localNombre(r.local_id),
        texto: textoOriginal(r.texto_original),
      }))
      .filter((f) => f.texto)
      .sort((a, b) => (b.estrellas - a.estrellas) || (a.fecha < b.fecha ? 1 : -1))
      .slice(0, maxFrases);
    return {
      nombre: e.nombre,
      nota: e.nota || '',
      menciones: suyas.length,
      estrellas,
      promedio: suyas.length ? Math.round(suma / suyas.length * 100) / 100 : null,
      frases,
    };
  }).filter((e) => e.menciones > 0).sort((a, b) => b.menciones - a.menciones);

  const informe = {
    local_id: local_id || null,
    local: local_id ? localNombre(local_id) : 'Todos los locales',
    desde: desde ? String(desde).slice(0, 10) : null,
    hasta: hasta ? String(hasta).slice(0, 10) : null,
    totales: {
      resenas: filas.length,
      conTexto: conTexto.length,
      conNombre: conNombre.size,
    },
    empleados,
    generado: new Date().toISOString(),
  };
  if (_cache.size > 20) _cache.clear();
  _cache.set(clave, informe);
  return informe;
}

module.exports = { menciones, textoOriginal, patronNombre, detector };
