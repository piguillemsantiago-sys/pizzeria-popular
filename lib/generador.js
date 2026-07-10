// ============================================================
// lib/generador.js — Generador de piezas para redes (historias
// y carruseles). La IA escribe el copy (Claude), la foto sale
// del banco (Drive/storage) o de Gemini (si hay GEMINI_API_KEY),
// y sharp compone la pieza final con la gráfica de la marca.
// ============================================================
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const { supabaseAdmin } = require('./supabase');
const { downloadFile } = require('./drive');
const { guiaDeEstilo, referenciaActiva, listarReferencias } = require('./referencia');
const { getBrandKit, brandKitTexto } = require('./brand-kit');

const client = new Anthropic();

// Logos reales del Kit de marca (public/images/logos/). El blanco es el
// default porque las piezas llevan un degradado oscuro arriba.
const LOGO_DIR = path.join(__dirname, '..', 'public', 'images', 'logos');
const LOGOS = {
  'wordmark-blanco': { file: 'wordmark-blanco.png', tipo: 'wordmark' },
  'wordmark-oscuro': { file: 'wordmark-oscuro.png', tipo: 'wordmark' },
  'iso-blanco': { file: 'iso-blanco.png', tipo: 'iso' },
  'iso-fuego': { file: 'iso-fuego.png', tipo: 'iso' },
  'iso-rojo': { file: 'iso-rojo.png', tipo: 'iso' },
  'iso-verde': { file: 'iso-verde.png', tipo: 'iso' },
};
const LOGO_DEFAULT = 'iso-blanco'; // como las referencias: la "P" sola, chica

const FORMATOS = {
  historia: { w: 1080, h: 1920, maxPlacas: 1 },
  post: { w: 1080, h: 1350, maxPlacas: 1 },
  carrusel: { w: 1080, h: 1350, maxPlacas: 6 },
};

const GOLD = '#D8A460';
const DARK = '#171310';

function geminiDisponible() {
  return !!process.env.GEMINI_API_KEY;
}

// ---- Copy con IA ----
const COPY_SYSTEM = `Sos el creativo de redes de Pizzería Popular (cadena argentina de
pizza al horno de leña en España: Valencia, Alicante, Benidorm y Madrid).
Tono: cálido, argentino, directo, con humor liviano. Hablás de "vos". Cero corporativo.

Te dan una instrucción y un formato. Devolvé SOLO un JSON válido (sin markdown):

{
  "caption": "texto para el pie del post en Instagram, 2-4 líneas + hashtags (5-8, mezclá marca y locales)",
  "placas": [
    { "titulo": "...", "acento": "...", "bajada": "...", "cta": "...", "lugar": "...", "estilo": "clasico|editorial|titular|sandwich|producto", "escenaIA": "...", "escenaPistas": ["...", "..."], "banderas": [], "evento": "" }
  ]
}

La gráfica se arma así: el "titulo" va en blanco (sans), y el "acento" va GRANDE en
cursiva dorada manuscrita debajo — es el remate emocional, la frase que más pega.
Pensá el par título+acento como una sola idea que se completa.

Reglas:
- formato "historia": exactamente 1 placa.
- formato "post": exactamente 1 placa (imagen única para el feed, formato 4:5).
- formato "carrusel": 3 a 5 placas. La primera es el GANCHO (que frenen el dedo),
  las del medio desarrollan (una idea por placa), la última es el CTA.
- "titulo": máximo 6 palabras, blanco, sin punto final. Puede ser "" si el acento se basta solo.
- "acento": 1 a 3 palabras en cursiva dorada, el golpe emocional (ej: "felicidad",
  "como en casa", "estamos llegando", "te esperamos"). Casi siempre conviene ponerlo.
  NUNCA pongas fechas, horas, precios ni números en el acento: la cursiva es un brush
  manuscrito y los dígitos (21/06, 18:00, 2x1, €) se leen mal y quedan feos. Esos datos
  van SIEMPRE en la bajada. El acento es solo el remate emocional, en palabras.
- "bajada": máximo 14 palabras, complementa (no repite). Puede ser "".
- "cta": máximo 4 palabras (ej: "Reservá tu mesa", "Mandá tu CV") o "" si no aplica.
- "lugar": local/dirección SOLO si la instrucción lo menciona (ej: "Valencia",
  "Av. Niza 9, Alicante"). Si no, "".
- "estilo": el DISEÑO de la placa. Elegilo según el CONTENIDO (nunca al azar):
  · "clasico" → el versátil y seguro: título sans + cursiva dorada. Promos y mensajes generales.
  · "editorial" → frase con actitud/statement: serif grande a la izquierda, una palabra en dorado.
  · "titular" → UNA palabra protagonista gigante (aperturas, nombres de local, "PRONTO").
  · "sandwich" → invitación/anuncio llamativo: serif grande + cursiva dorada enorme. Eventos, partidos.
  · "producto" → plato/carta/antojo concreto: título serif abajo + botón CTA.
  En un carrusel VARIÁ el diseño entre placas (no salgan todas iguales); en historia/post
  elegí el que mejor calce con el mensaje.
- No inventes promos, precios ni datos: usá SOLO lo que dice la instrucción.
- Tildes y eñes bien escritas. Emojis: máximo 1 por placa, solo si suma.
- CERO jerga corporativa: nada de "RRHH", "vacante", "postulación", "personal idóneo",
  "candidato". Hablá simple y cálido, como le hablás a un amigo.
- PROHIBIDO el lenguaje inclusivo con x, e o @ (NUNCA "todxs", "todes", "amigues",
  "chiques", "bienvenides"). Usá masculino genérico ("todos") o reformulá en neutro
  ("toda la familia", "la gente", "ustedes"). La marca escribe en español rioplatense estándar.
- Empezá cada texto (título, bajada) con mayúscula. No repitas la misma palabra entre
  título, acento y bajada (ej: si el título dice "Buscamos", el acento/bajada no).
- No repitas información entre campos: si completás "lugar", la bajada NO lleva la
  dirección (la etiqueta ya la muestra); si completás "evento", la bajada no repite
  ese cartel. Cada dato aparece UNA sola vez en la placa.
- "escenaIA": un PROMPT (en español) para generar la FOTO DE FONDO con IA (Gemini),
  redactado como un DIRECTOR DE FOTOGRAFÍA. NO es el mensaje de la placa: es la
  descripción de la foto. Reglas:
  · Prosa descriptiva, no lista de palabras sueltas. 2 a 4 oraciones.
  · A TEMA con la campaña, pero SIN gente y SIN texto (Gemini deforma caras y hornea
    texto). Preferí producto, ambiente, fuego, detalles, texturas.
  · Excepción: si la instrucción pide gente/hinchas/ambiente humano, incluila pero
    SIEMPRE de espaldas o fuera de foco (ej: "hinchas de espaldas con camisetas rojas
    mirando la pantalla"), NUNCA caras nítidas ni en primer plano. La ropa va LISA:
    camisetas del color del equipo pero SIN inscripciones, números, escudos ni marcas
    (la IA inventa textos deformes en la ropa; pedilo explícito en la escena).
  · Incluí: sujeto/escena concreta · luz (dirección y calidez) · lente y profundidad de
    campo (ej: "50mm, f/1.8, foco selectivo, bokeh") · paleta cálida de marca (ámbar,
    dorado, rojo profundo, negro) · mood.
  · Pedí que el tercio inferior quede en penumbra, liso y con aire (zona para el texto).
  · Cerrá con: "Fotorrealista, alto detalle. Sin texto, sin letras, sin logos ni marcas
    de agua en ninguna parte."
  · Si es un PARTIDO o evento deportivo: NO hagas un primer plano de pizza. La escena es
    el AMBIENTE de vivirlo en la pizzería: al fondo, una pantalla grande encendida con el
    verde de una cancha iluminada por reflectores de estadio; en primer plano, pizzas al
    horno y bebidas para compartir sobre la mesa de madera, luz cálida de noche de hinchada.
    El partido (la pantalla) es el PROTAGONISTA del fondo y la pizza acompaña. Sin gente.
  · Si la instrucción no da para una escena clara, describí una foto cálida de producto
    de la pizzería (pizza al horno de leña, mesa de madera).
- "escenaPistas": un ARRAY de 3 a 4 elementos cortos (2 a 4 palabras cada uno) que el
  usuario podría querer DESTACAR en ESA misma escena para enriquecerla, a tema con la
  campaña. Son ideas visuales concretas (sujetos, detalles, ambiente), NO el mensaje, y
  cumplen las MISMAS reglas que escenaIA: sin gente, sin texto. Ej. para Hogueras de San
  Juan: ["ninots ardiendo", "fuegos artificiales", "calle con guirnaldas", "brasas y chispas"].
  Ej. para una promo de pizza: ["queso fundido estirándose", "horno de leña al fondo",
  "albahaca fresca", "humo cálido"]. Ej. para un PARTIDO: ["pantalla con el partido",
  "cancha verde iluminada", "pizzas para compartir", "bebidas heladas"]. Si no se te
  ocurren opciones claras, devolvé [].
- "ambienteReal": true SOLO si la instrucción pide que la escena muestre NUESTROS
  locales reales (la ambientación/instalaciones de la marca: "como nuestros locales",
  "usá las fotos del local", "que se vea el salón"). El sistema entonces adjunta una
  foto real del local como referencia visual para la IA de imágenes. Si no, false.
- "banderas": SOLO para placas de un PARTIDO o evento entre dos países/selecciones.
  Array con los 2 códigos ISO alpha-2 de los países, EN ORDEN (España=es, Arabia
  Saudita=sa, Argentina=ar, Francia=fr, Brasil=br, Inglaterra=gb, Alemania=de,
  Portugal=pt, Italia=it, Marruecos=ma, México=mx, EEUU=us). Si la placa NO es de un
  partido entre dos países, devolvé []. No inventes países que no estén en la instrucción.
  Si devolvés banderas, el título NO repita "X vs Y" (la fila de banderas ya muestra el
  cruce): usá un título que invite (ej: "Se juega en la pizzería", "La previa es acá").
- "evento": SOLO para placas de un PARTIDO o evento en vivo. Un cartel CORTO de urgencia,
  máximo 4 palabras (el diseño lo pone en mayúscula y lo destaca como tag dorado arriba
  del título). Ej: "EN VIVO", "EN DIRECTO", "LO PASAMOS EN VIVO". NUNCA inventes servicios
  que no sabés que existen: PROHIBIDO "pantalla gigante", "happy hour", "barra libre", etc.
  salvo que la instrucción lo diga textualmente. Si no es un partido/evento, devolvé "".`;

// ---- Parseo robusto del JSON que devuelve la IA ----
// Tolera fences ```json, prosa antes/después, y toma el PRIMER objeto {...}
// balanceado (no un regex greedy que puede tomar contenido cruzado).
function parseJsonIA(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Escanea cada candidato {...} balanceado; si uno no parsea (p. ej. un bloque de
  // llaves en prosa ANTES del JSON real), sigue con el siguiente en vez de rendirse.
  let start = t.indexOf('{');
  while (start !== -1) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return null; // llaves desbalanceadas: no hay candidato válido
    try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { /* probá el próximo */ }
    start = t.indexOf('{', start + 1);
  }
  return null;
}

// ---- Structured outputs: la API garantiza JSON válido conforme al schema ----
// (output_config.format). Elimina la clase entera de errores de parseo/truncado.
// Espeja DISENO_LIST (definido más abajo; acá va literal porque los schemas se
// evalúan al cargar el módulo).
const ESTILOS_ENUM = ['clasico', 'editorial', 'titular', 'sandwich', 'producto'];

const COPY_SCHEMA = {
  type: 'object',
  properties: {
    caption: { type: 'string' },
    placas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          acento: { type: 'string' },
          bajada: { type: 'string' },
          cta: { type: 'string' },
          lugar: { type: 'string' },
          estilo: { type: 'string', enum: ESTILOS_ENUM },
          escenaIA: { type: 'string' },
          escenaPistas: { type: 'array', items: { type: 'string' } },
          banderas: { type: 'array', items: { type: 'string' } },
          evento: { type: 'string' },
          ambienteReal: { type: 'boolean' },
        },
        required: ['titulo', 'acento', 'bajada', 'cta', 'lugar', 'estilo', 'escenaIA', 'escenaPistas', 'banderas', 'evento', 'ambienteReal'],
        additionalProperties: false,
      },
    },
  },
  required: ['caption', 'placas'],
  additionalProperties: false,
};

// Ajuste CONSERVADOR: todos los campos opcionales — el modelo devuelve SOLO lo
// que la indicación pide cambiar; lo omitido conserva el valor actual (así un
// ajuste nunca reescribe ni borra lo que no se pidió).
const AJUSTE_SCHEMA = {
  type: 'object',
  properties: {
    caption: { type: 'string' },
    placas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          // Sin enums acá: con tantos campos opcionales la gramática se hace
          // pesada y la compilación puede vencer ("Grammar compilation timed
          // out"). estilo/logo ya se validan aguas abajo (DISENOS[...] || clasico).
          titulo: { type: 'string' },
          acento: { type: 'string' },
          bajada: { type: 'string' },
          cta: { type: 'string' },
          lugar: { type: 'string' },
          estilo: { type: 'string' },
          logo: { type: 'string' },
          cambiarFoto: { type: 'boolean' },
          fotoHint: { type: 'string' },
          banderas: { type: 'array', items: { type: 'string' } },
          evento: { type: 'string' },
          notaDiseno: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  required: ['placas'],
  additionalProperties: false,
};

// Sin enums (misma razón que AJUSTE_SCHEMA): sanearRetoque ya clampa escalas y
// filtra vert/align/ocultar/mostrar a los valores válidos.
const RETOQUE_SCHEMA = {
  type: 'object',
  properties: {
    tituloScale: { type: 'number' },
    acentoScale: { type: 'number' },
    bajadaScale: { type: 'number' },
    vert: { type: 'string' },
    align: { type: 'string' },
    tituloUnaLinea: { type: 'boolean' },
    ocultar: { type: 'array', items: { type: 'string' } },
    mostrar: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
};

// Modelo de copywriting por env (mismo patrón que GEMINI_IMAGE_MODEL: cambiar =
// env + restart, sin deploy).
function copyModel() {
  return process.env.CLAUDE_COPY_MODEL || 'claude-opus-4-8';
}

// Junta el texto de la respuesta y lo parsea. Con output_config el JSON viene
// garantizado; parseJsonIA queda como red de seguridad.
// El modelo a veces escribe los caracteres no-ASCII como escapes Unicode dobles
// dentro del JSON ("Espa\\u00f1a"): tras el parse queda el literal "ñ" en el
// string y el panel lo muestra tal cual. Se decodifican acá, para todos los campos.
function desescaparUnicode(v) {
  if (typeof v === 'string') return v.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  if (Array.isArray(v)) return v.map(desescaparUnicode);
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = desescaparUnicode(v[k]); return v; }
  return v;
}
function jsonRespuesta(resp) {
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  let out;
  try { out = JSON.parse(text); } catch (e) { out = parseJsonIA(text); }
  return desescaparUnicode(out);
}

// create() con structured outputs y degradación: si el compilador de la API no
// banca el schema (400 "Grammar compilation timed out" / "Schema is too
// complex" — le pasa a los schemas de muchos campos OPCIONALES, como el del
// ajuste), reintenta la MISMA llamada sin schema — el prompt pide JSON igual y
// parseJsonIA lo rescata. El schema rechazado se recuerda para el resto del
// proceso: el timeout de compilación tarda ~1 min y sin memoria cada llamada lo
// pagaría de nuevo (un deploy/restart lo vuelve a intentar, por si la API mejora).
const schemasVencidos = new Set();
async function crearConSchema(params, schema) {
  if (!schemasVencidos.has(schema)) {
    try {
      return await client.messages.create(
        Object.assign({}, params, { output_config: { format: { type: 'json_schema', schema } } }));
    } catch (e) {
      if (!(e && e.status === 400 && /grammar|schema/i.test(String(e.message || '')))) throw e;
      schemasVencidos.add(schema);
      console.error('[Gen] schema rechazado por la API, sigo sin structured outputs:', e.message);
    }
  }
  return client.messages.create(params);
}

// ---- Saneo del copy DESPUÉS de la IA (red de seguridad, independiente del prompt) ----
// Normaliza el lenguaje inclusivo conocido y trunca los campos que pasan el límite de
// palabras. Acumula avisos en out.avisos para que el panel los muestre (nada se recorta
// en silencio).
const INCLUSIVO = {
  'todxs': 'todos', 'todes': 'todos', 'tod@s': 'todos',
  'nosotrxs': 'nosotros', 'nosotres': 'nosotros',
  'amigxs': 'amigos', 'amigues': 'amigos', 'amig@s': 'amigos',
  'chicxs': 'chicos', 'chiques': 'chicos',
  'niñxs': 'niños', 'niñes': 'niños',
  'bienvenidxs': 'bienvenidos', 'bienvenides': 'bienvenidos',
  'queridxs': 'queridos', 'querides': 'queridos',
  'vecinxs': 'vecinos', 'vecines': 'vecinos',
  'hijxs': 'hijos', 'hijes': 'hijos',
  'ellxs': 'ellos', 'elles': 'ellos',
};
function igualarMayus(orig, repl) {
  // ALL-CAPS (TODES → TODOS): conserva el énfasis del original.
  if (orig && orig === orig.toUpperCase() && orig !== orig.toLowerCase()) return repl.toUpperCase();
  // Inicial mayúscula (Todes → Todos).
  if (orig && orig[0] === orig[0].toUpperCase()) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
}
function sanearTexto(s, campo, avisos) {
  if (!s) return s;
  let out = String(s);
  for (const mal in INCLUSIVO) {
    const re = new RegExp('\\b' + mal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    const antes = out;
    out = out.replace(re, (m) => igualarMayus(m, INCLUSIVO[mal]));
    if (out !== antes) avisos.push('Corregí lenguaje inclusivo en ' + campo + ': "' + mal + '" → "' + INCLUSIVO[mal] + '"');
  }
  return out;
}
function normalizarEspacios(s) {
  return String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean).join(' ');
}
// Un texto pasado del límite NUNCA se recorta a lo bruto (deja frases colgadas:
// "se va a la…"). Se anota el exceso y después acortarLargos lo REESCRIBE con IA
// dentro del límite — la herramienta se corrige sola, sin darle tarea al usuario.
function medirExceso(out, i, clave, campo, max) {
  const t = String(out.placas[i][clave] || '').trim();
  if (!t) return;
  const n = t.split(/\s+/).filter(Boolean).length;
  if (n > max) (out._excesos = out._excesos || []).push({ i, clave, campo, max, texto: t, palabras: n });
}
function sanearCopy(out) {
  const avisos = [];
  if (out.caption) out.caption = sanearTexto(out.caption, 'el caption', avisos);
  (out.placas || []).forEach((p, i) => {
    // Condicional (como banderas/evento): en un AJUSTE el modelo OMITE los campos
    // que no cambian — normalizarlos igual convertía undefined en "" y el merge
    // del endpoint los borraba de la placa (campos que nadie pidió tocar).
    if (p.titulo != null) p.titulo = normalizarEspacios(sanearTexto(p.titulo, 'el título', avisos));
    if (p.acento != null) p.acento = normalizarEspacios(sanearTexto(p.acento, 'el acento', avisos));
    if (p.bajada != null) p.bajada = normalizarEspacios(sanearTexto(p.bajada, 'la bajada', avisos));
    if (p.cta != null) p.cta = normalizarEspacios(sanearTexto(p.cta, 'el CTA', avisos));
    medirExceso(out, i, 'titulo', 'el título', 6);
    medirExceso(out, i, 'acento', 'el acento', 5);
    medirExceso(out, i, 'bajada', 'la bajada', 14);
    medirExceso(out, i, 'cta', 'el botón (CTA)', 4);
    if (p.lugar) p.lugar = sanearTexto(p.lugar, 'el lugar', avisos);
    // escenaPistas: array de sugerencias cortas para el modal de IA. Defensivo:
    // normaliza a strings limpios, sin vacíos, máx 5 (el panel las muestra como chips).
    p.escenaPistas = Array.isArray(p.escenaPistas)
      ? p.escenaPistas.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5)
      : [];
    // banderas: solo códigos ISO alpha-2 válidos (2 letras), máx 2 (es un "país vs país").
    // Condicional (como lugar): si la IA NO la devuelve, NO la forzamos a [] — así en un
    // ajuste que no menciona banderas, se mantienen las que ya tenía la placa.
    if (Array.isArray(p.banderas)) {
      p.banderas = p.banderas.map((c) => String(c || '').toLowerCase().replace(/[^a-z]/g, '')).filter((c) => c.length === 2).slice(0, 2);
    }
    // evento: tag de "modo evento" (ej. "EN VIVO"). Condicional como banderas: si la IA
    // NO lo devuelve, NO lo forzamos a "" (un ajuste que no lo menciona lo conserva).
    // Máx 4 palabras, sin punto final.
    if (p.evento != null) {
      p.evento = normalizarEspacios(String(p.evento).replace(/[.;]+\s*$/, ''));
      medirExceso(out, i, 'evento', 'el cartel de evento', 4);
    }
  });
  if (avisos.length) out.avisos = (out.avisos || []).concat(avisos);
  return out;
}

// ---- Editor de largos: reescribe con IA los textos que se pasaron del límite ----
// La herramienta se corrige sola: nada de recortes brutos ni de pedirle al usuario
// que acorte a mano. Un editor (Haiku, rápido) reescribe cada texto DENTRO de su
// límite conservando mensaje, tono y datos duros. Si el editor falla, el texto
// queda entero (el layout lo absorbe) y solo se avisa.
const ACORTAR_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          texto: { type: 'string' },
        },
        required: ['id', 'texto'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const ACORTAR_SYSTEM = `Sos editor de copys de Pizzería Popular (tono argentino cálido, de "vos"). Te paso textos de placas de redes que se pasaron de su límite de palabras, CON el resto de su placa como contexto. Reescribí CADA texto pasado para que quede DENTRO de su límite:
- REESCRIBÍ de verdad: reformulá, cambiá palabras, reordená. PROHIBIDO acortar borrando palabras sueltas y dejar castellano roto. Ej: "Vení a conocer el local nuevo" (7, máx 4) → BIEN: "Conocé el local nuevo" · MAL: "Vení a conocer local".
- MIRÁ EL CONTEXTO de la placa: el título y el acento (cursiva dorada) se leen JUNTOS en la gráfica, como una sola idea que se completa. Lo que reescribas tiene que seguir sonando bien con el resto y SIN repetir palabras ni ideas entre título, acento y bajada (ej: si el acento dice "a la arena", el título NO puede terminar "a la playa").
- Mantené el mensaje, el tono y los DATOS DUROS (fechas, horas, lugares, precios). Si hay que sacrificar algo, sacrificá adornos, NUNCA datos.
- Frases completas y naturales: nada de puntos suspensivos ni frases colgadas.
- Sin lenguaje inclusivo con x/e/@. Tildes bien puestas.
Devolvé un JSON {"items":[{"id": <número de la lista>, "texto": "<texto reescrito>"}]} con TODOS los textos de la lista.`;

async function acortarLargos(out) {
  const ex = out._excesos || [];
  delete out._excesos;
  if (!ex.length) return out;
  const palabras = (t) => String(t || '').trim().split(/\s+/).filter(Boolean);
  try {
    // Contexto: la placa entera de cada texto pasado, para que la reescritura
    // conserve la coherencia del conjunto (el par título+acento se lee junto).
    const placasCtx = Array.from(new Set(ex.map((e) => e.i))).map((i) => {
      const p = out.placas[i] || {};
      return 'Placa ' + (i + 1) + ' → título: "' + (p.titulo || '') + '" · acento (cursiva): "' +
        (p.acento || '') + '" · bajada: "' + (p.bajada || '') + '" · botón: "' + (p.cta || '') + '"';
    }).join('\n');
    const lista = ex.map((e, n) =>
      (n + 1) + '. [placa ' + (e.i + 1) + ', ' + e.campo + ' — máximo ' + e.max + ' palabras, tiene ' + e.palabras + '] ' + e.texto).join('\n');
    const resp = await crearConSchema({
      // El modelo del copy (Opus), no Haiku: reescribir respetando límite +
      // coherencia del par título/acento + datos duros junto es demasiada
      // instrucción para Haiku (probado: dejaba textos largos y pares repetidos).
      // OJO con poner acá un Claude 5 (sonnet-5/fable): piensan por defecto y el
      // thinking se come el max_tokens → respuesta vacía silenciosa.
      model: process.env.CLAUDE_EDITOR_MODEL || copyModel(),
      max_tokens: 1000,
      system: ACORTAR_SYSTEM,
      messages: [{ role: 'user', content: 'CONTEXTO (las placas completas):\n' + placasCtx + '\n\nReescribí estos textos dentro de su límite:\n' + lista }],
    }, ACORTAR_SCHEMA);
    const j = jsonRespuesta(resp) || {};
    const porId = new Map((j.items || []).map((it) => [Number(it.id), normalizarEspacios(it.texto)]));
    if (!porId.size) throw new Error('el editor devolvió vacío (stop: ' + resp.stop_reason + ')');
    ex.forEach((e, n) => {
      const nuevo = porId.get(n + 1);
      if (nuevo && palabras(nuevo).length <= e.max) {
        out.placas[e.i][e.clave] = nuevo; // reescrito y dentro del límite: entra en silencio
      } else if (nuevo && palabras(nuevo).length < e.palabras) {
        out.placas[e.i][e.clave] = nuevo; // más corto aunque no perfecto: mejor que el original
      }
      // si el editor no ayudó, queda el texto original ENTERO (jamás una frase colgada)
    });
  } catch (err) {
    console.error('[Gen editor] no pude acortar:', err.message);
    out.avisos = (out.avisos || []).concat(ex.map((e) =>
      'Ojo: ' + e.campo + ' quedó largo (' + e.palabras + ' palabras, ideal hasta ' + e.max + ')'));
  }
  return out;
}

async function generarCopy(instruccion, formato) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  let estilo = '';
  try { estilo = await guiaDeEstilo(); } catch (e) { /* referencia opcional */ }
  const sys = COPY_SYSTEM + (estilo
    ? '\n\nGUÍA DE ESTILO (de las placas de referencia). Describe lo VISUAL (paleta, ' +
      'tipografía, encuadre, mood). Las reglas de tono y de marca de arriba SIEMPRE ' +
      'prevalecen sobre el tono que sugiera esta guía; el lenguaje inclusivo sigue ' +
      'PROHIBIDO aunque la guía lo insinúe:\n' + estilo
    : '');
  const userMsg = 'Formato: ' + f + '\nInstrucción: ' + instruccion;
  const resp = await crearConSchema({
    model: copyModel(),
    max_tokens: 4000, // un carrusel de 5 placas con escenaIA no entraba en 1500
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
  }, COPY_SCHEMA);
  const out = jsonRespuesta(resp);
  if (!out) {
    throw new Error('La IA no devolvió un copy válido' +
      (resp.stop_reason === 'max_tokens' ? ' (respuesta cortada por límite de tokens).' : '.'));
  }
  out.placas = (out.placas || []).slice(0, FORMATOS[f].maxPlacas);
  // El diseño lo elige la IA según el contenido (campo estilo del schema); acá
  // solo se valida. El usuario puede cambiarlo después desde el selector.
  out.placas.forEach((p) => { if (!ESTILOS_ENUM.includes(p.estilo)) p.estilo = 'clasico'; });
  return acortarLargos(sanearCopy(out));
}

// ---- Ajuste con IA: el usuario ya vio la pieza y pide cambios ----
const AJUSTE_SYSTEM = `Sos el creativo de redes de Pizzería Popular (cadena argentina de
pizza al horno de leña en España). YA HAY una pieza armada y el usuario te da una
indicación para AJUSTARLA. Devolvé SOLO un JSON válido con los CAMBIOS:

{
  "caption": "...",
  "placas": [ { ...solo los campos que cambian en esa placa... } ]
}

REGLA DE ORO: cada campo que devolvés REEMPLAZA al actual; cada campo que OMITÍS queda
exactamente como está. Devolvé "placas" SIEMPRE con una entrada por placa, en el mismo
orden y cantidad que las actuales — pero dentro de cada placa incluí ÚNICAMENTE los
campos que la indicación pide cambiar. Si una placa no cambia, devolvé {} para esa
placa. Incluí "caption" SOLO si la indicación pide cambiar el caption/pie. NUNCA
devuelvas un campo con el mismo valor "por las dudas" ni reescribas ni muevas algo que
el usuario no pidió cambiar. Un campo con "" significa BORRAR ese texto de la placa:
usalo SOLO si la indicación pide sacar algo; jamás lo uses para "campo sin cambios"
(eso es OMITIR el campo). Y NUNCA agregues contenido a un campo que la indicación no
menciona: si no piden ubicación, no incluyas "lugar"; si no piden botón, no incluyas
"cta".

Campos por placa: "titulo" y "acento" (pincel dorado) son el par principal de la
gráfica; "bajada" (texto secundario), "cta" (botón), "lugar" (tag de ubicación, ej:
"Valencia", "Av. Niza 9, Alicante"; "" para sacarlo).
"estilo" es el DISEÑO de la pieza: clasico (sans, título arriba + pincel debajo),
editorial (serif gigante a la izquierda, una palabra del acento en dorado), titular
(una palabra gigante protagonista con kicker arriba), sandwich (anuncio: serif grande
+ cursiva dorada grande con contorno, arriba) o producto (título serif limpio abajo +
pincel + botón CTA, para carta/antojo). Incluílo solo si piden otro diseño o variar.
OJO: pedidos de TAMAÑO o POSICIÓN ("título más grande", "texto más arriba", "la cursiva
más chica") NO son un cambio de diseño — los maneja otro sistema; ante eso NO incluyas
"estilo" (y no cambies el texto).

PLACAS "Diseño: IA completa": algunas placas las dibuja ENTERAS una IA de imagen (lo
dice su ESTADO ACTUAL). Para ESAS placas, todo pedido VISUAL que no sea texto —tamaño,
posición, layout, colores, cómo van las banderas, la escena, la tipografía, "más
prolijo"— va en "notaDiseno": una instrucción corta y concreta para el director de
arte (ej: "las banderas en una fila prolija con un VS entre ambas, debajo del título").
En esas placas el sistema de tamaño/posición NO existe: usá "notaDiseno" también para
"título más grande". Los cambios de TEXTO siguen yendo en sus campos normales. Incluí
"notaDiseno" SOLO en las placas de diseño IA a las que apunta la indicación.

Reglas:
- Copy: título ≤6 palabras (sin punto final), acento 1-3 palabras, bajada ≤14, cta ≤4
  palabras. Tono argentino, cálido, de "vos". No inventes promos ni precios.
- El acento es el remate emocional en palabras. POR DEFECTO no metas fechas, horas,
  precios ni números ahí (van mejor en la bajada; en la cursiva brush se leen mal). PERO
  si la indicación pide EXPLÍCITAMENTE poner una fecha/hora/número en la cursiva o acento,
  hacelo: el pedido del usuario SIEMPRE manda sobre esta preferencia.
- PROHIBIDO el lenguaje inclusivo con x, e o @ (NUNCA "todxs", "todes", "amigues",
  "bienvenides"). Usá masculino genérico ("todos") o reformulá en neutro. Español rioplatense estándar.
- "logo": incluílo solo si la indicación habla del logo/colores/fondo (blanco para
  fondos oscuros, oscuro para claros).
- "cambiarFoto": true SOLO si la indicación pide otra foto o describe una imagen
  distinta ("cambiá la foto", "poné una de pizza", "que se vea el horno"...). Acompañalo
  con "fotoHint": frase corta de qué buscar (ej: "pizza apetitosa de cerca").
- "banderas": el ESTADO ACTUAL te muestra las vigentes de cada placa. Incluílas SOLO si
  la indicación las menciona: "agregá las banderas de España y Arabia Saudita"→["es","sa"],
  "poné Argentina y Francia"→["ar","fr"], "sacá las banderas"→[]. Si no las menciona, OMITILAS.
- "evento": el cartel de "modo evento" (tag dorado arriba del título, ej. "EN VIVO"), máx
  4 palabras. Incluílo SOLO si la indicación lo menciona: "poné el cartel de en vivo /
  modo evento"→"EN VIVO", "que el cartel diga X"→X, "sacá el cartel / sin el en vivo"→"".
  NUNCA inventes servicios (PROHIBIDO "pantalla gigante" salvo que lo diga la instrucción).`;

async function ajustarCopy(feedback, formato, placas, caption) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  // El estado incluye TODO lo que el modelo puede tocar (banderas y evento
  // incluidos): sin verlos no puede conservarlos, y un ajuste cualquiera se
  // los llevaba puestos.
  const estado = placas.map((p, i) =>
    (i + 1) + '. Título: "' + (p.titulo || '') + '"' +
    ' · Acento: "' + (p.acento || '') + '"' +
    ' · Bajada: "' + (p.bajada || '') + '"' +
    ' · CTA: "' + (p.cta || '') + '"' +
    ' · Lugar: "' + (p.lugar || '') + '"' +
    ' · Estilo: ' + (p.estilo || 'editorial') +
    ' · Logo: ' + (p.logo || 'wordmark-blanco') +
    ' · Banderas: ' + (Array.isArray(p.banderas) && p.banderas.length ? p.banderas.join(',') : '(ninguna)') +
    ' · Cartel evento: ' + (p.evento ? '"' + p.evento + '"' : '(ninguno)') +
    (p.modoIA === 'completa' ? ' · Diseño: IA completa (la placa entera la dibuja una IA de imagen)' : '') +
    (p.motivo ? ' · Foto actual: ' + p.motivo : '')).join('\n');
  const userMsg = 'Formato: ' + f + '\nCaption actual: ' + (caption || '') +
    '\n\nPLACAS ACTUALES:\n' + estado +
    '\n\nINDICACIÓN DEL USUARIO:\n' + feedback;
  const resp = await crearConSchema({
    model: copyModel(),
    max_tokens: 4000,
    system: AJUSTE_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  }, AJUSTE_SCHEMA);
  const out = jsonRespuesta(resp);
  if (!out) throw new Error('La IA no devolvió un ajuste válido.');
  out.placas = (out.placas || []).slice(0, FORMATOS[f].maxPlacas);
  return acortarLargos(sanearCopy(out));
}

// ---- Experto en prompts de imagen (afina el prompt ANTES de mandarlo a Gemini) ----
// El usuario tiene un borrador de escena + elementos a destacar (chips/texto a mano).
// En vez de PEGOTEAR esos elementos al final ("Destacá especialmente: ..."), este pase
// reteje TODO en un solo prompt fotográfico pulido y específico para Gemini. La calidad
// de la imagen depende del prompt, así que esto es donde se gana.
const PROMPT_GEMINI_SYSTEM = `Sos un director de fotografía y experto MUNDIAL en prompts para generadores de imágenes (Gemini). Te paso: el MENSAJE de la placa (contexto de la campaña), un BORRADOR de la escena, y ELEMENTOS A DESTACAR que pidió el usuario. Tu trabajo: devolver UN SOLO prompt fotográfico, pulido y específico, que integre todo de forma natural (NO pegotees los elementos al final: tejelos en la escena).

Devolvé SOLO el texto del prompt (en español), sin markdown, sin comillas, sin títulos ni explicaciones. 3 a 5 oraciones de prosa descriptiva.

Reglas del prompt:
- La foto es el FONDO de una placa para redes (formato VERTICAL). Composición pensada para vertical, con el sujeto principal en los dos tercios de arriba.
- Lo que el usuario pidió DESTACAR es PRIORIDAD: tiene que estar claramente presente y bien integrado en la escena, no como agregado.
- SIN gente y SIN texto (Gemini deforma caras y hornea letras). Producto, ambiente, fuego, detalles, texturas.
- Especificá como un DP: sujeto/escena concreta · luz (dirección y calidez) · lente y profundidad de campo (ej "35mm, f/2.0, foco selectivo, bokeh suave") · paleta cálida de marca (ámbar, dorado, rojo profundo, negro) · mood.
- El TERCIO INFERIOR queda en penumbra, liso y con aire (ahí va el texto de la placa).
- Cerrá SIEMPRE con: "Fotorrealista, alto detalle. Sin texto, sin letras, sin logos ni marcas de agua en ninguna parte."
- No inventes datos de la marca ni metas elementos que choquen con el mensaje.`;

async function afinarPromptIA({ contexto, borrador, destacar, formato } = {}) {
  const ratio = (formato === 'historia') ? 'vertical 9:16 (historia)' : 'vertical 4:5 (post)';
  const partes = [
    'Formato: ' + ratio,
    contexto ? 'Mensaje de la placa (contexto): ' + contexto : '',
    'Borrador de la escena:\n' + (String(borrador || '').trim() || '(vacío — proponé una escena a tema con el mensaje)'),
    (destacar && destacar.length) ? 'Elementos que el usuario quiere DESTACAR (prioridad): ' + destacar.join(', ') + '.' : '',
  ].filter(Boolean);
  const resp = await client.messages.create({
    model: copyModel(),
    max_tokens: 700,
    system: PROMPT_GEMINI_SYSTEM,
    messages: [{ role: 'user', content: partes.join('\n\n') }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  text = String(text || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!text) throw new Error('No pude afinar el prompt.');
  return text;
}

// ---- Escena IA para el HERO de un post del blog (foto apaisada, sin texto) ----
// Misma idea que escenaIA de las placas, pero el hero es HORIZONTAL y el título va
// montado ENCIMA (abajo-izquierda): la foto necesita "aire" en esa zona. Claude lee
// el tema del post y propone una escena fotográfica concreta para Gemini. La salida
// es una foto PURA (sin texto ni logo); el título del blog lo pone el CSS encima.
const HERO_BLOG_SYSTEM = `Sos un director de fotografía y experto MUNDIAL en prompts para generadores de imágenes (Gemini). Te paso el TÍTULO, la BAJADA y (si hay) un extracto del CONTENIDO de un artículo de blog de Pizzería Popular (cadena argentina de pizza al horno de leña en España). Devolvé UN SOLO prompt fotográfico en español para la FOTO DE PORTADA (hero) del artículo.

Devolvé SOLO el texto del prompt, sin markdown, sin comillas, sin títulos ni explicaciones. 3 a 5 oraciones de prosa descriptiva.

Reglas del prompt:
- La foto es la PORTADA HORIZONTAL (apaisada, 16:9) del artículo. El título del post va montado ENCIMA, abajo a la izquierda: dejá esa zona (mitad inferior, sobre todo a la izquierda) más lisa, en penumbra y con aire, para que el texto se lea sobre la foto.
- LEÉ EL TEMA del post y hacé que la escena lo REFLEJE de verdad (no pongas siempre lo mismo). Dos casos:
  · EVENTO / AMBIENTE (un partido, el Mundial, una fiesta, "vivilo con nosotros", el local lleno): el PROTAGONISTA es el CLIMA de vivirlo en la pizzería. Mostrá el interior cálido del local con un TELEVISOR encendido bien visible pasando el partido (se ve el verde de la cancha), HINCHADA festejando el fútbol, mesas con pizza al horno de leña y bebidas, banderas o camisetas si suma. Bien mundialista, festivo, lleno de energía y de gente. La pizza acompaña, NO tapa la escena.
  · PRODUCTO / GENERAL (la carta, una pizza nueva, el horno, una receta): foto apetitosa del producto y el ambiente del local; la gente es opcional y solo de fondo suave.
- GENTE: para las notas de evento/ambiente SÍ querés gente (da vida y verdad), PERO Gemini deforma las caras de frente. Entonces mostrá a las personas DE ESPALDAS o de 3/4 desde atrás, en SILUETA recortada contra la luz cálida o el resplandor del televisor, con los brazos en alto festejando, bufandas y camisetas, leve motion blur de celebración; las caras —si aparecen— chicas, giradas hacia la pantalla o suavemente fuera de foco. NUNCA primeros planos frontales de una cara. Grupos y clima, no retratos.
- Cartel HONESTO: un televisor/pantalla NORMAL pasando el partido. NUNCA prometas servicios que no existen (PROHIBIDO "pantalla gigante", y no inventes nada que no esté en el texto).
- SIN texto ni logos (Gemini hornea letras y marcas): nada de carteles, marcadores con números, nombres de equipos ni la letra P. El televisor muestra el juego (la cancha), no un marcador lleno de texto.
- Especificá como un DP: sujeto/escena concreta · luz (dirección y calidez) · lente y profundidad de campo (ej: "35mm, f/2.0, foco selectivo, bokeh suave") · paleta cálida de marca (ámbar, dorado, rojo profundo, negro) · mood.
- La mitad inferior izquierda queda más lisa y en penumbra (ahí va el título), pero el resto del cuadro puede estar lleno de vida.
- Fotorrealista, alto detalle. No inventes datos de la marca.`;

async function sugerirEscenaBlog({ titulo, subtitulo, contenido } = {}) {
  const extracto = String(contenido || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  const partes = [
    titulo ? 'Título: ' + titulo : '',
    subtitulo ? 'Bajada: ' + subtitulo : '',
    extracto ? 'Extracto del contenido: ' + extracto : '',
  ].filter(Boolean);
  if (!partes.length) partes.push('(sin datos del post — proponé una portada cálida y apetitosa de pizza al horno de leña)');
  const resp = await client.messages.create({
    model: copyModel(),
    max_tokens: 700,
    system: HERO_BLOG_SYSTEM,
    messages: [{ role: 'user', content: partes.join('\n') }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  text = String(text || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!text) throw new Error('No pude sugerir una escena.');
  return text;
}

// ---- Imagen con Gemini (se activa con GEMINI_API_KEY) ----
// Llamada cruda al endpoint de imágenes: recibe las parts ya armadas (texto y/o
// imágenes inline) y devuelve el Buffer. La usan el modo fondo (generarImagenIA)
// y el modo placa completa (generarPlacaCompletaIA).
async function llamarGemini(reqParts, aspecto) {
  if (!geminiDisponible()) {
    const e = new Error('Generación IA no disponible: falta GEMINI_API_KEY en el .env.');
    e.code = 'NO_KEY';
    throw e;
  }
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      // imageConfig: aspectRatio + (opcional) imageSize por env GEMINI_IMAGE_SIZE.
      // HISTORIA: con modelos viejos (jun 19), imageSize:'2K' degradaba a un BORRÓN ámbar
      // vacío. Con gemini-3.1-flash-image (jun 22) el 2K ANDA y devuelve 1536×2752 nítida
      // → la placa de 1080×1920 sale de un DOWNSCALE (más nítida) en vez de un upscale.
      // Por eso va por env (toggle sin deploy): si un modelo futuro lo rompe, se quita la
      // var y vuelve al default (768×1376). Valores: "1K" | "2K" | "4K".
      body: JSON.stringify({
        contents: [{ parts: reqParts }],
        generationConfig: {
          imageConfig: Object.assign(
            { aspectRatio: aspecto || '9:16' },
            process.env.GEMINI_IMAGE_SIZE ? { imageSize: process.env.GEMINI_IMAGE_SIZE } : {}
          ),
        },
      }),
    }
  );
  if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error('Gemini no devolvió una imagen.');
  return Buffer.from(img.inlineData.data, 'base64');
}

async function generarImagenIA(prompt, opts) {
  opts = opts || {};
  if (!geminiDisponible()) {
    // Cortar acá (y no recién en llamarGemini) evita armar el prompt/referencias al cuete.
    const e = new Error('Generación IA no disponible: falta GEMINI_API_KEY en el .env.');
    e.code = 'NO_KEY';
    throw e;
  }
  // Identidad de marca SIEMPRE presente en el prompt (Brand Kit editable en el
  // panel) + la guía de estilo de las placas de referencia si está activa.
  const reqParts = [];
  let promptFinal = prompt;
  try {
    const { kit } = await getBrandKit();
    promptFinal += '\n\n' + brandKitTexto(kit);
  } catch (e) { /* sin kit no se corta la generación */ }
  if (referenciaActiva()) {
    try {
      const estilo = await guiaDeEstilo();
      if (estilo) promptFinal += '\n\nEstética de marca a respetar (paleta, luz, mood):\n' + estilo;
    } catch (e) { /* referencia opcional */ }
  }
  // Modo "con referencia": se adjunta la foto seleccionada como guía VISUAL (paleta,
  // luz, mood e inspiración de la escena). Sin refBuf = modo "libre": solo el prompt
  // + la guía de estilo en texto, sin copiar el contenido de ninguna foto.
  if (opts.refBuf) {
    try {
      const small = await sharp(opts.refBuf).rotate()
        .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 78 }).toBuffer();
      promptFinal += '\n\nUsá la imagen adjunta como referencia de paleta, luz y mood, e inspiración de la escena. IGNORÁ por completo cualquier texto, logo, isotipo, la letra P o gráfica que aparezca en ella: NO los reproduzcas.';
      reqParts.push({ inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } });
    } catch (e) { /* si falla la referencia, sigue en modo libre */ }
  }
  // Restricción dura de "fondo limpio": Gemini no debe hornear texto ni logos
  // (después sharp compone el texto y el logo reales encima). Se repite al inicio
  // y al final porque el modelo respeta más las instrucciones en los extremos.
  const SIN_TEXTO = 'IMPORTANTE: generá SOLO una fotografía de fondo, fotorrealista. ' +
    'PROHIBIDO incluir texto, letras, palabras, números, tipografía, carteles, menús, ' +
    'logos, marcas de agua, isotipos o la letra P. Sin gráficos superpuestos. Dejá una ' +
    'zona (inferior o superior) más lisa y con poco detalle, con aire, para poder poner ' +
    'texto encima después. Foto pura y limpia.';
  promptFinal = SIN_TEXTO + '\n\n' + promptFinal + '\n\n' + SIN_TEXTO;
  reqParts.push({ text: promptFinal });
  return llamarGemini(reqParts, opts.aspecto);
}

// ---- Portada para Reel: imagen 9:16 LIMPIA (sin texto), para usar de portada de un
// reel. El título grande lo agrega después el usuario en su editor de reel — por eso
// la imagen deja el tercio inferior oscuro y vacío. Dos usos:
//  · generar: crea una portada editorial a partir de un TEMA (+ color opcional).
//  · limpiar: edita un FRAME real del reel sacándole subtítulos/stickers/emojis/UI.
// A diferencia de generarImagenIA, NO fuerza "solo fondo / ignorá la referencia": la
// limpieza necesita PRESERVAR la escena del frame (cara, pose, fondo) intacta.
function promptPortadaGenerar(tema, color) {
  return 'Photorealistic editorial cover photograph, vertical 9:16 format, cinematic and ' +
    'dramatic moody lighting with a deep ' + (color || 'warm amber') + '-toned palette. ' +
    'The image illustrates the theme: "' + tema + '".\n\n' +
    'Composition: a single strong subject — the object, symbolic element or scene that ' +
    'best represents the theme, OR an anonymous person (never a recognizable frontal ' +
    'face). Shoot it editorial and premium, with depth and atmosphere. Keep the LOWER ' +
    'THIRD of the frame darker, emptier and uncluttered, leaving clean negative space ' +
    'for a large title to be placed there later.\n\n' +
    'No commercial brands or logos. ABSOLUTELY NO TEXT of any kind: no letters, words, ' +
    'numbers, captions, titles, signatures, watermarks, labels, frames or borders. ' +
    'Do not write or sign anything anywhere in the image.';
}
const PROMPT_PORTADA_LIMPIAR = 'You are editing this real photograph (a video frame). ' +
  'Remove ALL overlaid elements that are not part of the real scene: burned-in ' +
  'captions/subtitles, handle stickers, 3D cartoon/emoji characters, progress bars and ' +
  'UI icons. Reconstruct naturally whatever was behind them. Do NOT change anything else ' +
  '— keep the face, expression, hair, pose, clothing, lighting and background exactly ' +
  'identical. Photorealistic, same quality. Output a clean 9:16 image with no text, ' +
  'stickers, emojis or logos.';

async function generarPortadaReel({ modo, tema, color, frameBuf } = {}) {
  if (!geminiDisponible()) {
    const e = new Error('La portada para reel necesita la IA de imágenes: falta GEMINI_API_KEY en el .env.');
    e.code = 'NO_KEY';
    throw e;
  }
  let reqParts;
  if (modo === 'limpiar') {
    if (!frameBuf) throw new Error('Subí un frame del reel para limpiar.');
    const frame = await sharp(frameBuf).rotate()
      .resize(1080, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 }).toBuffer();
    reqParts = [
      { inlineData: { mimeType: 'image/jpeg', data: frame.toString('base64') } },
      { text: PROMPT_PORTADA_LIMPIAR },
    ];
  } else {
    const t = String(tema || '').trim();
    if (!t) throw new Error('Contame el tema de la portada.');
    reqParts = [{ text: promptPortadaGenerar(t, String(color || '').trim()) }];
  }
  const buf = await llamarGemini(reqParts, '9:16');
  // Encuadre exacto 1080×1920 (Gemini puede devolver 1536×2752 u otro múltiplo 9:16).
  return sharp(buf).resize(1080, 1920, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

// ============================================================
// MODO "PLACA COMPLETA IA": Gemini diseña la placa ENTERA
// (fondo + textos + gráfica) guiada por el Brand Kit. El flujo:
//   1. redactarPromptPlaca — un director de arte (Claude) escribe
//      el prompt completo con los textos EXACTOS entre comillas.
//   2. llamarGemini con 1-2 placas de referencia adjuntas.
//   3. verificarPlacaIA — Claude vision LEE los textos renderizados
//      y los compara con el copy; si un dato salió mal → se
//      regenera UNA vez pasándole los errores como feedback.
//   4. El logo real se compone SIEMPRE encima con sharp (la
//      tipografía IA es aproximada; el logo no se negocia).
// Trade-off asumido: la tipografía exacta (Abuget/Abril) solo
// existe en el modo clásico; este modo la APROXIMA.
// ============================================================

// Nombres de países para redactar/verificar banderas (códigos ISO alpha-2).
// Intl.DisplayNames resuelve CUALQUIER código en español (Argelia, Qatar, etc.);
// el mapa cubre los casos donde la marca prefiere otro nombre que el oficial.
const PAISES = { gb: 'Inglaterra', us: 'Estados Unidos', sa: 'Arabia Saudita' };
let _displayNames = null;
try { _displayNames = new Intl.DisplayNames(['es'], { type: 'region' }); } catch (e) { /* ICU sin español: cae al mapa */ }
function nombrePais(code) {
  const c = String(code || '').toLowerCase();
  if (PAISES[c]) return PAISES[c];
  if (_displayNames && c.length === 2) {
    try {
      const n = _displayNames.of(c.toUpperCase());
      if (n && n !== c.toUpperCase()) return n;
    } catch (e) { /* código inválido: cae abajo */ }
  }
  return c.toUpperCase();
}

// Cómo se ve cada diseño, en palabras (para que el redactor lo describa a Gemini).
const LAYOUT_IA = {
  clasico: 'título en sans bold mayúsculas + debajo el remate en caligrafía dorada grande; bajada chica abajo',
  editorial: 'titular serif gigante de alto contraste alineado a la IZQUIERDA, en mayúsculas, con UNA palabra clave en dorado y el resto en blanco',
  titular: 'UNA palabra protagonista GIGANTE en serif, con una línea chica en mayúsculas espaciadas arriba y el remate en caligrafía dorada debajo',
  sandwich: 'dos líneas grandes en serif mayúsculas con el remate en caligrafía dorada ENORME en el medio, todo centrado (estilo afiche de anuncio)',
  producto: 'título serif elegante abajo + subtítulo en caligrafía dorada, foto del producto protagonista arriba',
};

const REDACTOR_SYSTEM = `Sos director de arte de Pizzería Popular y experto MUNDIAL en prompts para generadores de imágenes que renderizan TEXTO (Gemini). Tu trabajo: redactar UN prompt en español para que Gemini genere una PLACA DE REDES COMPLETA, ya diseñada, con los textos incluidos.

Te paso la identidad de marca, el formato, los TEXTOS EXACTOS de la placa y una escena base. Devolvé SOLO el texto del prompt (sin markdown, sin comillas alrededor, sin explicaciones). Estructuralo así, en prosa clara:

1. Qué es: "Diseño de placa vertical para redes sociales de una pizzería argentina de horno de leña" + el mood.
2. La ESCENA fotográfica de fondo (a partir de la escena base): sujeto, luz, lente, paleta. Fotorrealista.
3. Los TEXTOS, uno por uno, cada uno ENTRE COMILLAS DOBLES con su rol, tipografía (según la identidad de marca), color, tamaño relativo y ubicación. Instrucción explícita: "escribí cada texto EXACTAMENTE como está entre comillas, letra por letra, con sus tildes y eñes, sin cambiar ni agregar palabras".
4. La composición: formato vertical; el bloque de texto va en los dos tercios inferiores, agrupado y con jerarquía clara; la FRANJA SUPERIOR CENTRAL queda DESPEJADA, solo foto con aire (ahí se monta el logo real después). Margen respirado en los bordes.
5. Si hay CTA: es un botón pill dorado con el texto en oscuro. Si hay ubicación: etiqueta chica en mayúsculas espaciadas. Si hay cartel de evento: pill dorado chico en mayúsculas arriba del título. Si hay banderas: las banderas REALES de esos países (nombralos por nombre), chicas y prolijas, en fila con "VS" entre ambas.
6. Negativos, SIEMPRE al final: "No agregues NINGÚN otro texto, palabra, número, marca de agua ni firma fuera de los textos indicados. No dibujes carteles, pills, tags, sellos ni etiquetas que no estén en la lista de textos (si no hay cartel de evento en la lista, NO va ningún pill arriba del título). No escribas como texto decorativo ninguna palabra de esta descripción: ni el nombre de la marca, ni 'pizzería argentina', ni nombres de países o tipografías. No dibujes ningún logo, isotipo ni la letra P suelta: el logo real se agrega después. Sin caras humanas en primer plano. Sin faltas de ortografía."

Reglas:
- Los textos van EXACTOS como te los paso (no los corrijas, no los traduzcas, no los completes).
- Cada texto aparece UNA sola vez en la placa (nunca repitas un cartel o frase en dos lugares).
- Describí los colores SIEMPRE con palabras (dorado cálido, rojo profundo, ámbar), NUNCA con códigos hex tipo #D8A460: el generador los dibuja como texto en la imagen.
- Máximo 2 familias tipográficas + la caligrafía dorada del remate. La caligrafía es SIEMPRE dorada e inclinada, estilo pincel fino.
- No inventes textos, promos ni servicios. Si un campo viene vacío, no existe en la placa.
- Si te paso INDICACIONES DE DISEÑO del usuario, tienen PRIORIDAD sobre cualquier regla de layout (nunca sobre los textos exactos). Si las indicaciones piden AGREGAR un texto (ej: los nombres de los países junto a las banderas), incluilo como un texto más, entre comillas dobles y EXACTO, con su rol y ubicación.
- Si te paso ERRORES DEL INTENTO ANTERIOR, corregilos explícitamente en el prompt (repetí el texto que salió mal y aclará cómo debe escribirse).
- 6 a 10 oraciones. Concreto, visual, sin relleno.`;

async function redactarPromptPlaca({ placa, formato, feedback } = {}) {
  const { kit } = await getBrandKit();
  const esHistoria = formato === 'historia';
  const textos = [
    placa.evento ? 'Cartel de evento (pill dorado): "' + String(placa.evento).toUpperCase() + '"' : '',
    placa.titulo ? 'Título: "' + placa.titulo + '"' : '',
    placa.acento ? 'Remate en caligrafía dorada: "' + placa.acento + '"' : '',
    placa.bajada ? 'Bajada (texto secundario chico): "' + placa.bajada + '"' : '',
    placa.cta ? 'Botón (CTA): "' + placa.cta + '"' : '',
    placa.lugar ? 'Ubicación (etiqueta chica): "' + placa.lugar + '"' : '',
  ].filter(Boolean);
  const banderas = (Array.isArray(placa.banderas) && placa.banderas.length >= 2)
    ? 'Banderas en fila con VS: ' + nombrePais(placa.banderas[0]) + ' vs ' + nombrePais(placa.banderas[1])
    : '';
  const partes = [
    brandKitTexto(kit),
    'Formato: vertical ' + (esHistoria ? '9:16 (historia de Instagram)' : '4:5 (post de Instagram)') + '.',
    'Layout de inspiración: ' + (LAYOUT_IA[placa.estilo] || LAYOUT_IA.clasico) + '.',
    'TEXTOS EXACTOS de la placa (los únicos que pueden aparecer):\n' + (textos.join('\n') || '(sin textos: placa solo visual)'),
    banderas,
    'Escena base para el fondo:\n' + (String(placa.iaPrompt || placa.escenaIA || '').trim() || 'Foto cálida de pizza al horno de leña, mesa de madera, luz dorada.'),
    placa.notasDiseno ? 'INDICACIONES DE DISEÑO del usuario (prioridad):\n' + placa.notasDiseno : '',
    feedback ? 'ERRORES DEL INTENTO ANTERIOR (corregilos sí o sí):\n' + feedback : '',
  ].filter(Boolean);
  const resp = await client.messages.create({
    model: copyModel(),
    max_tokens: 1000,
    system: REDACTOR_SYSTEM,
    messages: [{ role: 'user', content: partes.join('\n\n') }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  text = String(text || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!text) throw new Error('El redactor no devolvió un prompt.');
  return text;
}

// Verificación OBLIGATORIA con Claude vision: lee los textos renderizados y los
// compara con el copy. Un dato duro mal escrito = error grave → regenerar.
const VERIFICACION_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    errores: { type: 'array', items: { type: 'string' } },
    avisos: { type: 'array', items: { type: 'string' } },
    leido: { type: 'string' },
  },
  required: ['ok', 'errores', 'avisos', 'leido'],
  additionalProperties: false,
};

const VERIFICACION_SYSTEM = `Sos el control de calidad de placas de redes de Pizzería Popular. Te paso una placa GENERADA POR IA y la lista de TEXTOS que DEBEN aparecer. Compará LETRA POR LETRA lo renderizado contra lo esperado y devolvé un JSON:

{ "ok": true/false, "errores": [...], "avisos": [...], "leido": "..." }

- "errores" (GRAVES, obligan a regenerar): un texto esperado que falta o está MAL ESCRITO (faltas de ortografía, tildes mal, letras deformes o ilegibles, palabras cambiadas); un texto esperado que aparece DUPLICADO (la misma frase dos veces en la placa); texto INVENTADO que no está en la lista (palabras, números, precios, carteles, códigos de color, inscripciones en la ropa/camisetas — lo que sea legible); texto o carteles en la FRANJA SUPERIOR CENTRAL (esa zona debe quedar libre: ahí se monta el logo real después); un logo, isotipo o letra P dibujados (el logo real se agrega después: NO debe haber ninguno); una bandera de país incorrecta si se esperaban banderas.
- "avisos" (menores, NO obligan a regenerar): contraste flojo, texto muy pegado al borde, jerarquía confusa, tipografía que no respeta el estilo pedido.
- "leido": TODO el texto que ves en la placa, transcripto tal cual.
- "ok": true solo si "errores" está vacío.

Tolerancia: mayúsculas/minúsculas y saltos de línea NO son error (el diseño puede poner un texto en mayúsculas o partirlo en dos líneas). Un texto esperado que aparece completo y bien escrito está BIEN aunque cambie de caja. El "VS" entre las banderas es parte esperada de la fila de banderas: NUNCA lo listes, ni como error ni como aviso. En "errores" va SOLO lo que obliga a regenerar: si algo "está permitido" o "no es error", no lo pongas en ninguna lista. Sé estricto con la ortografía y los datos (fechas, horas, nombres): ahí no hay tolerancia.`;

async function verificarPlacaIA(buf, placa) {
  const esperados = [
    placa.evento && 'Cartel de evento: "' + String(placa.evento).toUpperCase() + '"',
    placa.titulo && 'Título: "' + placa.titulo + '"',
    placa.acento && 'Remate en caligrafía: "' + placa.acento + '"',
    placa.bajada && 'Bajada: "' + placa.bajada + '"',
    placa.cta && 'Botón: "' + placa.cta + '"',
    placa.lugar && 'Ubicación: "' + placa.lugar + '"',
  ].filter(Boolean);
  const banderas = (Array.isArray(placa.banderas) && placa.banderas.length >= 2)
    ? 'Deben verse las banderas de ' + nombrePais(placa.banderas[0]) + ' y ' + nombrePais(placa.banderas[1]) + ' (en ese orden, con un VS).'
    : 'No se esperan banderas.';
  // Las notas de diseño pueden AGREGAR textos (ej. nombres junto a las banderas):
  // esos textos también son esperados — sin esto, el verificador marcaría como
  // "inventado" algo que el usuario pidió a propósito.
  const notas = String(placa.notasDiseno || '').trim()
    ? 'NOTAS DE DISEÑO del usuario (si piden agregar un texto, ese texto TAMBIÉN es esperado y NO es error):\n' + String(placa.notasDiseno).trim()
    : '';
  const thumb = await sharp(buf).resize(768, 1366, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 }).toBuffer();
  const resp = await crearConSchema({
    model: copyModel(),
    max_tokens: 900,
    system: VERIFICACION_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') } },
        { type: 'text', text: 'TEXTOS ESPERADOS (los únicos que pueden aparecer):\n' + (esperados.join('\n') || '(ninguno: placa solo visual)') + '\n\n' + banderas + (notas ? '\n\n' + notas : '') },
      ],
    }],
  }, VERIFICACION_SCHEMA);
  const out = jsonRespuesta(resp);
  if (!out || typeof out.ok !== 'boolean') throw new Error('La verificación no devolvió un veredicto válido.');
  out.errores = Array.isArray(out.errores) ? out.errores.map(String).filter(Boolean) : [];
  out.avisos = Array.isArray(out.avisos) ? out.avisos.map(String).filter(Boolean) : [];
  return out;
}

// Hasta 2 placas de referencia (las más recientes de la carpeta de Drive) como
// guía VISUAL del estilo terminado. Si no hay carpeta, sigue sin referencia.
async function referenciasParaGemini() {
  if (!referenciaActiva()) return [];
  try {
    const imgs = (await listarReferencias())
      .slice()
      .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')))
      .slice(0, 2);
    const parts = [];
    for (const img of imgs) {
      try {
        const buf = await downloadFile(img.id);
        const small = await sharp(buf).rotate().resize(640, 640, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 76 }).toBuffer();
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } });
      } catch (e) { /* esa referencia no bajó: sigue */ }
    }
    return parts;
  } catch (e) { return []; }
}

// Genera la placa completa con verificación y UN reintento con feedback.
// Devuelve { buf, avisos } — si el reintento también falla, devuelve el mejor
// intento con los errores como avisos visibles (el usuario decide).
async function generarPlacaCompletaIA(placa, formato) {
  if (!geminiDisponible()) {
    const e = new Error('El modo placa completa necesita la IA de imágenes: falta GEMINI_API_KEY en el .env.');
    e.code = 'NO_KEY';
    throw e;
  }
  const ASPECTO_IA = { historia: '9:16', post: '4:5', carrusel: '4:5' };
  const refParts = await referenciasParaGemini();
  // Foto REAL del local (si el copy la eligió por "ambienteReal"): viaja a Gemini
  // como referencia de AMBIENTACIÓN de la escena. Si no baja, se genera igual.
  let ambParte = null;
  if (placa.fotoUrl) {
    try {
      const r = await fetch(placa.fotoUrl);
      if (r.ok) {
        const small = await sharp(Buffer.from(await r.arrayBuffer()))
          .resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        ambParte = { inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } };
      }
    } catch (e) { /* referencia opcional */ }
  }
  let feedback = '';
  let mejor = null; // { buf, verif } con menos errores hasta ahora
  const avisos = [];
  for (let intento = 1; intento <= 2; intento++) {
    const prompt = await redactarPromptPlaca({ placa, formato, feedback });
    const notas = [];
    if (refParts.length) notas.push('Las primeras ' + refParts.length + ' imágenes adjuntas son placas REALES de la marca: usalas como referencia de estilo gráfico (paleta, clima, jerarquía). NO copies sus textos, ni sus carteles/pills, ni reproduzcas su logo.');
    if (ambParte) notas.push((refParts.length ? 'La última imagen adjunta' : 'La imagen adjunta') + ' es una foto REAL de nuestro local: usala como referencia de la AMBIENTACIÓN de la escena (arquitectura, materiales, mobiliario, iluminación). No copies su encuadre literal, y NO reproduzcas los letreros, carteles ni textos que aparezcan en esa foto: ningún texto de la foto va en la placa.');
    const parts = [...refParts, ...(ambParte ? [ambParte] : []),
      { text: (notas.length ? notas.join(' ') + '\n\n' : '') + prompt }];
    const buf = await llamarGemini(parts, ASPECTO_IA[formato] || '4:5');
    let verif;
    try {
      verif = await verificarPlacaIA(buf, placa);
    } catch (e) {
      // Si la verificación falla (no la placa), no bloqueamos: se entrega con aviso.
      avisos.push('No pude verificar los textos de la placa (' + e.message + '): revisala a ojo.');
      return { buf, avisos };
    }
    if (!mejor || verif.errores.length < mejor.verif.errores.length) mejor = { buf, verif };
    if (verif.ok) {
      verif.avisos.forEach((a) => avisos.push(a));
      return { buf, avisos };
    }
    feedback = verif.errores.join(' · ');
    console.error('[Gen placa IA] intento ' + intento + ' con errores:', feedback);
  }
  // Dos intentos con errores: se entrega el mejor, con los errores A LA VISTA.
  // fallida=true evita que esta placa se cachee: volver a componer = otro intento.
  mejor.verif.errores.forEach((e) => avisos.push('⚠️ La IA no logró escribir bien: ' + e + ' — tocá «Componer piezas» de nuevo para otro intento, o probá el modo clásico.'));
  mejor.verif.avisos.forEach((a) => avisos.push(a));
  return { buf: mejor.buf, avisos, fallida: true };
}

// Termina la placa IA: escala al lienzo exacto, badge de carrusel y LOGO REAL
// encima con sharp (la franja superior quedó despejada por prompt).
async function terminarPlacaIA(buf, placa, formato, numero, total) {
  const { w, h } = FORMATOS[formato] || FORMATOS.carrusel;
  const esHistoria = h > 1500;
  const base = await sharp(buf).resize(w, h, { fit: 'cover', position: 'centre' }).toBuffer();
  const capas = [];
  if (total > 1) {
    const badge = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
      '<text x="' + (w - 70) + '" y="' + (esHistoria ? 175 : 135) + '" text-anchor="end" font-family="' + SANS + '" font-weight="bold" font-size="30" fill="' + GOLD + '">' + numero + '/' + total + '</text></svg>';
    capas.push({ input: Buffer.from(badge), left: 0, top: 0 });
  }
  const logo = await prepararLogo(placa.logo || LOGO_DEFAULT, w, h, 'arriba');
  if (logo) capas.push(...logo.capas);
  return sharp(base).composite(capas).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

// Firma de los campos que definen el DISEÑO de la placa IA: si no cambió, la
// imagen cacheada se reusa (regenerar en cada recompose era la fricción #1).
function firmaPlacaIA(placa) {
  return JSON.stringify([
    placa.titulo || '', placa.acento || '', placa.bajada || '', placa.cta || '',
    placa.lugar || '', placa.evento || '', placa.banderas || [], placa.estilo || '',
    String(placa.iaPrompt || placa.escenaIA || ''), placa.notasDiseno || '',
    placa.fotoUrl || '', // referencia de ambientación: cambiarla = regenerar
  ]);
}

// ---- Composición con sharp ----
function escXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Corte de línea simple por cantidad de caracteres.
function wrap(texto, maxChars) {
  const words = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

// Tipografías de marca.
const SERIF = 'Abril Fatface';   // serif de alto contraste, para titulares "logrados"
const SANS = 'Montserrat';       // sans, mayúsculas
const BRUSH = 'Abuget';          // cursiva del manual de marca, remate emocional dorado

// 5 diseños. 'clasico' es el aprobado (sans + pincel, centrado). Los otros 4
// están inspirados en las placas de referencia y son DISTINTOS entre sí en
// posición, tipografía y recursos:
//   · editorial → titular SERIF gigante, alineado a la IZQUIERDA arriba, con una
//                 palabra en dorado sólido (ref "HOY NO PUEDO, TENGO PLANES:").
//   · titular   → palabra SERIF GIGANTE protagonista, kicker arriba, pincel debajo
//                 (ref "BENIDORM / estamos llegando").
//   · sandwich  → pincel dorado al MEDIO entre dos líneas en mayúscula + pin de
//                 ubicación (ref "¡Vente a / Playa San Juan / a vivir...").
//   · producto  → título SERIF limpio ABAJO + pincel de subtítulo, para carta
//                 (ref "Milanesa Buenos Aires / fugazzeta").
// 'font': sans|serif del título. 'align': center|left. 'anchor': posición vertical
// FIJA (identidad del diseño) o 'auto' (la decide el criterio según la foto).
const DISENOS = {
  clasico:   { orden: ['titulo', 'acento', 'bajada', 'cta'], font: 'sans',  align: 'left',   anchor: 'auto',   aFactor: 1.0, lugarBadge: true },
  editorial: { orden: ['titulo', 'acentoGold', 'bajada', 'cta'], font: 'serif', align: 'left',   anchor: 'arriba', upper: true, lugarBadge: true },
  titular:   { orden: ['kicker', 'titulo', 'acento', 'cta'],        font: 'serif', align: 'left',   anchor: 'abajo',  titGigante: true, aFactor: 1.0, lugarBadge: true },
  sandwich:  { orden: ['titulo', 'acento'], font: 'serif', align: 'center', anchor: 'arriba', titGrande: true, acentoHero: true, lugarBadge: true },
  producto:  { orden: ['titulo', 'acento', 'cta'],                  font: 'serif', align: 'left',   anchor: 'abajo',  titGrande: true, acentoHero: true, gapFactor: 0.32, lugarBadge: true },
};
const DISENO_LIST = ['clasico', 'editorial', 'titular', 'sandwich', 'producto'];
const ESTILO_LIST = DISENO_LIST; // alias

// Alineación horizontal EFECTIVA: el retoque (adj.align, en lenguaje natural) puede
// pisar la del estilo. 'izquierda'|'centro'|'derecha' → 'left'|'center'|'right'.
// Si no hay retoque, manda la del diseño.
function alineacion(dis, adj) {
  const map = { izquierda: 'left', centro: 'center', derecha: 'right' };
  const a = adj && map[adj.align];
  if (a) return a;
  return (dis && dis.align) === 'center' ? 'center' : 'left';
}

// Degradado más suave (menos "filtrado") según dónde va el texto.
function gradiente(trato, W, H) {
  if (trato === 'arriba') {
    return '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#000" stop-opacity=".74"/>' +
      '<stop offset=".4" stop-color="#000" stop-opacity=".28"/>' +
      '<stop offset=".7" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity=".15"/></linearGradient>';
  }
  if (trato === 'centro') {
    return '<radialGradient id="g" cx="50%" cy="50%" r="72%">' +
      '<stop offset="0" stop-color="#000" stop-opacity=".6"/>' +
      '<stop offset=".55" stop-color="#000" stop-opacity=".34"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity=".1"/></radialGradient>';
  }
  // abajo (default): degradado vertical, más liviano que antes
  return '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#000" stop-opacity=".34"/>' +
    '<stop offset=".42" stop-color="#000" stop-opacity="0"/>' +
    '<stop offset=".66" stop-color="#000" stop-opacity=".34"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity=".8"/></linearGradient>';
}

// Texto con sombra suave (para que lea sobre cualquier parte de la foto).
function txtSombra(x, y, attrs, contenido, fill) {
  return '<text x="' + x + '" y="' + (y + 3) + '" ' + attrs + ' fill="#000" opacity=".5">' + contenido + '</text>' +
    '<text x="' + x + '" y="' + y + '" ' + attrs + ' fill="' + fill + '">' + contenido + '</text>';
}

// Prepara las FILAS de texto del diseño (cada una con su draw(yTop)). El apilado
// real lo hace componerTexto midiendo la tinta de cada fila (no la caja de la
// fuente), para que el bloque quede agrupado y parejo.
function prepararTexto(placa, W, H) {
  const esHistoria = H > 1500;
  const dis = DISENOS[placa.estilo] || DISENOS.clasico;
  const adj = placa.adj || {}; // retoque de diseño en lenguaje natural (escalas, ocultar)

  const margenL = esHistoria ? 80 : 70;
  const margenB = esHistoria ? 118 : 92;
  const ancho = W - 2 * margenL;
  const cx = W / 2;

  // Alineación horizontal. La define el estilo, pero el retoque (adj.align) la pisa:
  // "centrá el texto"→center, "a la izquierda"→left, "a la derecha"→right.
  const align = alineacion(dis, adj);
  const isLeft = align === 'left';
  const isRight = align === 'right';
  const ax = isLeft ? margenL : isRight ? (W - margenL) : cx;
  const anchor = isLeft ? 'start' : isRight ? 'end' : 'middle';
  const esSerif = dis.font === 'serif';
  const titFont = esSerif ? SERIF : SANS;

  const lugSize = 27;
  // Tamaño del título según el diseño.
  let tSize;
  if (dis.titGigante) tSize = esHistoria ? 168 : 146;        // titular: palabra gigante
  else if (placa.estilo === 'editorial') tSize = esHistoria ? 106 : 92; // editorial: serif grande
  else if (dis.titGrande) tSize = esHistoria ? 111 : 98;     // sandwich/anuncio: serif (Canva +25%)
  else if (esSerif) tSize = esHistoria ? 104 : 92;           // producto: serif (título protagonista, grande)
  else if (dis.lead) tSize = esHistoria ? 38 : 34;           // sandwich: título = eyebrow chico
  else tSize = esHistoria ? 56 : 50;                         // clasico: sans
  // Titular (palabra gigante): si el título es largo, achicar para que no desborde.
  if (dis.titGigante) {
    const t = String(placa.titulo || '').trim();
    if (t) {
      const fit = Math.floor((W - 2 * (esHistoria ? 80 : 70)) / (t.length * 0.6));
      tSize = Math.min(tSize, Math.max(esHistoria ? 64 : 56, fit));
    }
  }
  if (adj.tituloScale) tSize = Math.round(tSize * adj.tituloScale); // retoque: título +/-
  let bSize = esHistoria ? 34 : 31;
  if (adj.bajadaScale) bSize = Math.round(bSize * adj.bajadaScale); // retoque: bajada +/-
  const kickSize = esHistoria ? 68 : 60; // kicker (titular "MUY PRONTO") al doble

  // Acento (cursiva Abuget). Es HERO (grande) salvo en 'producto', donde es un
  // subtítulo chico. Abuget rinde visualmente más chica, así que va generosa. Siempre
  // en UNA línea: se achica al ancho disponible, nunca se parte.
  const acentoTxt = String(placa.acento || '').trim();
  let aSize = dis.acentoChico
    ? Math.round(tSize * 0.95)
    : Math.round((dis.acentoHero ? (esHistoria ? 262 : 230) : (esHistoria ? 196 : 168)) * (dis.aFactor || 1));
  if (acentoTxt) {
    const div = dis.acentoHero ? 0.305 : 0.46; // hero usa más ancho → más grande (Canva +25%)
    const fit = Math.floor(ancho / (acentoTxt.length * div));
    const minA = dis.acentoChico ? (esHistoria ? 54 : 48) : (esHistoria ? 104 : 90);
    aSize = Math.min(aSize, Math.max(minA, fit));
  }
  if (adj.acentoScale) aSize = Math.round(aSize * adj.acentoScale); // retoque: cursiva +/-

  const lugar = String(placa.lugar || '').trim();
  const titMax = dis.titGigante ? 99
    : (esSerif ? (esHistoria ? 16 : 17) : (esHistoria ? 22 : 24));
  // Retoque "título en una sola línea": no se parte; va entero en un renglón y el
  // autofit horizontal de componerPlaca lo achica para que entre a lo ancho.
  const tLines = adj.tituloUnaLinea ? [String(placa.titulo || '').trim()].filter(Boolean)
    : wrap(placa.titulo, titMax);
  const aLines = acentoTxt ? [acentoTxt] : []; // la cursiva va siempre en una línea
  const bLines = wrap(placa.bajada, esHistoria ? 40 : 42);

  // Métricas de TINTA REAL (no la caja de la fuente). Cada fila se mide por el alto
  // visible de sus letras → al apilar con un espacio óptico ÚNICO (GAP), el bloque
  // queda agrupado y parejo, sin aire de sobra entre líneas.
  const GAP = Math.round((esHistoria ? 16 : 12) * (dis.gapFactor || 1));
  const ctaH = placa.cta ? 104 : 0;
  // ascenso (base desde el tope) y descenso de cada tipo de texto:
  const tAsc = Math.round(tSize * (esSerif ? 0.72 : 0.74));
  const tDesc = Math.round(tSize * (esSerif ? 0.16 : 0.07));
  const tStep = Math.round(tSize * (esSerif ? 1.0 : 1.06)); // entre líneas del mismo título
  const aAsc = Math.round(aSize * 0.54), aDesc = Math.round(aSize * 0.24);
  const bAsc = Math.round(bSize * 0.74), bDesc = Math.round(bSize * 0.22), bStep = Math.round(bSize * 1.26);
  const kAsc = Math.round(kickSize * 0.76), kDesc = Math.round(kickSize * 0.12);
  const lAsc = Math.round(lugSize * 0.78), lDesc = Math.round(lugSize * 0.12);
  const bcAsc = Math.round(kickSize * 0.76), bcDesc = Math.round(kickSize * 0.12), bcStep = Math.round(kickSize * 1.16);

  // Cada fila: { h (alto de tinta), gap (después), draw(yTop) }. La base de cada
  // texto se ubica en yTop+ascenso, así no hay aire arriba de las letras.
  const fila = {
    tag: () => lugar ? { h: lAsc + lDesc, gap: GAP, draw(yTop) {
      const y = yTop + lAsc;
      const txt = '<tspan fill="' + GOLD + '">•</tspan>  ' + escXml(lugar.toUpperCase());
      const a = 'font-family="' + SANS + '" font-weight="bold" font-size="' + lugSize + '" letter-spacing="2" text-anchor="' + anchor + '"';
      return '<text x="' + ax + '" y="' + (y + 2) + '" ' + a + ' fill="#000" opacity=".45">' + txt + '</text>' +
        '<text x="' + ax + '" y="' + y + '" ' + a + ' fill="#fff">' + txt + '</text>';
    } } : null,
    // Kicker (titular): bajadita en mayúscula chica arriba de la palabra gigante.
    // Usa la tipografía principal del diseño (no suma una 3ª familia).
    kicker: () => { const k = String(placa.bajada || '').trim(); return k ? { h: kAsc + kDesc, gap: GAP, draw(yTop) {
      const w = esSerif ? '' : ' font-weight="bold"';
      const a = 'font-family="' + titFont + '"' + w + ' font-size="' + kickSize + '" letter-spacing="' + (esSerif ? 4 : 5) + '" text-anchor="' + anchor + '"';
      return txtSombra(ax, yTop + kAsc, a, escXml(k.toUpperCase()), '#fff');
    } } : null; },
    titulo: () => tLines.length ? { h: (tLines.length - 1) * tStep + tAsc + tDesc, gap: GAP, draw(yTop) {
      let base = yTop + tAsc, s = '';
      const upper = !esSerif || dis.upper;
      const ls = esSerif ? (dis.titGigante ? '2' : '1') : (dis.lead ? '8' : '3');
      const w = esSerif ? '' : ' font-weight="bold"';
      for (const line of tLines) {
        const a = 'font-family="' + titFont + '"' + w + ' font-size="' + tSize + '" letter-spacing="' + ls + '" text-anchor="' + anchor + '"';
        s += txtSombra(ax, base, a, escXml(upper ? line.toUpperCase() : line), '#fff');
        base += tStep;
      }
      return s;
    } } : null,
    // Acento dorado SÓLIDO (editorial): palabra clave en serif, mismo cuerpo que el título.
    acentoGold: () => acentoTxt ? { h: tAsc + tDesc, gap: GAP, draw(yTop) {
      const a = 'font-family="' + SERIF + '" font-size="' + tSize + '" letter-spacing="1" text-anchor="' + anchor + '"';
      return txtSombra(ax, yTop + tAsc, a, escXml(acentoTxt.toUpperCase()), GOLD);
    } } : null,
    // Acento cursiva (clasico/titular/sandwich/producto). CONTORNO negro nítido
    // (stroke) para que la Abuget despegue sobre cualquier fondo — limpio, no halo.
    acento: () => aLines.length ? { h: aAsc + aDesc, gap: GAP, draw(yTop) {
      const base = yTop + aAsc;
      const a = 'font-family="' + BRUSH + '" font-size="' + aSize + '" text-anchor="' + anchor + '"';
      const t = escXml(aLines[0]);
      const sw = Math.max(2, Math.round(aSize * 0.012)); // contorno fino: no engorda la Abuget
      return '<text x="' + ax + '" y="' + base + '" ' + a + ' fill="#000" stroke="#000" stroke-width="' + sw + '" stroke-linejoin="round">' + t + '</text>' +
        '<text x="' + ax + '" y="' + base + '" ' + a + ' fill="' + GOLD + '">' + t + '</text>';
    } } : null,
    bajada: () => bLines.length ? { h: (bLines.length - 1) * bStep + bAsc + bDesc, gap: GAP, draw(yTop) {
      let base = yTop + bAsc, s = '';
      for (const line of bLines) {
        const a = 'font-family="' + SANS + '" font-size="' + bSize + '" text-anchor="' + anchor + '"';
        s += txtSombra(ax, base, a, escXml(line), '#f2efe9');
        base += bStep;
      }
      return s;
    } } : null,
    // Bajada en MAYÚSCULAS (sandwich): cierra abajo de la cursiva, discreta para no
    // competir con el hero. En diseños 'lead' va más chica, más espaciada y apagada.
    bajadaCaps: () => { const lines = wrap(placa.bajada, esHistoria ? 32 : 34);
      const sz = dis.lead ? Math.round(kickSize * 0.82) : kickSize;
      const asc = Math.round(sz * 0.76), desc = Math.round(sz * 0.12), step = Math.round(sz * 1.16);
      const fill = dis.lead ? '#e7e1d6' : '#fff';
      return lines.length ? { h: (lines.length - 1) * step + asc + desc, gap: GAP, draw(yTop) {
        let base = yTop + asc, s = '';
        for (const line of lines) {
          const a = 'font-family="' + SANS + '" font-weight="bold" font-size="' + sz + '" letter-spacing="' + (dis.lead ? 4 : 3) + '" text-anchor="' + anchor + '"';
          s += txtSombra(ax, base, a, escXml(line.toUpperCase()), fill);
          base += step;
        }
        return s;
      } } : null; },
    // Botón: texto en la tipografía principal del diseño (no suma una 3ª familia).
    cta: () => placa.cta ? { h: ctaH, gap: 0, draw(yTop) {
      const t = escXml(placa.cta);
      const cw = Math.min(Math.max(300, t.length * (esSerif ? 30 : 24) + 100), W - 2 * margenL);
      const cxx = isLeft ? margenL : isRight ? (W - margenL - cw) : (W - cw) / 2;
      const w = esSerif ? '' : ' font-weight="bold"';
      return '<rect x="' + cxx + '" y="' + yTop + '" rx="52" width="' + cw + '" height="' + ctaH + '" fill="' + GOLD + '"/>' +
        '<text x="' + (cxx + cw / 2) + '" y="' + (yTop + ctaH / 2 + 13) + '" text-anchor="middle" font-family="' + titFont + '"' + w + ' font-size="' + (esSerif ? 40 : 38) + '" fill="' + DARK + '">' + t + '</text>';
    } } : null,
  };

  // 'titular' usa la bajada como KICKER (eyebrow arriba del título gigante). Eso
  // sirve para 2-4 palabras ("MUY PRONTO"); con una FRASE larga queda como cintillo
  // de letra legal e invierte la jerarquía. Fix acotado y opt-in: si la bajada es
  // larga, NO va arriba como kicker → va DEBAJO del título como bajada real
  // (título gigante → cursiva → bajada → botón). Eyebrows cortos quedan igual.
  let orden = dis.orden;
  if (placa.estilo === 'titular') {
    const palabras = String(placa.bajada || '').trim().split(/\s+/).filter(Boolean).length;
    if (palabras > 4) orden = ['titulo', 'acento', 'bajada', 'cta'];
  }

  // Retoque: ocultar elementos pedidos. Cada concepto agrupa sus variantes de fila.
  if (adj.ocultar && adj.ocultar.length) {
    const drop = new Set();
    const grupo = { bajada: ['bajada', 'kicker', 'bajadaCaps'], acento: ['acento', 'acentoGold'], cta: ['cta'], lugar: ['tag'] };
    for (const o of adj.ocultar) (grupo[o] || []).forEach((k) => drop.add(k));
    orden = orden.filter((k) => !drop.has(k));
  }

  const filas = orden.map((k) => fila[k]()).filter(Boolean);
  return { filas, GAP, esHistoria, margenB };
}

// Etiqueta de UBICACIÓN: TAG simple y limpio (rectángulo dorado redondeado con el
// texto en blanco), arriba a la derecha. Confiable y prolijo. Mide la tinta real del
// texto para dimensionar el tag.
async function pinceladaLugar(txt, W, esHistoria) {
  const fsz = esHistoria ? 40 : 32;
  const ls = 4;
  const mSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="200">' +
    '<text x="700" y="120" text-anchor="middle" font-family="' + SANS + '" font-weight="bold" font-size="' + fsz + '" letter-spacing="' + ls + '" fill="#fff">' + txt + '</text></svg>';
  let tw;
  try {
    const tr = await sharp(Buffer.from(mSvg)).png().trim({ threshold: 5 }).toBuffer();
    tw = (await sharp(tr).metadata()).width;
  } catch (e) { tw = Math.round(txt.length * fsz * 0.66); }
  const padX = esHistoria ? 36 : 28;
  const padY = esHistoria ? 18 : 14;
  const tagW = tw + padX * 2;
  const tagH = fsz + padY * 2;
  // El dorado ARRANCA desde el borde derecho de la placa (sangra fuera del lienzo):
  // sólo se redondean las esquinas izquierdas; la derecha queda al ras del margen.
  const bx = W - tagW;                            // borde izq visible
  const rectW = tagW + tagH;                      // se extiende más allá de W (la curva queda fuera)
  const T = (esHistoria ? 96 : 76);
  const cx = W - tagW / 2, cy = T + tagH / 2;
  const ty = cy + fsz * 0.34;
  return '<rect x="' + bx + '" y="' + T + '" width="' + rectW + '" height="' + tagH + '" rx="' + (tagH / 2).toFixed(0) + '" fill="' + GOLD + '"/>' +
    '<text x="' + cx + '" y="' + ty + '" text-anchor="middle" font-family="' + SANS + '" font-weight="bold" font-size="' + fsz + '" letter-spacing="' + ls + '" fill="#fff">' + txt + '</text>';
}

// Baja una bandera por código ISO alpha-2 (España=es, Arabia Saudita=sa, Argentina=ar...)
// desde flagcdn (gratis, todos los países). Degrada a null si falla (no rompe la placa).
async function bajarBandera(code) {
  const c = String(code || '').toLowerCase().replace(/[^a-z]/g, '');
  if (c.length !== 2) return null;
  try {
    const r = await fetch('https://flagcdn.com/w320/' + c + '.png');
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch (e) { return null; }
}

// Fila "BANDERA VS BANDERA" para placas de partidos/eventos entre países. Banderas
// reales y nítidas (no IA, no emoji), con esquinas redondeadas. Devuelve { buf, w, h }
// o null: si alguna no baja, la placa se compone igual SIN la fila (degradación).
async function filaBanderas(codes, esHistoria, grande) {
  if (!Array.isArray(codes) || codes.length < 2) return null;
  const [bufA, bufB] = await Promise.all([bajarBandera(codes[0]), bajarBandera(codes[1])]);
  if (!bufA || !bufB) return null;
  const base = esHistoria ? 88 : 76;
  const fh = grande ? Math.round(base * 1.22) : base; // alto de bandera (más grande en modo evento)
  const redondear = async (buf) => {
    const img = await sharp(buf).resize({ height: fh }).png().toBuffer();
    const width = (await sharp(img).metadata()).width;
    const rx = Math.round(fh * 0.16);
    const mask = Buffer.from('<svg width="' + width + '" height="' + fh + '"><rect width="' + width + '" height="' + fh + '" rx="' + rx + '" ry="' + rx + '"/></svg>');
    const out = await sharp(img).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    return { buf: out, w: width };
  };
  const fa = await redondear(bufA), fb = await redondear(bufB);
  const vsSize = Math.round(fh * 0.6);
  const gap = Math.round(fh * 0.42);
  const vsW = Math.round(vsSize * 1.8);
  const vsSvg = Buffer.from('<svg width="' + vsW + '" height="' + fh + '" xmlns="http://www.w3.org/2000/svg">' +
    '<text x="' + (vsW / 2) + '" y="' + Math.round(fh / 2 + vsSize * 0.36) + '" text-anchor="middle" ' +
    'font-family="' + SANS + '" font-weight="bold" font-size="' + vsSize + '" fill="#fff">VS</text></svg>');
  const vsPng = await sharp(vsSvg).png().toBuffer();
  const totalW = fa.w + gap + vsW + gap + fb.w;
  const row = await sharp({ create: { width: totalW, height: fh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: fa.buf, left: 0, top: 0 },
      { input: vsPng, left: fa.w + gap, top: 0 },
      { input: fb.buf, left: fa.w + gap + vsW + gap, top: 0 },
    ]).png().toBuffer();
  return { buf: row, w: totalW, h: fh };
}

// Tag de "modo evento" (ej. "EN VIVO"): pill dorado con texto oscuro, va ARRIBA del
// cruce en placas de partido/evento. Da el golpe de afiche. El texto lo controla el
// copy (no se inventa nada). Devuelve { buf, w, h } o null.
async function tagEvento(texto, esHistoria) {
  const up = String(texto || '').trim().toUpperCase();
  if (!up) return null;
  const fs = esHistoria ? 32 : 28;
  // 1) Texto centrado en un lienzo ancho, recortado a su tinta para medir el ancho real.
  const Wbig = 2400;
  const tSvg = '<svg width="' + Wbig + '" height="200" xmlns="http://www.w3.org/2000/svg">' +
    '<text x="' + (Wbig / 2) + '" y="130" text-anchor="middle" font-family="' + SANS + '" ' +
    'font-weight="bold" font-size="' + fs + '" letter-spacing="5" fill="' + DARK + '">' + escXml(up) + '</text></svg>';
  let tw, th, tData;
  try {
    const tr = await sharp(Buffer.from(tSvg)).png().trim({ threshold: 6 }).toBuffer({ resolveWithObject: true });
    tw = tr.info.width; th = tr.info.height; tData = tr.data;
  } catch (e) { return null; }
  // 2) Pill dorado que envuelve el texto con padding generoso.
  const padX = Math.round(fs * 1.1), padY = Math.round(fs * 0.6);
  const pw = tw + 2 * padX, ph = th + 2 * padY, rx = Math.round(ph / 2);
  const pillSvg = '<svg width="' + pw + '" height="' + ph + '" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="' + pw + '" height="' + ph + '" rx="' + rx + '" ry="' + rx + '" fill="' + GOLD + '"/></svg>';
  const out = await sharp(Buffer.from(pillSvg)).png()
    .composite([{ input: tData, left: Math.round((pw - tw) / 2), top: Math.round((ph - th) / 2) }])
    .png().toBuffer();
  return { buf: out, w: pw, h: ph };
}

// Arma el texto midiendo la TINTA REAL de cada fila: renderiza cada una, la recorta
// a sus letras (sharp trim) y recién ahí las apila con un espacio óptico parejo. Así
// el bloque queda agrupado, sin el aire que mete la caja de la fuente (clave con la
// cursiva Abuget, que es chica y variable). Devuelve { bg, layers } para componer.
async function componerTexto(placa, W, H, numero, total, vert) {
  const { filas, GAP, esHistoria, margenB } = prepararTexto(placa, W, H);
  const CH = 1000, BASE = 90; // lienzo de medición y línea base provisoria
  const els = [];
  // Lienzo de medición ANCHO (4×) con el contenido centrado: captura la tinta
  // completa aunque el texto sea más ancho que la placa, para medir su ancho REAL.
  // Medir en un lienzo de ancho W recortaría el texto ANTES de poder medirlo.
  const Wbig = W * 4;
  const offX = Math.round((Wbig - W) / 2);
  for (const f of filas) {
    const inner = f.draw(BASE);
    const svg = '<svg width="' + Wbig + '" height="' + CH + '" xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="translate(' + offX + ',0)">' + inner + '</g></svg>';
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    try {
      const t = await sharp(png).trim({ threshold: 6 }).toBuffer({ resolveWithObject: true });
      els.push({ buf: t.data, w: t.info.width, h: t.info.height });
    } catch (e) { /* fila vacía: se ignora */ }
  }
  // Modo evento (placas de partido/evento): tag dorado "EN VIVO" arriba del cruce +
  // banderas más grandes + scrim reforzado. Lo dispara el campo `evento` del copy.
  const esEvento = !!String(placa.evento || '').trim();
  // Fila de banderas ARRIBA del título (partidos entre países). Se inserta como un "el"
  // más → se centra/alinea, apila y queda sobre el scrim junto con el resto del bloque.
  const flagEl = await filaBanderas(placa.banderas, esHistoria, esEvento);
  if (flagEl) els.unshift(flagEl);
  // Tag de evento por ENCIMA del cruce (queda primero del bloque).
  const tagEl = esEvento ? await tagEvento(placa.evento, esHistoria) : null;
  if (tagEl) els.unshift(tagEl);
  if (!els.length) {
    const bgEmpty = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg"><defs>' +
      gradiente(vert, W, H) + '</defs><rect width="' + W + '" height="' + H + '" fill="url(#g)"/></svg>';
    return { bg: Buffer.from(bgEmpty), layers: [] };
  }

  // Autofit horizontal: si la tinta de una fila es más ancha que el área útil
  // (fuentes anchas como Abril Fatface desbordan), se reduce esa capa al ancho útil
  // para que NINGÚN texto se corte contra el borde.
  const margenL = esHistoria ? 80 : 70;
  const anchoUtil = W - 2 * margenL;
  const alignC = alineacion(DISENOS[placa.estilo] || DISENOS.clasico, placa.adj);
  const isLeft = alignC === 'left';
  const isRight = alignC === 'right';
  for (const e of els) {
    if (e.w > anchoUtil) {
      const nh = Math.max(1, Math.round(e.h * (anchoUtil / e.w)));
      e.buf = await sharp(e.buf).resize({ width: anchoUtil, height: nh }).toBuffer();
      e.w = anchoUtil; e.h = nh;
    }
    // Posición horizontal: centrado real en la placa (o pegado al margen si es left).
    e.left = isLeft ? margenL : isRight ? Math.round(W - margenL - e.w) : Math.round((W - e.w) / 2);
  }

  let totalH = els.reduce((a, e) => a + e.h, 0) + GAP * (els.length - 1);

  // Banda vertical segura: deja lugar para el logo (va al lado contrario del texto).
  // Si el bloque no entra, se reduce proporcionalmente para que no se salga del
  // lienzo ni pise el logo.
  const logoZone = esHistoria ? 330 : 280;
  const topLimit = (vert === 'arriba') ? (esHistoria ? 150 : 120) : logoZone;
  const botLimit = (vert === 'arriba') ? (H - logoZone) : (H - margenB);
  const availH = botLimit - topLimit;
  if (availH > 0 && totalH > availH) {
    // El factor escala SOLO la tinta: los GAP son fijos, así que se descuentan del
    // presupuesto antes de calcularlo. Si no, el bloque seguiría desbordando availH
    // por GAP*(n-1)*(1-factor) y pisaría el logo / se saldría del lienzo.
    const gapsTot = GAP * (els.length - 1);
    const factor = Math.max(0.05, (availH - gapsTot) / Math.max(1, totalH - gapsTot));
    for (const e of els) {
      const nw = Math.max(1, Math.round(e.w * factor));
      const nh = Math.max(1, Math.round(e.h * factor));
      e.buf = await sharp(e.buf).resize({ width: nw, height: nh }).toBuffer();
      e.w = nw; e.h = nh;
      e.left = isLeft ? margenL : isRight ? Math.round(W - margenL - e.w) : Math.round((W - e.w) / 2); // re-centra al achicar
    }
    totalH = els.reduce((a, e) => a + e.h, 0) + GAP * (els.length - 1);
  }

  let y0;
  if (vert === 'arriba') y0 = esHistoria ? 196 : 156;
  else if (vert === 'centro') y0 = Math.max(esHistoria ? 280 : 220, Math.round((H - totalH) / 2));
  else y0 = H - margenB - totalH;
  // No dejes que el bloque se salga por arriba/abajo ni pise el logo. Si por un
  // residuo de redondeo no entra justo, centrá el sobrante en la banda en vez de
  // pinearlo arriba (que desbordaría sólo por abajo).
  const slack = availH - totalH;
  y0 = slack >= 0
    ? Math.max(topLimit, Math.min(y0, botLimit - totalH))
    : topLimit + Math.round(slack / 2);

  const layers = [];
  let cy = y0;
  for (const e of els) {
    layers.push({ input: e.buf, left: Math.max(0, Math.round(e.left)), top: Math.round(cy) });
    cy += e.h + GAP;
  }

  // Fondo: degradado + scrim ajustado al bloque real + badge de carrusel.
  const trato = vert === 'arriba' ? 'arriba' : vert === 'centro' ? 'centro' : 'abajo';
  const pad = 54;
  const scrimTop = Math.max(0, y0 - pad), scrimBot = Math.min(H, (cy - GAP) + pad);
  const badge = total > 1
    ? '<text x="' + (W - 70) + '" y="' + (esHistoria ? 175 : 135) + '" text-anchor="end" font-family="' + SANS + '" font-weight="bold" font-size="30" fill="' + GOLD + '">' + numero + '/' + total + '</text>'
    : '';
  // Ubicación como etiqueta arriba a la derecha sobre una PINCELADA dorada (como las
  // referencias del cliente): texto blanco sobre mancha de pincel dorada.
  const disB = DISENOS[placa.estilo] || DISENOS.clasico;
  const lugB = String(placa.lugar || '').trim();
  // El badge respeta "ocultar: ['lugar']" (ej. "sacá la ubicación"), igual que la fila
  // de texto en clasico/editorial. Así el ocultar funciona en todos los estilos.
  const ocultaLugar = !!(placa.adj && Array.isArray(placa.adj.ocultar) && placa.adj.ocultar.includes('lugar'));
  let lugBadge = '';
  if (disB.lugarBadge && lugB && !ocultaLugar) {
    lugBadge = await pinceladaLugar(escXml(lugB.toUpperCase()), W, esHistoria);
  }
  const bg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg"><defs>' +
    gradiente(trato, W, H) +
    '<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#000" stop-opacity="0"/>' +
    '<stop offset=".22" stop-color="#000" stop-opacity="' + (esEvento ? '.72' : '.5') + '"/>' +
    '<stop offset=".78" stop-color="#000" stop-opacity="' + (esEvento ? '.72' : '.5') + '"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' +
    '<rect x="0" y="' + scrimTop + '" width="' + W + '" height="' + (scrimBot - scrimTop) + '" fill="url(#scrim)"/>' +
    badge + lugBadge + '</svg>';
  return { bg: Buffer.from(bg), layers };
}

// CRITERIO (determinístico): mide qué franja de la foto está más "vacía/lisa"
// y manda el texto ahí. Caras, manos y comida tienen mucho detalle (stdev alto)
// → se evitan solas. Es confiable y rápido (no usa IA). Devuelve {vert,horiz}.
async function ubicarTexto(buf) {
  try {
    const meta = await sharp(buf).metadata();
    const W = meta.width, H = meta.height;
    const bandH = Math.round(H * 0.34);
    const busy = async (topFrac) => {
      const top = Math.max(0, Math.min(H - bandH, Math.round(H * topFrac)));
      const st = await sharp(buf).extract({ left: 0, top, width: W, height: bandH })
        .greyscale().stats();
      return st.channels[0].stdev; // menos detalle = más tranquila
    };
    const arriba = await busy(0.08);
    const centro = await busy(0.33);
    const abajo = await busy(0.60);
    // Más tranquila gana. Sesgo: preferí abajo (natural); penalizá centro.
    const cand = [['abajo', abajo * 0.9], ['arriba', arriba], ['centro', centro * 1.15]];
    cand.sort((a, b) => a[1] - b[1]);
    return { vert: cand[0][0], horiz: 'centro' };
  } catch (e) { return { vert: 'abajo', horiz: 'centro' }; }
}

// Prepara el logo (escalado + sombra suave) para componer al centro, ARRIBA o
// ABAJO según `pos` (se ubica al lado contrario del texto). Más grande que antes
// para que no se pierda. Devuelve { capas } o null si la variante no existe.
async function prepararLogo(variante, W, H, pos) {
  const def = LOGOS[variante] || LOGOS[LOGO_DEFAULT];
  if (!def) return null;
  const esHistoria = H > 1500;
  const file = path.join(LOGO_DIR, def.file);

  // Logo de marca, presente pero no cartel. Agrandado ~1.6× respecto del original.
  let logo;
  if (def.tipo === 'iso') {
    logo = await sharp(file).resize({ height: esHistoria ? 190 : 164 }).png().toBuffer();
  } else {
    logo = await sharp(file).resize({ width: esHistoria ? 392 : 348 }).png().toBuffer();
  }
  const meta = await sharp(logo).metadata();
  const left = Math.round((W - meta.width) / 2);
  const margin = esHistoria ? 86 : 64;
  const top = pos === 'abajo' ? (H - meta.height - margin) : margin;

  // Sombra suave (silueta negra difuminada) para que lea sobre cualquier foto.
  const alpha = await sharp(logo).extractChannel('alpha').toBuffer();
  const silueta = await sharp({
    create: { width: meta.width, height: meta.height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).joinChannel(alpha).png().toBuffer();
  const sombra = await sharp(silueta).extend({
    top: 16, bottom: 16, left: 16, right: 16,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).blur(10).png().toBuffer();

  return {
    capas: [
      { input: sombra, left: left - 16, top: top - 16 + 3 },
      { input: logo, left, top },
    ],
  };
}

async function componerPlaca(placa, fotoBuf, formato, numero, total) {
  const { w, h } = FORMATOS[formato] || FORMATOS.carrusel;
  // Recorte hacia el sujeto (caras/foco), no centrado a ciegas → no corta mal.
  const foto = await sharp(fotoBuf).rotate()
    .resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer();
  // Posición vertical del texto: la fija el diseño (identidad) o, si es 'auto',
  // la decide el criterio (franja más vacía, para no tapar caras/comida).
  const dis = DISENOS[placa.estilo] || DISENOS.clasico;
  const zona = await ubicarTexto(foto);
  const vert = (placa.adj && placa.adj.vert)
    ? placa.adj.vert // retoque: el usuario forzó arriba/centro/abajo
    : (dis.anchor && dis.anchor !== 'auto' ? dis.anchor : (zona.vert || 'abajo'));
  const { bg, layers } = await componerTexto(placa, w, h, numero, total, vert);
  const capas = [{ input: bg, left: 0, top: 0 }, ...layers];
  // El logo va SIEMPRE, al lado CONTRARIO del texto (arriba↔abajo); si el texto
  // está al centro, va arriba.
  const logoPos = vert === 'arriba' ? 'abajo' : 'arriba';
  const logo = await prepararLogo(placa.logo || LOGO_DEFAULT, w, h, logoPos);
  if (logo) capas.push(...logo.capas);
  return sharp(foto)
    .composite(capas)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// Resuelve la foto de una placa EN RESOLUCIÓN COMPLETA (no la miniatura de
// preview, que pixela al ampliar a 1080×1920). Prioriza el Drive.
async function fotoDePlaca(placa, aspecto) {
  if (placa.driveId) return downloadFile(placa.driveId);
  if (placa.iaPrompt) {
    // Modo "con referencia": bajamos la foto que estaba seleccionada (la que guardó
    // el panel en iaRef) y se la pasamos a Gemini como guía visual. Modo "libre"
    // (iaModo !== 'foto' o sin iaRef): no se pasa imagen, solo el prompt + estética.
    let refBuf = null;
    if (placa.iaModo === 'foto' && placa.iaRef) {
      try {
        if (placa.iaRef.driveId) refBuf = await downloadFile(placa.iaRef.driveId);
        else if (placa.iaRef.fotoUrl) {
          const rr = await fetch(placa.iaRef.fotoUrl);
          if (rr.ok) refBuf = Buffer.from(await rr.arrayBuffer());
        }
      } catch (e) { refBuf = null; /* si falla, generación libre */ }
    }
    return generarImagenIA(placa.iaPrompt, { refBuf, aspecto });
  }
  if (placa.fotoUrl) {
    const r = await fetch(placa.fotoUrl);
    if (!r.ok) throw new Error('No pude bajar la foto: HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('La placa no tiene foto (elegí una del banco o generala con IA).');
}

// ---- Retoque de DISEÑO en lenguaje natural sobre la placa ya compuesta ----
// El usuario escribe en castellano ("título más grande, texto más arriba, sin
// botón") y Claude lo traduce a un set ACOTADO de ajustes que el compositor sabe
// aplicar. No es posicionamiento libre (no es un editor de lienzo): mueve el bloque
// por bandas y escala elementos. Devuelve { tituloScale, acentoScale, bajadaScale,
// vert, align, tituloUnaLinea, ocultar } o null.
const RETOQUE_SYSTEM = `Traducí una instrucción de diseño en castellano (rioplatense/España) sobre una placa YA compuesta a parámetros. La placa tiene: TÍTULO grande, ACENTO en cursiva dorada, BAJADA (texto explicativo), BOTÓN (CTA) y a veces una UBICACIÓN.

Devolvé SOLO un objeto JSON (sin markdown, sin texto alrededor). Incluí ÚNICAMENTE las claves que la instrucción pida; omití el resto:
- "tituloScale": 0.7 a 1.4 (1 = tamaño normal). "más grande"≈1.2, "mucho más grande"≈1.35, "más chico"≈0.85, "mucho más chico"≈0.75. Para VOLVER al tamaño normal usá 1 ("el título normal otra vez", "como estaba"→1).
- "acentoScale": 0.7 a 1.4 — escala la CURSIVA dorada (1 = normal).
- "bajadaScale": 0.7 a 1.4 — escala la BAJADA (1 = normal).
- "vert": "arriba" | "centro" | "abajo" — ALTURA del bloque de texto. "subí el texto"→"arriba", "bajalo"→"abajo", "a media altura / centrado verticalmente"→"centro".
- "align": "izquierda" | "centro" | "derecha" — alineación HORIZONTAL del texto. "centrá el texto", "alineá al centro", "texto centrado"→"centro"; "alineá a la izquierda"→"izquierda"; "a la derecha"→"derecha". OJO: "centrar el texto" a secas casi siempre es HORIZONTAL (align:"centro"), NO la altura.
- "tituloUnaLinea": true | false — forzar el TÍTULO en un solo renglón (se achica para entrar a lo ancho). "título en una sola línea / en un renglón / que no se parta / todo junto"→true. "el título en dos líneas / como estaba"→false.
- "ocultar": array con cualquiera de "bajada","cta","acento","lugar" — elementos a SACAR. "sin botón"→["cta"], "sacá la frase/bajada"→["bajada"], "sin cursiva"→["acento"], "sin la dirección"→["lugar"].
- "mostrar": array (mismas opciones que ocultar) — elementos a VOLVER A MOSTRAR si antes se sacaron. "volvé a poner el botón"→["cta"], "mostrá la cursiva de nuevo"→["acento"].

Si la instrucción no pide nada interpretable, devolvé {}.`;

function sanearRetoque(j) {
  if (!j || typeof j !== 'object') return null;
  const clampS = (v) => { const n = Number(v); return isFinite(n) ? Math.max(0.7, Math.min(1.4, n)) : undefined; };
  const out = {};
  // Las escalas dejan pasar el 1 (= volver a normal): es el único valor capaz de
  // resetear un escalado acumulado en una ronda previa. Si la instrucción no menciona
  // tamaño, el modelo omite la clave y no se resetea nada.
  const ts = clampS(j.tituloScale); if (ts !== undefined) out.tituloScale = ts;
  const as = clampS(j.acentoScale); if (as !== undefined) out.acentoScale = as;
  const bs = clampS(j.bajadaScale); if (bs !== undefined) out.bajadaScale = bs;
  if (['arriba', 'centro', 'abajo'].includes(j.vert)) out.vert = j.vert;
  if (['izquierda', 'centro', 'derecha'].includes(j.align)) out.align = j.align;
  if (typeof j.tituloUnaLinea === 'boolean') out.tituloUnaLinea = j.tituloUnaLinea;
  const filtKeys = (arr) => Array.isArray(arr)
    ? Array.from(new Set(arr.filter((k) => ['bajada', 'cta', 'acento', 'lugar'].includes(k))))
    : [];
  const oc = filtKeys(j.ocultar); if (oc.length) out.ocultar = oc;
  const mo = filtKeys(j.mostrar); if (mo.length) out.mostrar = mo;
  return Object.keys(out).length ? out : null;
}

async function interpretarRetoque(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  try {
    const resp = await crearConSchema({
      model: process.env.CLAUDE_RETOQUE_MODEL || 'claude-haiku-4-5',
      max_tokens: 300,
      system: RETOQUE_SYSTEM,
      messages: [{ role: 'user', content: t }],
    }, RETOQUE_SCHEMA);
    return sanearRetoque(jsonRespuesta(resp));
  } catch (e) {
    console.error('[Gen retoque] no se pudo interpretar:', e.message); // si falla, se compone sin retoque
    return null;
  }
}

// ---- Pipeline completo: placas → piezas subidas al storage ----
async function generarPiezas(formato, placas) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  const ASPECTO_IA = { historia: '9:16', post: '4:5', carrusel: '4:5' };
  const aspecto = ASPECTO_IA[f] || '4:5';
  const lote = Date.now();
  const urls = [];
  const avisos = [];
  for (let i = 0; i < placas.length; i++) {
    const p = placas[i];

    // ---- MODO PLACA COMPLETA IA: Gemini diseña todo; acá solo se verifica,
    // se cachea la imagen cruda y se le monta el logo real. ----
    if (p.modoIA === 'completa') {
      let crudo = null;
      const firma = firmaPlacaIA(p);
      if (p.iaPlacaUrl && p.iaPlacaFirma === firma) {
        try {
          const r = await fetch(p.iaPlacaUrl);
          if (r.ok) crudo = Buffer.from(await r.arrayBuffer());
        } catch (e) { crudo = null; /* cache caído: se regenera */ }
      }
      if (!crudo) {
        const gen = await generarPlacaCompletaIA(p, f);
        crudo = gen.buf;
        gen.avisos.forEach((a) => avisos.push('Placa ' + (i + 1) + ': ' + a));
        // Los avisos viajan EN la placa: el panel los muestra pegados a la pieza.
        p.avisosIA = gen.avisos;
        // Una placa que NO pasó la verificación no se cachea: tocar «Componer
        // piezas» de nuevo la regenera de cero (si se cacheara, el recompose
        // devolvería la misma imagen fallida y no habría re-tirada sin cambios).
        if (gen.fallida) {
          p.iaPlacaUrl = null;
          p.iaPlacaFirma = null;
        } else {
          try {
            const cachePath = 'social/ia-cache/' + lote + '-placa-' + (i + 1) + '.jpg';
            const crudoJpg = await sharp(crudo).jpeg({ quality: 92 }).toBuffer();
            await supabaseAdmin.storage.from('ppweb-blog')
              .upload(cachePath, crudoJpg, { contentType: 'image/jpeg', upsert: true });
            p.iaPlacaUrl = supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(cachePath).data.publicUrl;
            p.iaPlacaFirma = firma;
          } catch (e) { /* sin cache no se rompe: la próxima regenera */ }
        }
      }
      const pieza = await terminarPlacaIA(crudo, p, f, i + 1, placas.length);
      const objectPath = 'social/' + lote + '-' + f + '-' + (i + 1) + '.jpg';
      const { error } = await supabaseAdmin.storage.from('ppweb-blog')
        .upload(objectPath, pieza, { contentType: 'image/jpeg' });
      if (error) throw new Error('Storage: ' + error.message);
      urls.push(supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl);
      continue;
    }

    // adj puede venir ya resuelto (de la caja "¿Querés cambiar algo?"); si no, se
    // interpreta el texto crudo del campo por-placa (compatibilidad).
    if (!p.adj && p.retoque) p.adj = await interpretarRetoque(p.retoque);

    // Imagen: si es IA y ya se generó una vez (iaFotoUrl cacheada), se REUSA —
    // recomponer para ajustar el texto NO regenera la pizza (ahorra tiempo y la deja
    // fija). El cache se invalida desde el panel al pedir otra imagen (botón IA/Otra).
    let fotoBuf = null;
    if (p.iaPrompt && p.iaFotoUrl) {
      try {
        const r = await fetch(p.iaFotoUrl);
        if (r.ok) fotoBuf = Buffer.from(await r.arrayBuffer());
      } catch (e) { fotoBuf = null; /* si el cache falla, se regenera abajo */ }
    }
    if (!fotoBuf) {
      fotoBuf = await fotoDePlaca(p, aspecto);
      // Cachear la imagen IA recién generada para los próximos recomponer.
      if (p.iaPrompt) {
        try {
          const cachePath = 'social/ia-cache/' + lote + '-' + (i + 1) + '.jpg';
          await supabaseAdmin.storage.from('ppweb-blog')
            .upload(cachePath, fotoBuf, { contentType: 'image/jpeg', upsert: true });
          p.iaFotoUrl = supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(cachePath).data.publicUrl;
        } catch (e) { /* si falla el cache, la próxima vez regenera; no rompe */ }
      }
    }

    const pieza = await componerPlaca(p, fotoBuf, f, i + 1, placas.length);
    const objectPath = 'social/' + lote + '-' + f + '-' + (i + 1) + '.jpg';
    const { error } = await supabaseAdmin.storage.from('ppweb-blog')
      .upload(objectPath, pieza, { contentType: 'image/jpeg' });
    if (error) throw new Error('Storage: ' + error.message);
    urls.push(supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl);
  }
  // Devuelve placas además de urls para propagar la iaFotoUrl/iaPlacaUrl cacheadas
  // al panel, y avisos (verificación de placas IA) para mostrarlos.
  return { urls, placas, avisos };
}

// Baja una foto del banco (Drive), la optimiza y la sube al storage.
// Devuelve la URL pública para previsualizar y componer.
async function materializarFoto(driveId) {
  const buf = await downloadFile(driveId);
  const optim = await sharp(buf).rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const objectPath = 'social/banco/' + driveId + '.jpg';
  await supabaseAdmin.storage.from('ppweb-blog')
    .upload(objectPath, optim, { contentType: 'image/jpeg', upsert: true });
  return supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl;
}

module.exports = { generarCopy, ajustarCopy, generarPiezas, generarImagenIA, generarPortadaReel, afinarPromptIA, sugerirEscenaBlog, geminiDisponible, materializarFoto, componerPlaca, fotoDePlaca, interpretarRetoque, redactarPromptPlaca, verificarPlacaIA, generarPlacaCompletaIA, terminarPlacaIA, sanearCopy, acortarLargos, FORMATOS, LOGOS, ESTILO_LIST };
