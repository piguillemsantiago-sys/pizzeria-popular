require('dotenv').config();
// Portada "visitanos en Benidorm" PRO: foto re-limpiada y mejorada en 2K +
// modelo ELEGANTE canónico (viñeteado cálido, resplandor dorado con destellos,
// caligrafía Abuget dorada gigante con muestra real) + logo por medición.
// Uso en VPS (desde la raíz): node scripts/test-portada-benidorm-elegante.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1080, H = 1920;
const CURSIVA = 'visitanos en Benidorm';
const MODEL = process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';
const LOGOS_DIR = path.join(__dirname, '..', 'public', 'images', 'logos');

const SAFE_TXT = ' ZONA SEGURA OBLIGATORIA: el 15% superior y el 15% inferior de la imagen quedan LIBRES de todo texto y elemento gráfico (Instagram recorta la portada arriba y abajo): toda la gráfica va en la franja central.';
const GUARDA_TXT = ' La FOTO de fondo queda IDÉNTICA: personas, comida y lugar no se tocan, y ningún elemento gráfico tapa caras ni el plato protagonista. Todos los textos EXACTOS, letra por letra, con tildes. No agregues ningún otro texto, precio, logo ni escudo que no te pida.';

function escaparXML(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function llamarGemini(parts) {
  const hacer = async () => {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio: '9:16', imageSize: '2K' } } }),
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

async function muestraAbuget(texto) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="420"><rect width="100%" height="100%" fill="white"/><text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="Abuget" font-size="190" fill="black">' + escaparXML(texto) + '</text></svg>';
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const rec = await sharp(buf).trim({ threshold: 5 }).flatten({ background: 'white' }).png().toBuffer();
  return { inlineData: { mimeType: 'image/png', data: rec.toString('base64') } };
}

async function elegirLogo(baseBuf, preferencia, ancho, soloZona) {
  const caja = { w: ancho || 430, h: Math.round((ancho || 430) * 0.29) };
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
    const mezcla = Math.min(claros, oscuros) / n;
    const castigo = c.nombre === (preferencia || 'inferior') ? 0 : 0.10;
    medidas.push({ ...c, mediana: lums[Math.floor(n / 2)], puntaje: mezcla + castigo });
  }
  medidas.sort((a, b) => a.puntaje - b.puntaje);
  const zona = medidas[0];
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
    const alpha = await sharp(logo).ensureAlpha().extractChannel(3).toBuffer();
    const sombra = await sharp({ create: { width: lm.width, height: lm.height, channels: 3, background: '#160b02' } })
      .joinChannel(alpha).png().blur(7).toBuffer();
    capas.push({ input: sombra, left, top: el.top + 5 });
  }
  capas.push({ input: logo, left, top: el.top });
  const out = await sharp(buf).composite(capas).jpeg({ quality: 95 }).toBuffer();
  return { buf: out, logo: el };
}

(async () => {
  // 1) Re-limpiar la captura ORIGINAL en 2K con mejora de calidad (receta limpiarFoto).
  const raw = fs.readFileSync(path.join(__dirname, 'reel-benidorm-raw.jpg'));
  const meta = await sharp(raw).metadata();
  const recorte = await sharp(raw).extract({ left: 10, top: 72, width: meta.width - 20, height: meta.height - 80 }).jpeg({ quality: 95 }).toBuffer();
  const limpia = await llamarGemini([
    { inlineData: { mimeType: 'image/jpeg', data: recorte.toString('base64') } },
    { text: 'Limpiá esta captura de pantalla de un video: eliminá TODOS los elementos de interfaz superpuestos (botón de play, tarjetas, subtítulos, íconos, avatares, barras y controles) y reconstruí la fotografía que queda detrás de cada uno de forma natural. TODO lo demás queda IDÉNTICO: personas, comida, lugar, luz. Mejorá nitidez y calidad como foto vertical 9:16 de alta resolución, sin cambiar la escena. Resultado: SOLO la foto limpia, sin ningún texto ni gráfico.' },
  ]);
  const lmeta0 = await sharp(limpia).metadata();
  console.log('foto limpia 2K:', lmeta0.width + 'x' + lmeta0.height);
  fs.writeFileSync(path.join(__dirname, 'benidorm-limpia-2k.png'), limpia);

  // 2) Modelo ELEGANTE canónico con muestra Abuget real.
  const m = await muestraAbuget(CURSIVA);
  const prompt = 'La imagen 1 es la FOTO de fondo. La imagen 2 es una MUESTRA de la caligrafía manuscrita de la marca con el texto exacto "' + CURSIVA + '": copiá esas formas de letra TAL CUAL, pintadas en dorado cálido.' +
    ' Agregá la gráfica de portada de reel elegante nocturna: viñeteado oscuro cálido en los bordes (el protagonista de la foto queda bien iluminado) y un resplandor dorado sutil con destellos finos; la caligrafía manuscrita dorada GIGANTE "' + CURSIVA + '" cruzando la franja central-superior sin tapar al protagonista.';
  const pintada = await llamarGemini([
    { inlineData: { mimeType: 'image/png', data: limpia.toString('base64') } },
    m,
    { text: prompt + GUARDA_TXT + SAFE_TXT },
  ]);

  // 3) Bajar a 1080x1920 (nítido por downscale) + logo por medición (inferior, canon elegante).
  const base = await sharp(pintada).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();
  const conLogo = await ponerLogo(base, { ancho: 380, preferencia: 'inferior', soloZona: 'inferior' });
  console.log('logo ' + conLogo.logo.variante + ' zona ' + conLogo.logo.zona + ' lum ' + conLogo.logo.lum);
  fs.writeFileSync(path.join(__dirname, 'portada-benidorm-elegante.jpg'), conLogo.buf);
  console.log('OK portada-benidorm-elegante.jpg', Math.round(conLogo.buf.length / 1024) + 'KB');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
