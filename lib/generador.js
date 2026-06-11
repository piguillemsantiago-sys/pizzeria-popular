// ============================================================
// lib/generador.js — Generador de piezas para redes (historias
// y carruseles). La IA escribe el copy (Claude), la foto sale
// del banco (Drive/storage) o de Gemini (si hay GEMINI_API_KEY),
// y sharp compone la pieza final con la gráfica de la marca.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const { supabaseAdmin } = require('./supabase');
const { downloadFile } = require('./drive');

const client = new Anthropic();

const FORMATOS = {
  historia: { w: 1080, h: 1920, maxPlacas: 1 },
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
    { "titulo": "...", "bajada": "...", "cta": "..." }
  ]
}

Reglas:
- formato "historia": exactamente 1 placa.
- formato "carrusel": 3 a 5 placas. La primera es el GANCHO (que frenen el dedo),
  las del medio desarrollan (una idea por placa), la última es el CTA.
- "titulo": máximo 6 palabras, potente, sin punto final.
- "bajada": máximo 14 palabras, complementa (no repite) el título. Puede ser "".
- "cta": máximo 4 palabras (ej: "Reservá tu mesa", "Pedí el 2×1") o "" si no aplica.
- No inventes promos, precios ni datos: usá SOLO lo que dice la instrucción.
- Tildes y eñes bien escritas. Emojis: máximo 1 por placa, solo si suma.`;

async function generarCopy(instruccion, formato) {
  const f = FORMATOS[formato] ? formato : 'carrusel';
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    system: COPY_SYSTEM,
    messages: [{ role: 'user', content: 'Formato: ' + f + '\nInstrucción: ' + instruccion }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un copy válido.');
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
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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

// SVG con el texto de la placa (gradiente + marca + título + bajada + CTA).
function svgTexto(placa, W, H, numero, total) {
  const esHistoria = H > 1500;
  const tSize = esHistoria ? 96 : 84;
  const bSize = esHistoria ? 42 : 38;
  const tLines = wrap(placa.titulo, esHistoria ? 16 : 18);
  const bLines = wrap(placa.bajada, esHistoria ? 34 : 38);
  const tLH = Math.round(tSize * 1.16);
  const bLH = Math.round(bSize * 1.45);
  const ctaH = placa.cta ? 110 : 0;
  const margen = esHistoria ? 150 : 110;

  // Bloque de texto anclado abajo.
  const bloqueH = tLines.length * tLH + (bLines.length ? 26 + bLines.length * bLH : 0) + (ctaH ? 54 + ctaH : 0);
  let y = H - margen - bloqueH;

  let s = '';
  // Marca arriba
  s += '<text x="' + W / 2 + '" y="' + (esHistoria ? 170 : 130) + '" text-anchor="middle" ' +
    'font-family="Montserrat" font-weight="bold" font-size="34" letter-spacing="12" fill="#fff" opacity=".92">PIZZERÍA POPULAR</text>';
  s += '<rect x="' + (W / 2 - 30) + '" y="' + (esHistoria ? 192 : 152) + '" width="60" height="4" fill="' + GOLD + '"/>';
  // Numerito de placa (carrusel)
  if (total > 1) {
    s += '<text x="' + (W - 70) + '" y="' + (esHistoria ? 175 : 135) + '" text-anchor="end" ' +
      'font-family="Montserrat" font-weight="bold" font-size="30" fill="' + GOLD + '">' + numero + '/' + total + '</text>';
  }
  // Título
  for (const line of tLines) {
    y += tLH;
    s += '<text x="' + margen / 2 + '" y="' + y + '" font-family="Abril Fatface" font-size="' + tSize +
      '" fill="#fff">' + escXml(line) + '</text>';
  }
  // Bajada
  if (bLines.length) {
    y += 26;
    for (const line of bLines) {
      y += bLH;
      s += '<text x="' + margen / 2 + '" y="' + y + '" font-family="Montserrat" font-size="' + bSize +
        '" fill="#fff" opacity=".88">' + escXml(line) + '</text>';
    }
  }
  // CTA
  if (placa.cta) {
    y += 54;
    const ctaTexto = escXml(placa.cta);
    const ctaW = Math.max(300, ctaTexto.length * 24 + 90);
    s += '<rect x="' + margen / 2 + '" y="' + y + '" rx="55" width="' + ctaW + '" height="' + ctaH + '" fill="' + GOLD + '"/>';
    s += '<text x="' + (margen / 2 + ctaW / 2) + '" y="' + (y + ctaH / 2 + 13) + '" text-anchor="middle" ' +
      'font-family="Montserrat" font-weight="bold" font-size="38" fill="' + DARK + '">' + ctaTexto + '</text>';
  }

  return Buffer.from(
    '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#000" stop-opacity=".42"/>' +
    '<stop offset=".4" stop-color="#000" stop-opacity=".05"/>' +
    '<stop offset=".62" stop-color="#000" stop-opacity=".45"/>' +
    '<stop offset="1" stop-color="#000" stop-opacity=".88"/>' +
    '</linearGradient></defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' + s + '</svg>'
  );
}

async function componerPlaca(placa, fotoBuf, formato, numero, total) {
  const { w, h } = FORMATOS[formato] || FORMATOS.carrusel;
  const foto = await sharp(fotoBuf).rotate().resize(w, h, { fit: 'cover' }).toBuffer();
  return sharp(foto)
    .composite([{ input: svgTexto(placa, w, h, numero, total), left: 0, top: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

// Resuelve la foto de una placa: Drive, URL o Gemini.
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

module.exports = { generarCopy, generarPiezas, generarImagenIA, geminiDisponible, materializarFoto, FORMATOS };
