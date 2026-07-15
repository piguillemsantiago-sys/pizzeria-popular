// ============================================================================
// GENERADOR DE PORTADAS DE REEL — modelos fijos diseñados con el dueño (15 jul 2026)
//
// Regla madre (aprendida a golpes el 15/7): la IA PINTA, el CÓDIGO POSICIONA.
// Gemini nunca decide dónde va un texto ni el logo: los modelos con posiciones
// críticas se componen con sharp + las tipografías reales del proyecto.
//
// Modelos:
//   producto  → 100% código: degradé cálido + serif Abril Fatface blanca +
//               cursiva Abuget dorada + logo real abajo. (portada-flan-FINAL)
//   partido   → Gemini pinta el póster A1: banderas reales grandes + VS +
//               equipos edge-to-edge. Logo por código.
//   elegante  → Gemini pinta B3: viñeteado nocturno + cursiva dorada gigante
//               (con muestra Abuget real). Logo por código.
//   impacto   → Gemini pinta C2: banda diagonal granate/dorado angosta abajo.
//               Logo por código.
//   auto      → el director elige el modelo según el motivo.
//
// Zona segura de Instagram: la grilla recorta a 3:4 centrado → el 15% superior
// e inferior del 9:16 se pierde. En los modelos por código está garantizado por
// coordenadas; en los pintados se instruye + el control revisa el recorte real.
// ============================================================================
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const path = require('path');
const { supabaseAdmin } = require('./supabase');

const client = new Anthropic({ timeout: 120000, maxRetries: 1 });
const DIRECTOR_MODEL = () => process.env.CLAUDE_COPY_MODEL || 'claude-opus-4-8';
const PINTOR_MODEL = () => process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';
const LOGOS_DIR = path.join(__dirname, '..', 'public', 'images', 'logos');

const W = 1080, H = 1920;
const SAFE_SUP = 288, SAFE_INF = 1632; // franja central que la grilla NO recorta

// ---- Helpers compartidos (mismo estilo que generador2) ----
function extraerJSON(texto) {
  const m = String(texto).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió JSON.');
  return JSON.parse(m[0]);
}

async function llamarGemini(parts) {
  const hacer = async () => {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + PINTOR_MODEL() + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio: '9:16' } } }),
      }
    );
    if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    const img = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData && p.inlineData.data);
    if (!img) throw new Error('Gemini no devolvió una imagen.');
    return Buffer.from(img.inlineData.data, 'base64');
  };
  try { return await hacer(); } catch (e) { return hacer(); }
}

function escaparXML(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Medir la TINTA REAL de un texto renderizado (no estimar): render + trim.
// OJO: metadata() tras trim() devuelve el lienzo ORIGINAL; el tamaño recortado
// hay que sacarlo del info del buffer procesado (bug del 15/7: todos los
// textos salían al piso mínimo porque "medían" 4000px siempre).
async function medirTexto(fontFamily, fontSize, texto) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1200">' +
    '<rect width="100%" height="100%" fill="white"/>' +
    '<text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="' + fontFamily + '" font-size="' + fontSize + '" fill="black">' + escaparXML(texto) + '</text></svg>';
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const { info } = await sharp(buf).trim({ threshold: 5 }).toBuffer({ resolveWithObject: true });
  return { width: info.width || 0, height: info.height || 0 };
}

// Achicar el font-size hasta que el texto entre en maxWidth (tinta real).
async function ajustarTamano(fontFamily, fontSize, texto, maxWidth) {
  const m = await medirTexto(fontFamily, fontSize, texto);
  if (m.width <= maxWidth || !m.width) return fontSize;
  return Math.floor(fontSize * maxWidth / m.width);
}

// Muestra de la caligrafía Abuget real (referencia de letras para el pintor).
async function muestraAbuget(texto) {
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="420"><rect width="100%" height="100%" fill="white"/><text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="Abuget" font-size="190" fill="black">' + escaparXML(texto) + '</text></svg>';
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const rec = await sharp(buf).trim({ threshold: 5 }).flatten({ background: 'white' }).png().toBuffer();
    return { inlineData: { mimeType: 'image/png', data: rec.toString('base64') } };
  } catch (e) { return null; }
}

// ---- Criterio de logo por MEDICIÓN, no a ojo: se mide la luminancia real del
// LUGAR EXACTO donde va a caer el logo (no una franja genérica: el 15/7 una
// franja que mezclaba salsa oscura y plato claro eligió blanco-sobre-blanco). ----
async function elegirLogo(baseBuf, preferencia, ancho, soloZona) {
  const caja = { w: ancho || 430, h: Math.round((ancho || 430) * 0.29) };
  // Varias posiciones candidatas por zona: se queda con el fondo MÁS LIMPIO
  // (menor ruido), penalizando levemente salirse de la zona preferida.
  // soloZona: en modelos donde el CÓDIGO ya puso texto en una zona, el logo
  // tiene PROHIBIDA esa zona (el 15/7 se montó sobre el título "Pizza").
  let candidatas = [
    { nombre: 'inferior', top: 1390 }, { nombre: 'inferior', top: 1450 }, { nombre: 'inferior', top: 1505 },
    { nombre: 'superior', top: 310 }, { nombre: 'superior', top: 380 },
  ];
  if (soloZona) candidatas = candidatas.filter((c) => c.nombre === soloZona);
  const medidas = [];
  for (const c of candidatas) {
    const { data, info } = await sharp(baseBuf).extract({
      left: Math.round((W - caja.w) / 2), top: c.top, width: caja.w, height: caja.h,
    }).resize(60, 18, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const lums = new Array(n);
    let claros = 0, oscuros = 0;
    for (let i = 0; i < n; i++) {
      const l = 0.299 * data[i * info.channels] + 0.587 * data[i * info.channels + 1] + 0.114 * data[i * info.channels + 2];
      lums[i] = l;
      if (l > 140) claros++;
      else if (l < 90) oscuros++;
    }
    lums.sort((a, b) => a - b);
    // Fondo "sucio" = mezcla pareja de claros y oscuros: ahí ningún logo lee bien.
    const mezcla = Math.min(claros, oscuros) / n;
    const castigo = c.nombre === (preferencia || 'inferior') ? 0 : 0.10;
    medidas.push({ ...c, mediana: lums[Math.floor(n / 2)], puntaje: mezcla + castigo });
  }
  medidas.sort((a, b) => a.puntaje - b.puntaje);
  const zona = medidas[0];
  // Contraste contra lo que de verdad domina el fondo: la MEDIANA (el promedio
  // y el conteo engañan con fondos bimodales — hilos de queso claros sobre
  // mesa oscura eligieron logo oscuro ilegible el 15/7).
  const variante = zona.mediana > 118 ? 'oscuro' : 'blanco';
  return { top: zona.top, variante, zona: zona.nombre + '@' + zona.top, lum: Math.round(zona.mediana) };
}

async function ponerLogo(buf, { ancho, preferencia, soloZona }) {
  const el = await elegirLogo(buf, preferencia, ancho, soloZona);
  const logo = await sharp(path.join(LOGOS_DIR, 'wordmark-' + el.variante + '.png'))
    .resize({ width: ancho || 430 }).png().toBuffer();
  const lm = await sharp(logo).metadata();
  const left = Math.round((W - lm.width) / 2);
  const capas = [];
  if (el.variante === 'blanco') {
    // Sombra suave detrás del logo blanco: legible aunque el fondo tenga
    // zonas claras (hilos de queso, vajilla).
    const alpha = await sharp(logo).ensureAlpha().extractChannel(3).toBuffer();
    const sombra = await sharp({ create: { width: lm.width, height: lm.height, channels: 3, background: '#160b02' } })
      .joinChannel(alpha).png().blur(7).toBuffer();
    capas.push({ input: sombra, left, top: el.top + 5 });
  }
  capas.push({ input: logo, left, top: el.top });
  const out = await sharp(buf).composite(capas).jpeg({ quality: 92 }).toBuffer();
  return { buf: out, logo: el };
}

// ---- Limpieza de la captura: solo si HAY interfaz encima (se verifica mirando) ----
async function limpiarFoto(fotoBuf) {
  const small = await sharp(fotoBuf).resize({ width: 900, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const check = await client.messages.create({
    model: DIRECTOR_MODEL(),
    max_tokens: 120,
    system: 'Mirá la imagen y respondé SOLO un JSON {"ui": true/false}: ¿tiene elementos de interfaz superpuestos (botón de play, subtítulos, íconos de app, tarjetas, barras, avatares)? Una foto limpia = false.',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: small.toString('base64') } },
      { type: 'text', text: '¿Tiene interfaz encima?' },
    ] }],
  });
  let vtxt = '';
  for (const b of check.content) if (b.type === 'text') vtxt += b.text;
  let tieneUI = false;
  try { tieneUI = !!extraerJSON(vtxt).ui; } catch (e) { tieneUI = false; }
  if (!tieneUI) {
    console.log('[Portadas] foto limpia, sin limpieza IA');
    return sharp(fotoBuf).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();
  }
  console.log('[Portadas] la captura tiene UI: limpiando con Gemini');
  const limpia = await llamarGemini([
    { inlineData: { mimeType: 'image/jpeg', data: (await sharp(fotoBuf).jpeg({ quality: 92 }).toBuffer()).toString('base64') } },
    { text: 'Limpiá esta captura de pantalla de un video: eliminá TODOS los elementos de interfaz superpuestos (botón de play, tarjetas, subtítulos, íconos, avatares, barras y controles) y reconstruí la fotografía que queda detrás de cada uno de forma natural. TODO lo demás queda IDÉNTICO: personas, comida, lugar, luz. Mejorá nitidez y calidad como foto vertical 9:16 de alta resolución, sin cambiar la escena. Resultado: SOLO la foto limpia, sin ningún texto ni gráfico.' },
  ]);
  return sharp(limpia).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();
}

// ---- Director: interpreta el motivo y llena el modelo elegido ----
const DIRECTOR_SYSTEM = `Sos el director de arte de Pizzería Popular (pizza al horno de leña, cocina argentina en España). Preparás la PORTADA de un reel de Instagram a partir del pedido del dueño y una foto. Respondés SOLO un JSON.

MODELOS DISPONIBLES:
- "producto": para platos/comida. El código compone: el nombre del producto en serif elegante + un remate en caligrafía manuscrita dorada. Campos: serif (1 palabra corta, capitalizada tipo "Flan") y cursiva (1 palabra, minúsculas). REGLA DURA: las dos salen de las PALABRAS EXACTAS del pedido — si el dueño escribió "flan mixto", serif="Flan" y cursiva="mixto". PROHIBIDO agregar palabras que el dueño no escribió (nada de "casero", "artesanal" ni adjetivos inventados).
- "partido": para partidos de fútbol país vs país. Campos: equipos (["ARGENTINA","INGLATERRA"]), banderas ISO alpha-2 (["ar","gb-eng"]; Inglaterra="gb-eng", NO "gb"), kicker (ej "SEMIFINAL · COPA DEL MUNDO"), horario (ej "HOY · 21:00 HS").
- "elegante": para cualquier motivo con clima premium/nocturno. Campo: cursiva (frase corta manuscrita) y opcional secundario (línea chica en mayúsculas).
- "impacto": banda diagonal con texto gigante. Campo: titulo (corto, en mayúsculas).

Si el pedido dice modelo "auto", elegí el modelo que mejor le calce al motivo.
Reglas: los textos del dueño se respetan EXACTOS si los dicta (solo corregís tildes); si da una idea, escribís vos con voseo argentino natural y honestidad total (nunca prometer lo que el negocio no dijo: partidos se "pasan en vivo", jamás "pantalla gigante"; sin precios ni promos inventadas). Textos CORTOS: es una portada, no un afiche. Tildes perfectas.
JSON: { "modelo": "...", "serif": "", "cursiva": "", "equipos": [], "banderas": [], "kicker": "", "horario": "", "secundario": "", "titulo": "" } — llenás solo los campos del modelo elegido, el resto va vacío.`;

async function dirigirPortada({ modelo, texto }) {
  const resp = await client.messages.create({
    model: DIRECTOR_MODEL(),
    max_tokens: 600,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: 'user', content: 'MODELO PEDIDO: ' + modelo + '\nPEDIDO DEL DUEÑO:\n' + texto }],
  });
  let out = '';
  for (const b of resp.content) if (b.type === 'text') out += b.text;
  const plan = extraerJSON(out);
  if (!plan.modelo || (modelo !== 'auto' && plan.modelo !== modelo)) plan.modelo = modelo === 'auto' ? (plan.modelo || 'producto') : modelo;
  return plan;
}

// ---- MODELO PRODUCTO: 100% código (receta portada-flan-FINAL, validada 15/7) ----
async function componerProducto(baseBuf, serif, cursiva) {
  // REGLA DE ORO (dueño, 15/7): el MARGEN lateral gana SIEMPRE. Acá no hay
  // tamaño mínimo: una palabra larga sale más chica, jamás pegada al borde.
  // (El bug de "Empanadas"/"argentinas" al borde era un Math.max(mínimo, ...)
  // que le ganaba al presupuesto de ancho.)
  const sSize = await ajustarTamano('Abril Fatface', 350, serif, 860);
  let cSize = cursiva ? await ajustarTamano('Abuget', 560, cursiva, 950) : 0;
  // Jerarquía del lockup aprobado (350/560 = 1.6): si el título achica por
  // largo, la cursiva acompaña — nunca una cursiva gigante sobre un título enano.
  if (cSize) cSize = Math.min(cSize, Math.round(sSize * 1.6));
  const ySerif = cursiva ? 620 : 740;
  // La cursiva se cuelga del título según su tamaño real (con 560 da el y=930
  // del modelo aprobado); con textos más chicos el bloque se compacta solo.
  const yCursiva = ySerif + Math.round(cSize * 0.56);
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    '<defs>' +
    '<linearGradient id="top" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#160b02" stop-opacity="0.88"/>' +
    '<stop offset="0.5" stop-color="#160b02" stop-opacity="0.55"/>' +
    '<stop offset="1" stop-color="#160b02" stop-opacity="0"/>' +
    '</linearGradient>' +
    '<linearGradient id="oro" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ffe9b0"/><stop offset="0.5" stop-color="#eec36a"/><stop offset="1" stop-color="#c69539"/>' +
    '</linearGradient>' +
    '<filter id="s" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#160b02" flood-opacity="0.95"/>' +
    '</filter>' +
    '<filter id="s2" x="-25%" y="-25%" width="150%" height="150%">' +
    '<feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#160b02" flood-opacity="1"/>' +
    '<feDropShadow dx="0" dy="0" stdDeviation="30" flood-color="#160b02" flood-opacity="0.85"/>' +
    '</filter>' +
    '</defs>' +
    '<rect width="' + W + '" height="1000" fill="url(#top)"/>' +
    // Degradé espejo abajo: cama oscura garantizada para el logo blanco,
    // venga la foto que venga (queso claro hasta el borde incluido).
    '<linearGradient id="pie" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0" stop-color="#160b02" stop-opacity="0.82"/>' +
    '<stop offset="0.55" stop-color="#160b02" stop-opacity="0.45"/>' +
    '<stop offset="1" stop-color="#160b02" stop-opacity="0"/>' +
    '</linearGradient>' +
    '<rect y="' + (H - 560) + '" width="' + W + '" height="560" fill="url(#pie)"/>' +
    '<text x="540" y="' + ySerif + '" text-anchor="middle" font-family="Abril Fatface" font-size="' + sSize + '" fill="#ffffff" filter="url(#s)">' + escaparXML(serif) + '</text>' +
    (cursiva ? '<text x="540" y="' + yCursiva + '" text-anchor="middle" font-family="Abuget" font-size="' + cSize + '" fill="url(#oro)" filter="url(#s2)">' + escaparXML(cursiva) + '</text>' : '') +
    '</svg>'
  );
  return sharp(baseBuf).composite([{ input: svg }]).jpeg({ quality: 92 }).toBuffer();
}

// ---- Modelos pintados: canon A1 / B3 / C2 (validados con el dueño el 15/7) ----
const SAFE_TXT = ' ZONA SEGURA OBLIGATORIA: el 15% superior y el 15% inferior de la imagen quedan LIBRES de todo texto y elemento gráfico (Instagram recorta la portada arriba y abajo): toda la gráfica va en la franja central.';
const GUARDA_TXT = ' La FOTO de fondo queda IDÉNTICA: personas, comida y lugar no se tocan, y ningún elemento gráfico tapa caras ni el plato protagonista. Todos los textos EXACTOS, letra por letra, con tildes. No agregues ningún otro texto, precio, logo ni escudo que no te pida.';

async function pintarModelo(plan, baseBuf) {
  const parts = [{ inlineData: { mimeType: 'image/jpeg', data: baseBuf.toString('base64') } }];
  const textosEsperados = [];
  let prompt = '';
  if (plan.modelo === 'partido') {
    const isos = (plan.banderas || []).slice(0, 2);
    for (const iso of isos) {
      const r = await fetch('https://flagcdn.com/w320/' + iso + '.png');
      if (r.ok) parts.push({ inlineData: { mimeType: 'image/png', data: Buffer.from(await r.arrayBuffer()).toString('base64') } });
    }
    const eq = plan.equipos || [];
    textosEsperados.push(plan.kicker, eq[0], 'VS', eq[1], plan.horario);
    prompt = 'La imagen 1 es la FOTO de fondo. Las imágenes 2 y 3 son las banderas REALES de ' + eq.join(' e ') + ': cuando dibujes banderas copiá EXACTAMENTE esos diseños y colores. ' +
      'Agregá la gráfica de portada de reel estilo póster de hincha con MUCHO impacto: un degradé oscuro fuerte en la mitad inferior; sobre él, centrada, una fila con la primera bandera GRANDE con borde blanco a la izquierda, un "VS" en condensada blanca gigante en el medio, y la segunda bandera GRANDE con borde blanco a la derecha, las dos con leve textura de tela; debajo, EDGE A EDGE y bien GRANDE, "' + eq[0] + '" / "' + eq[1] + '" en dos líneas de condensada bold blanca con textura de tinta gastada y un separador fino entre líneas; arriba del bloque, chico y espaciado en mayúsculas doradas "' + plan.kicker + '"; y debajo del bloque una etiqueta de papel crema con "' + plan.horario + '" en oscuro.';
  } else if (plan.modelo === 'elegante') {
    const m = await muestraAbuget(plan.cursiva);
    if (m) parts.push(m);
    textosEsperados.push(plan.cursiva);
    if (plan.secundario) textosEsperados.push(plan.secundario);
    prompt = 'La imagen 1 es la FOTO de fondo.' + (m ? ' La imagen 2 es una MUESTRA de la caligrafía manuscrita de la marca con el texto exacto "' + plan.cursiva + '": copiá esas formas de letra TAL CUAL, pintadas en dorado cálido.' : '') +
      ' Agregá la gráfica de portada de reel elegante nocturna: viñeteado oscuro cálido en los bordes (el protagonista de la foto queda bien iluminado) y un resplandor dorado sutil con destellos finos; la caligrafía manuscrita dorada GIGANTE "' + plan.cursiva + '" cruzando la franja central-superior sin tapar al protagonista' +
      (plan.secundario ? '; debajo en serif blanca en mayúsculas espaciadas chica "' + plan.secundario + '"' : '') + '.';
  } else { // impacto
    textosEsperados.push(plan.titulo);
    prompt = 'La imagen es la FOTO de fondo. Agregá la gráfica de portada de reel con MUCHO impacto: una banda en DIAGONAL suave, ANGOSTA, en la franja inferior de la imagen (SIN tapar al protagonista de la foto, que queda completamente visible arriba de la banda), dividida en dos mitades — una granate oscuro y otra dorado cálido — separadas por un rayo diagonal dorado brillante; sobre la banda, en condensada bold blanca GIGANTE con contorno oscuro sutil, "' + plan.titulo + '" en una línea, con leve inclinación siguiendo la diagonal.';
  }
  parts.push({ text: prompt + GUARDA_TXT + SAFE_TXT });
  const pintada = await llamarGemini(parts);
  return { buf: await sharp(pintada).resize(W, H, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer(), textosEsperados: textosEsperados.filter(Boolean) };
}

// ---- Control de calidad: imagen completa + recorte 3:4 real de la grilla ----
async function controlarPortada(buf, textos) {
  const thumb = await sharp(buf).resize(768, 1366, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const crop = await sharp(buf).extract({ left: 0, top: 240, width: W, height: 1440 })
    .resize(576, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const resp = await client.messages.create({
    model: DIRECTOR_MODEL(),
    max_tokens: 700,
    system: 'Sos el control de calidad de portadas de reel de Pizzería Popular. Te paso la portada completa (imagen 1) y el recorte 3:4 con el que Instagram la muestra en la grilla (imagen 2), más la lista de TEXTOS que deben aparecer. Devolvé SOLO un JSON {"ok": true/false, "errores": ["..."]}. Errores GRAVES: un texto esperado que falta o está mal escrito (letra por letra, tildes incluidas); texto inventado que no está en la lista; un texto CORTADO en el recorte 3:4 (imagen 2); un logo o escudo dibujado por la IA; la cara de una persona o el plato protagonista tapados por la gráfica; caligrafía renderizada como itálica de imprenta en vez de manuscrita. NO son error: el logo real "PIZZERÍA POPULAR" con la llama, mayúsculas/minúsculas, texto impreso que ya estaba en la foto original (papeles, remeras).',
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: crop.toString('base64') } },
      { type: 'text', text: 'TEXTOS ESPERADOS:\n' + (textos.map((t) => '"' + t + '"').join('\n') || '(ninguno)') },
    ] }],
  });
  let out = '';
  for (const b of resp.content) if (b.type === 'text') out += b.text;
  try {
    const v = extraerJSON(out);
    return { ok: !!v.ok, errores: Array.isArray(v.errores) ? v.errores : [] };
  } catch (e) { return { ok: true, errores: [], sinControl: true }; }
}

async function subir(buf) {
  const objectPath = 'social/portadas/' + Date.now() + '-portada.jpg';
  const { error } = await supabaseAdmin.storage.from('ppweb-blog')
    .upload(objectPath, buf, { contentType: 'image/jpeg' });
  if (error) throw new Error('Storage: ' + error.message);
  return supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl;
}

// ---- Entrada principal ----
async function generarPortada({ modelo, texto, foto }) {
  if (!process.env.GEMINI_API_KEY) { const e = new Error('Falta GEMINI_API_KEY.'); e.code = 'NO_KEY'; throw e; }
  const fotoBuf = Buffer.from(String(foto).replace(/^data:image\/\w+;base64,/, ''), 'base64');
  if (!fotoBuf.length) throw new Error('No llegó la foto del reel.');
  const avisos = [];

  const [plan, base] = await Promise.all([
    dirigirPortada({ modelo, texto: String(texto).trim() }),
    limpiarFoto(fotoBuf),
  ]);
  console.log('[Portadas] modelo=' + plan.modelo + ' plan=' + JSON.stringify(plan));

  let final;
  let textos;
  if (plan.modelo === 'producto') {
    const serif = plan.serif || String(texto).trim();
    const compuesta = await componerProducto(base, serif, plan.cursiva || '');
    // El modelo producto trae su cama oscura abajo: logo blanco FIJO ahí.
    // (Buscar zona limpia falló el 15/7: hay fotos sin ninguna zona limpia.)
    const logo = await sharp(path.join(LOGOS_DIR, 'wordmark-blanco.png')).resize({ width: 430 }).png().toBuffer();
    const lmeta = await sharp(logo).metadata();
    final = await sharp(compuesta).composite([
      { input: logo, left: Math.round((W - lmeta.width) / 2), top: 1490 },
    ]).jpeg({ quality: 92 }).toBuffer();
    console.log('[Portadas] logo blanco fijo sobre la cama oscura del pie');
    textos = [serif, plan.cursiva].filter(Boolean);
    // Por código las posiciones son exactas: el control solo revisa que nada tape lo importante.
    const verif = await controlarPortada(final, textos);
    if (!verif.ok) verif.errores.forEach((e) => avisos.push('⚠️ ' + e));
  } else {
    let mejor = null;
    for (let intento = 1; intento <= 2; intento++) {
      const pintada = await pintarModelo(plan, base);
      const conLogo = await ponerLogo(pintada.buf, { ancho: 380, preferencia: plan.modelo === 'partido' ? 'superior' : 'inferior' });
      console.log('[Portadas] intento ' + intento + ' logo ' + conLogo.logo.variante + ' zona ' + conLogo.logo.zona);
      const verif = await controlarPortada(conLogo.buf, pintada.textosEsperados);
      if (!mejor || verif.errores.length < mejor.verif.errores.length) mejor = { buf: conLogo.buf, verif, textos: pintada.textosEsperados };
      if (verif.ok) { mejor = { buf: conLogo.buf, verif, textos: pintada.textosEsperados }; break; }
      console.error('[Portadas] intento ' + intento + ' con errores:', verif.errores.join(' · '));
    }
    if (!mejor.verif.ok) mejor.verif.errores.forEach((e) => avisos.push('⚠️ ' + e + ' — tocá «Generar portada» para otra tirada.'));
    final = mejor.buf;
    textos = mejor.textos;
  }

  const url = await subir(final);
  return { url, modelo: plan.modelo, textos, avisos };
}

module.exports = { generarPortada };
