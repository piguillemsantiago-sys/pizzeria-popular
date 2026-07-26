require('dotenv').config();
// AJUSTE: misma portada "visitanos en Benidorm" (lockup canónico Abuget dorada +
// Abril blanca gigante + logo, receta de test-portada-benidorm.js SIN tocar) pero
// con la FOTO de fondo embellecida por Gemini (luz, color, nitidez) manteniendo a
// la protagonista idéntica. Uso en VPS: node scripts/test-portada-benidorm-linda.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1080, H = 1920;
const SERIF = 'Benidorm';
const CURSIVA = 'visitanos en';
const MODEL = process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';

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

async function medirTexto(fontFamily, fontSize, texto) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1200">' +
    '<rect width="100%" height="100%" fill="white"/>' +
    '<text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="' + fontFamily + '" font-size="' + fontSize + '" fill="black">' + escaparXML(texto) + '</text></svg>';
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  const { info } = await sharp(buf).trim({ threshold: 5 }).toBuffer({ resolveWithObject: true });
  return { width: info.width || 0, height: info.height || 0 };
}

async function ajustarTamano(fontFamily, fontSize, texto, maxWidth) {
  const m = await medirTexto(fontFamily, fontSize, texto);
  if (m.width <= maxWidth || !m.width) return fontSize;
  return Math.floor(fontSize * maxWidth / m.width);
}

async function componerProducto(baseBuf, serif, cursiva) {
  const sSize = await ajustarTamano('Abril Fatface', 350, serif, 860);
  let cSize = cursiva ? await ajustarTamano('Abuget', 560, cursiva, 950) : 0;
  if (cSize) cSize = Math.min(cSize, Math.round(sSize * 1.6));
  const yCursiva = cursiva ? 560 : 0;
  const ySerif = cursiva ? yCursiva + Math.round(sSize * 0.95) : 740;
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

(async () => {
  // 1) Embellecer la foto limpia 2K SIN tocar a la protagonista.
  const limpia = fs.readFileSync(path.join(__dirname, 'benidorm-limpia-2k.png'));
  const linda = await llamarGemini([
    { inlineData: { mimeType: 'image/png', data: limpia.toString('base64') } },
    { text: 'Mejorá esta foto como lo haría un fotógrafo profesional de viajes, SIN cambiar la escena: ' +
      'luz dorada mediterránea de tarde más cálida y favorecedora, mar más turquesa y vibrante, cielo más limpio y azul, ' +
      'verdes de las palmeras más ricos, mejor contraste y nitidez general, sin ruido. ' +
      'El techo oscuro del balcón en la parte superior puede quedar más discreto y elegante. ' +
      'La MUJER queda EXACTAMENTE IGUAL: misma cara, misma pose, mismo pelo, misma ropa, sin retocarla. ' +
      'Mismo encuadre exacto. Resultado fotorrealista, SOLO la foto: sin ningún texto, gráfico ni marca de agua.' },
  ]);
  fs.writeFileSync(path.join(__dirname, 'benidorm-linda-2k.png'), linda);
  const lm = await sharp(linda).metadata();
  console.log('foto linda 2K:', lm.width + 'x' + lm.height);

  // 2) Misma composición de texto y logo que la versión aprobada (sin cambios).
  const base = await sharp(linda).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();
  const compuesta = await componerProducto(base, SERIF, CURSIVA);
  const logo = await sharp(path.join(__dirname, '..', 'public', 'images', 'logos', 'wordmark-blanco.png'))
    .resize({ width: 430 }).png().toBuffer();
  const lmeta = await sharp(logo).metadata();
  const final = await sharp(compuesta).composite([
    { input: logo, left: Math.round((W - lmeta.width) / 2), top: 1490 },
  ]).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(path.join(__dirname, 'portada-benidorm-linda.jpg'), final);
  console.log('OK portada-benidorm-linda.jpg', Math.round(final.length / 1024) + 'KB');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
