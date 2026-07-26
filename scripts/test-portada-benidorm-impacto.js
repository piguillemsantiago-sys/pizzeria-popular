require('dotenv').config();
// Portada "VISITANOS EN BENIDORM" con el modelo IMPACTO canónico de
// lib/portadas.js (banda diagonal granate/dorado + título condensado gigante),
// pintado por Gemini + logo por medición de luminancia (receta validada 15/7).
// Uso en VPS (desde la raíz): node scripts/test-portada-benidorm-impacto.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1080, H = 1920;
const TITULO = 'VISITANOS EN BENIDORM';
const MODEL = process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';
const LOGOS_DIR = path.join(__dirname, '..', 'public', 'images', 'logos');

const SAFE_TXT = ' ZONA SEGURA OBLIGATORIA: el 15% superior y el 15% inferior de la imagen quedan LIBRES de todo texto y elemento gráfico (Instagram recorta la portada arriba y abajo): toda la gráfica va en la franja central.';
const GUARDA_TXT = ' La FOTO de fondo queda IDÉNTICA: personas, comida y lugar no se tocan, y ningún elemento gráfico tapa caras ni el plato protagonista. Todos los textos EXACTOS, letra por letra, con tildes. No agregues ningún otro texto, precio, logo ni escudo que no te pida.';

async function llamarGemini(parts) {
  const hacer = async () => {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
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
  const out = await sharp(buf).composite(capas).jpeg({ quality: 92 }).toBuffer();
  return { buf: out, logo: el };
}

(async () => {
  const foto = fs.readFileSync(path.join(__dirname, 'benidorm-limpia.png'));
  const base = await sharp(foto).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();

  const prompt = 'La imagen es la FOTO de fondo. Agregá la gráfica de portada de reel con MUCHO impacto: una banda en DIAGONAL suave, ANGOSTA, en la franja inferior de la imagen (SIN tapar al protagonista de la foto, que queda completamente visible arriba de la banda), dividida en dos mitades — una granate oscuro y otra dorado cálido — separadas por un rayo diagonal dorado brillante; sobre la banda, en condensada bold blanca GIGANTE con contorno oscuro sutil, "' + TITULO + '" en una línea, con leve inclinación siguiendo la diagonal.';

  const pintada = await llamarGemini([
    { inlineData: { mimeType: 'image/jpeg', data: base.toString('base64') } },
    { text: prompt + GUARDA_TXT + SAFE_TXT },
  ]);
  const pintadaBuf = await sharp(pintada).resize(W, H, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();

  // En impacto la banda vive abajo: el logo va a la zona superior SÍ o SÍ (canon).
  const conLogo = await ponerLogo(pintadaBuf, { ancho: 380, preferencia: 'superior', soloZona: 'superior' });
  console.log('logo ' + conLogo.logo.variante + ' zona ' + conLogo.logo.zona + ' lum ' + conLogo.logo.lum);
  fs.writeFileSync(path.join(__dirname, 'portada-benidorm-impacto.jpg'), conLogo.buf);
  console.log('OK portada-benidorm-impacto.jpg', Math.round(conLogo.buf.length / 1024) + 'KB');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
