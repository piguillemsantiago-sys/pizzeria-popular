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
const { guiaDeEstilo, referenciaBuffers, referenciaActiva } = require('./referencia');

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
    { "titulo": "...", "acento": "...", "bajada": "...", "cta": "...", "lugar": "..." }
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
- "bajada": máximo 14 palabras, complementa (no repite). Puede ser "".
- "cta": máximo 4 palabras (ej: "Reservá tu mesa", "Mandá tu CV") o "" si no aplica.
- "lugar": local/dirección SOLO si la instrucción lo menciona (ej: "Valencia",
  "Av. Niza 9, Alicante"). Si no, "".
- No inventes promos, precios ni datos: usá SOLO lo que dice la instrucción.
- Tildes y eñes bien escritas. Emojis: máximo 1 por placa, solo si suma.
- CERO jerga corporativa: nada de "RRHH", "vacante", "postulación", "personal idóneo",
  "candidato". Hablá simple y cálido, como le hablás a un amigo.
- Empezá cada texto (título, bajada) con mayúscula. No repitas la misma palabra entre
  título, acento y bajada (ej: si el título dice "Buscamos", el acento/bajada no).`;

async function generarCopy(instruccion, formato) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  let estilo = '';
  try { estilo = await guiaDeEstilo(); } catch (e) { /* referencia opcional */ }
  const sys = COPY_SYSTEM + (estilo
    ? '\n\nGUÍA DE ESTILO (de las placas de referencia, respetá este tono):\n' + estilo
    : '');
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: sys,
    messages: [{ role: 'user', content: 'Formato: ' + f + '\nInstrucción: ' + instruccion }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un copy válido.');
  const out = JSON.parse(m[0]);
  out.placas = (out.placas || []).slice(0, FORMATOS[f].maxPlacas);
  // Por defecto, ubicación automática: la IA mira cada foto y decide dónde va
  // el texto sin tapar caras/comida (criterio). El usuario puede forzar un
  // estilo fijo desde el selector si quiere.
  out.placas.forEach((p) => { p.estilo = 'auto'; });
  return out;
}

// ---- Ajuste con IA: el usuario ya vio la pieza y pide cambios ----
const AJUSTE_SYSTEM = `Sos el creativo de redes de Pizzería Popular (cadena argentina de
pizza al horno de leña en España). YA HAY una pieza armada y el usuario te da una
indicación para AJUSTARLA. Devolvé SOLO un JSON válido (sin markdown) con la versión
corregida, manteniendo tal cual lo que el usuario NO pidió cambiar:

{
  "caption": "...",
  "placas": [
    { "titulo": "...", "acento": "...", "bajada": "...", "cta": "...", "lugar": "...",
      "estilo": "auto|editorial|hero|centrado|alto",
      "logo": "wordmark-blanco|wordmark-oscuro|iso-blanco|iso-fuego|iso-rojo|iso-verde",
      "cambiarFoto": false, "fotoHint": "" }
  ]
}

En la gráfica, "titulo" va en blanco y "acento" va grande en cursiva dorada (el remate).
"lugar" es un tag de ubicación (ej: "Valencia", "Av. Niza 9, Alicante") o "".
"estilo" es la ubicación del texto: "auto" (la IA decide para no tapar caras/comida —
es lo normal), o forzada: editorial (abajo), hero (acento más grande, abajo), centrado
(al centro) o alto (arriba). Si piden mover/centrar el texto, poné el estilo que
corresponda; si no lo mencionan, dejá "auto".

Reglas:
- Aplicá SOLO lo que pide la indicación. Todo lo demás queda IGUAL al estado actual.
- Devolvé SIEMPRE todas las placas, en el mismo orden y cantidad.
- Copy: título ≤6 palabras (sin punto final), acento 1-3 palabras, bajada ≤14, cta ≤4
  palabras. Tono argentino, cálido, de "vos". No inventes promos ni precios.
- "logo": si la indicación habla del logo/colores/fondo, elegí la variante adecuada
  (blanco para fondos oscuros, oscuro para claros). Si no la menciona, dejá la actual.
- "cambiarFoto": true SOLO si la indicación pide otra foto o describe una imagen
  distinta ("cambiá la foto", "poné una de pizza", "que se vea el horno"...).
- "fotoHint": si cambiarFoto es true, una frase corta de qué buscar (ej: "pizza
  apetitosa de cerca", "equipo sonriendo en el local"). Si no, dejá "".`;

async function ajustarCopy(feedback, formato, placas, caption) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  const estado = placas.map((p, i) =>
    (i + 1) + '. Título: "' + (p.titulo || '') + '"' +
    ' · Acento: "' + (p.acento || '') + '"' +
    ' · Bajada: "' + (p.bajada || '') + '"' +
    ' · CTA: "' + (p.cta || '') + '"' +
    ' · Lugar: "' + (p.lugar || '') + '"' +
    ' · Estilo: ' + (p.estilo || 'editorial') +
    ' · Logo: ' + (p.logo || 'wordmark-blanco') +
    (p.motivo ? ' · Foto actual: ' + p.motivo : '')).join('\n');
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: AJUSTE_SYSTEM,
    messages: [{
      role: 'user',
      content: 'Formato: ' + f + '\nCaption actual: ' + (caption || '') +
        '\n\nPLACAS ACTUALES:\n' + estado +
        '\n\nINDICACIÓN DEL USUARIO:\n' + feedback,
    }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un ajuste válido.');
  const out = JSON.parse(m[0]);
  out.placas = (out.placas || []).slice(0, FORMATOS[f].maxPlacas);
  return out;
}

// ---- Imagen con Gemini (se activa con GEMINI_API_KEY) ----
async function generarImagenIA(prompt) {
  if (!geminiDisponible()) {
    const e = new Error('Generación IA no disponible: falta GEMINI_API_KEY en el .env.');
    e.code = 'NO_KEY';
    throw e;
  }
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

  // Si hay placas de referencia, le pasamos la guía de estilo + las imágenes
  // como referencia visual para que genere "parecido".
  const reqParts = [];
  let promptFinal = prompt;
  if (referenciaActiva()) {
    try {
      const estilo = await guiaDeEstilo();
      if (estilo) promptFinal += '\n\nEstilo de marca a respetar:\n' + estilo;
      const refs = await referenciaBuffers(3);
      if (refs.length) {
        promptFinal += '\n\nUsá las imágenes adjuntas como referencia de estilo (paleta, luz, encuadre, mood), no copies su contenido literal.';
        for (const r of refs) {
          reqParts.push({ inlineData: { mimeType: 'image/jpeg', data: r.toString('base64') } });
        }
      }
    } catch (e) { /* referencia opcional */ }
  }
  reqParts.push({ text: promptFinal });

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: reqParts }] }),
    }
  );
  if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error('Gemini no devolvió una imagen.');
  return Buffer.from(img.inlineData.data, 'base64');
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

// Estilos de diseño: el generador rota entre ellos para que no sean
// todas iguales. Cada uno cambia posición del texto, alineación, tamaño
// del acento y el tratamiento (degradado) sobre la foto.
const ESTILOS = {
  editorial: { pos: 'bottom', align: 'left',   aFactor: 1.0,  trato: 'abajo'  },
  hero:      { pos: 'bottom', align: 'left',   aFactor: 1.28, trato: 'abajo'  },
  centrado:  { pos: 'center', align: 'center', aFactor: 1.15, trato: 'centro' },
  alto:      { pos: 'top',    align: 'left',   aFactor: 1.0,  trato: 'arriba' },
};
const ESTILO_LIST = ['editorial', 'hero', 'centrado', 'alto'];

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

// SVG con el texto de la placa: título blanco sans + acento en cursiva
// dorada (Great Vibes) + bajada + CTA. La POSICIÓN la dicta `zona` (criterio
// según la foto: dónde NO tapar caras/comida); el estilo aporta el resto.
function svgTexto(placa, W, H, numero, total, zona) {
  const esHistoria = H > 1500;
  const est = ESTILOS[placa.estilo] || ESTILOS.editorial;

  // Auto = como las referencias: SIEMPRE centrado (impacto). La visión solo
  // decide la posición vertical para no tapar caras/comida. Forzado: usa el estilo.
  const auto = !placa.estilo || placa.estilo === 'auto';
  const vert = zona && zona.vert ? zona.vert : 'abajo';
  const align = auto ? 'centro'
    : est.align === 'center' ? 'centro' : est.align === 'right' ? 'derecha' : 'izquierda';
  const trato = vert === 'arriba' ? 'arriba' : vert === 'centro' ? 'centro' : 'abajo';

  const tSize = esHistoria ? 56 : 50;
  const aSize = Math.round((esHistoria ? 158 : 132) * est.aFactor);
  const bSize = esHistoria ? 36 : 33;
  const lugSize = 27;
  const margenL = esHistoria ? 80 : 70;
  const margenB = esHistoria ? 118 : 92;

  // x y anchor según alineación (izquierda / centro / derecha).
  const tx = align === 'centro' ? W / 2 : align === 'derecha' ? W - margenL : margenL;
  const anchor = align === 'centro' ? ' text-anchor="middle"' : align === 'derecha' ? ' text-anchor="end"' : '';
  const ax = align === 'izquierda' ? margenL - 4 : tx; // el acento se "saca" un poco a la izquierda

  const lugar = String(placa.lugar || '').trim();
  const tLines = wrap(placa.titulo, esHistoria ? 22 : 24);
  const aLines = wrap(placa.acento, Math.max(8, Math.round((esHistoria ? 16 : 18) / est.aFactor)));
  const bLines = wrap(placa.bajada, esHistoria ? 40 : 42);

  const tLH = Math.round(tSize * 1.14);
  const aLH = Math.round(aSize * 0.9);
  const bLH = Math.round(bSize * 1.4);
  const lugLH = 42;
  const ctaH = placa.cta ? 104 : 0;

  const gapLug = lugar ? lugLH + 14 : 0;
  const gapTA = aLines.length && tLines.length ? 8 : 0;
  const gapAB = bLines.length ? 22 : 0;
  const gapCta = ctaH ? 38 : 0;

  const bloqueH = gapLug + tLines.length * tLH + gapTA + aLines.length * aLH +
    gapAB + bLines.length * bLH + (ctaH ? gapCta + ctaH : 0);

  // Posición vertical del bloque.
  let y;
  if (vert === 'arriba') y = esHistoria ? 300 : 250;
  else if (vert === 'centro') y = Math.max(esHistoria ? 320 : 240, (H - bloqueH) / 2);
  else y = H - margenB - bloqueH;

  const bloqueTop = y; // para el scrim detrás del texto

  let s = '';
  if (total > 1) {
    s += '<text x="' + (W - 70) + '" y="' + (esHistoria ? 175 : 135) + '" text-anchor="end" ' +
      'font-family="Montserrat" font-weight="bold" font-size="30" fill="' + GOLD + '">' + numero + '/' + total + '</text>';
  }

  // Tag de ubicación: punto dorado + texto en mayúsculas.
  if (lugar) {
    y += lugLH;
    const txt = '<tspan fill="' + GOLD + '">•</tspan>  ' + escXml(lugar.toUpperCase());
    const attrs = 'font-family="Montserrat" font-weight="bold" font-size="' + lugSize + '" letter-spacing="2"' + anchor;
    s += '<text x="' + tx + '" y="' + (y + 2) + '" ' + attrs + ' fill="#000" opacity=".45">' + txt + '</text>';
    s += '<text x="' + tx + '" y="' + y + '" ' + attrs + ' fill="#fff">' + txt + '</text>';
    y += 14;
  }

  // Título blanco en MAYÚSCULAS (Montserrat Bold) con sombra — como las referencias.
  for (const line of tLines) {
    y += tLH;
    const attrs = 'font-family="Montserrat" font-weight="bold" font-size="' + tSize + '" letter-spacing="3"' + anchor;
    s += txtSombra(tx, y, attrs, escXml(line.toUpperCase()), '#fff');
  }

  // Acento dorado tipo PINCEL (Kaushan Script) — el remate, grande, con sombra.
  if (aLines.length) {
    y += gapTA;
    for (const line of aLines) {
      y += aLH;
      const attrs = 'font-family="Kaushan Script" font-size="' + aSize + '"' + anchor;
      s += txtSombra(ax, y, attrs, escXml(line), GOLD);
    }
  }

  // Bajada con sombra.
  if (bLines.length) {
    y += gapAB;
    for (const line of bLines) {
      y += bLH;
      const attrs = 'font-family="Montserrat" font-size="' + bSize + '"' + anchor;
      s += txtSombra(tx, y, attrs, escXml(line), '#f2efe9');
    }
  }

  // CTA
  if (placa.cta) {
    y += gapCta;
    const ctaTexto = escXml(placa.cta);
    const ctaW = Math.max(300, ctaTexto.length * 24 + 90);
    const ctaX = align === 'centro' ? (W - ctaW) / 2 : align === 'derecha' ? W - margenL - ctaW : margenL;
    s += '<rect x="' + ctaX + '" y="' + y + '" rx="52" width="' + ctaW + '" height="' + ctaH + '" fill="' + GOLD + '"/>';
    s += '<text x="' + (ctaX + ctaW / 2) + '" y="' + (y + ctaH / 2 + 13) + '" text-anchor="middle" ' +
      'font-family="Montserrat" font-weight="bold" font-size="38" fill="' + DARK + '">' + ctaTexto + '</text>';
  }

  // Scrim: velo oscuro suave SOLO detrás del bloque de texto, para despegarlo
  // de fondos sucios (sillas, mesas, etc.) sin oscurecer toda la foto.
  const pad = 56;
  const scrimTop = Math.max(0, bloqueTop - pad);
  const scrimBot = Math.min(H, y + pad);
  const scrim =
    '<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#000" stop-opacity="0"/>' +
    '<stop offset=".22" stop-color="#000" stop-opacity=".5"/>' +
    '<stop offset=".78" stop-color="#000" stop-opacity=".5"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>';
  const scrimRect = '<rect x="0" y="' + scrimTop + '" width="' + W + '" height="' +
    (scrimBot - scrimTop) + '" fill="url(#scrim)"/>';

  return Buffer.from(
    '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' + gradiente(trato, W, H) + scrim + '</defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' + scrimRect + s + '</svg>'
  );
}

// CRITERIO: mira la foto ya recortada y decide en qué zona va el texto para
// NO tapar caras, manos trabajando ni el plato principal. Devuelve {vert,horiz}.
const COMPO_SYSTEM = `Mirás una imagen que será el FONDO de una placa vertical de redes.
Encima va un bloque de texto. Tu trabajo: decir en qué zona ponerlo para NO tapar lo
importante (caras, manos trabajando, el plato/comida principal, el sujeto).

Devolvé SOLO un JSON:
{ "vert": "arriba"|"abajo"|"centro", "horiz": "izquierda"|"derecha"|"centro",
  "marcaVisible": true|false }

Criterio de diseñador:
- Elegí la zona MÁS VACÍA y tranquila (pared, cielo, mesa lisa, fondo desenfocado, sombra).
- Si el sujeto/cara está a la derecha, mandá el texto a la IZQUIERDA (y viceversa).
- Si la comida o las manos están en la mitad de abajo, mandá el texto ARRIBA.
- Si la cara está arriba, no uses "arriba".
- Lo que mandes tiene que tener lugar para varias líneas sin pisar la cara ni el plato.
- "marcaVisible": true SOLO si la foto YA muestra la marca "Pizzería Popular" de forma
  clara y protagónica (cartel del local, logo grande en pared, o remeras del equipo
  bien legibles). En ese caso NO hace falta sobreimprimir el logo. Si no se ve la
  marca o es mínima, poné false.`;

async function analizarComposicion(buf) {
  try {
    const thumb = await sharp(buf).resize(540, 540, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer();
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      system: COMPO_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') } },
          { type: 'text', text: '¿En qué zona pongo el texto sin tapar lo importante?' },
        ],
      }],
    });
    let t = '';
    for (const b of resp.content) if (b.type === 'text') t += b.text;
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const d = JSON.parse(m[0]);
    return {
      vert: ['arriba', 'abajo', 'centro'].includes(d.vert) ? d.vert : 'abajo',
      horiz: ['izquierda', 'derecha', 'centro'].includes(d.horiz) ? d.horiz : 'izquierda',
      marcaVisible: d.marcaVisible === true,
    };
  } catch (e) { return null; }
}

// Prepara el logo (escalado + sombra suave) listo para componer arriba-centro.
// Devuelve { capas, top } o null si la variante no existe.
async function prepararLogo(variante, W, H) {
  const def = LOGOS[variante] || LOGOS[LOGO_DEFAULT];
  if (!def) return null;
  const esHistoria = H > 1500;
  const file = path.join(LOGO_DIR, def.file);

  // Logo chico y discreto (estilo marca, no cartel), arriba al centro.
  let logo;
  if (def.tipo === 'iso') {
    logo = await sharp(file).resize({ height: esHistoria ? 116 : 100 }).png().toBuffer();
  } else {
    logo = await sharp(file).resize({ width: esHistoria ? 264 : 236 }).png().toBuffer();
  }
  const meta = await sharp(logo).metadata();
  const left = Math.round((W - meta.width) / 2);
  const top = esHistoria ? 72 : 56;

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
  // Ubicación del texto: si el usuario forzó un estilo fijo, usamos su posición;
  // si no ('auto'), la IA mira la foto y decide para no tapar caras/comida.
  const estName = placa.estilo && placa.estilo !== 'auto' ? placa.estilo : null;
  let zona;
  if (estName && ESTILOS[estName]) {
    const e = ESTILOS[estName];
    zona = {
      vert: e.pos === 'top' ? 'arriba' : e.pos === 'center' ? 'centro' : 'abajo',
      horiz: e.align === 'center' ? 'centro' : e.align === 'right' ? 'derecha' : 'izquierda',
    };
  } else {
    zona = await analizarComposicion(foto);
  }
  const capas = [{ input: svgTexto(placa, w, h, numero, total, zona), left: 0, top: 0 }];
  // No duplicar la marca: si la foto ya la muestra, no sobreimprimimos el logo
  // (salvo que el usuario lo fuerce con logo === 'siempre').
  const yaTieneMarca = zona && zona.marcaVisible && placa.logo !== 'siempre';
  if (!yaTieneMarca) {
    const logo = await prepararLogo(placa.logo || LOGO_DEFAULT, w, h);
    if (logo) capas.push(...logo.capas);
  }
  return sharp(foto)
    .composite(capas)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

// Resuelve la foto de una placa EN RESOLUCIÓN COMPLETA (no la miniatura de
// preview, que pixela al ampliar a 1080×1920). Prioriza el Drive.
async function fotoDePlaca(placa) {
  if (placa.driveId) return downloadFile(placa.driveId);
  if (placa.iaPrompt) return generarImagenIA(placa.iaPrompt);
  if (placa.fotoUrl) {
    const r = await fetch(placa.fotoUrl);
    if (!r.ok) throw new Error('No pude bajar la foto: HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('La placa no tiene foto (elegí una del banco o generala con IA).');
}

// ---- Pipeline completo: placas → piezas subidas al storage ----
async function generarPiezas(formato, placas) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  const lote = Date.now();
  const urls = [];
  for (let i = 0; i < placas.length; i++) {
    const fotoBuf = await fotoDePlaca(placas[i]);
    const pieza = await componerPlaca(placas[i], fotoBuf, f, i + 1, placas.length);
    const objectPath = 'social/' + lote + '-' + f + '-' + (i + 1) + '.jpg';
    const { error } = await supabaseAdmin.storage.from('ppweb-blog')
      .upload(objectPath, pieza, { contentType: 'image/jpeg' });
    if (error) throw new Error('Storage: ' + error.message);
    urls.push(supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl);
  }
  return urls;
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

module.exports = { generarCopy, ajustarCopy, generarPiezas, generarImagenIA, geminiDisponible, materializarFoto, componerPlaca, fotoDePlaca, FORMATOS, LOGOS, ESTILO_LIST };
