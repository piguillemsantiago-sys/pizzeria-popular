// PRUEBA DE-RIESGO: ¿el modelo PRO (Nano Banana Pro, gemini-3-pro-image-preview)
// pinta una portada editorial de PP con el TEXTO perfecto, estilo Ana Milici?
// Pinta la portada ENTERA (texto incluido) desde un prompt editorial de marca PP.
// Corre en el VPS (necesita GEMINI_API_KEY). No toca el motor todavía.
require('dotenv').config();
const fs = require('fs');
const sharp = require('sharp');

const MODEL = process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';

// Args: node test-portada-pro.js <salida> <titulo> <resaltar> <subtitulo> <hero>
const A = process.argv.slice(2);
const OUT = A[0] || 'portada-pro';
const TITULO = A[1] || 'UNA NOCHE DE PIZZA Y FÚTBOL';
const RESALTAR = A[2] || 'FÚTBOL';
const SUBTITULO = A[3] || 'hoy, en nuestros locales';
const HERO = A[4] || 'a gorgeous wood-fired margherita pizza with melting cheese and leoparded crust, editorial food photography, well framed, not cropped';

// Estructura editorial de Ana, marca PP: kicker + divisoria · hero · titular
// enorme con UNA palabra resaltada en bloque dorado · subtítulo cursiva · franja
// inferior limpia para el logo real. Texto EXACTO entre comillas.
const PROMPT =
  'Premium editorial magazine cover, photorealistic, vertical 9:16 (1080x1920), for an ' +
  'Argentine WOOD-FIRED pizzeria called "Pizzería Popular". Warm, moody, appetizing: deep ' +
  'espresso/charcoal background with the golden glow of a wood-fired oven and warm amber ' +
  'accents (#D8A460). Cinematic dramatic lighting, high-end, uncluttered, generous margins.\n\n' +
  'EXACT EDITORIAL LAYOUT (everything centered):\n' +
  '- TOP: a small uppercase kicker in warm gold with wide letter-spacing that reads exactly ' +
  '"PIZZERÍA POPULAR", and a short thin gold divider line right under it.\n' +
  '- UPPER-CENTER: one single strong hero — ' + HERO + '.\n' +
  '- LOWER-CENTER: a big bold high-contrast title, WHITE uppercase, that reads ' +
  'EXACTLY "' + TITULO + '". Highlight EXACTLY ONE word: the word "' + RESALTAR + '" sits ' +
  'inside a solid gold (#D8A460) rounded block with dark text. Perfect kerning.\n' +
  '- Just under the title: a short subtitle in an elegant warm-gold handwritten script that ' +
  'reads exactly "' + SUBTITULO + '".\n' +
  '- BOTTOM 12%: leave a clean darker strip, empty negative space (a real logo goes there later).\n\n' +
  'Render ALL text razor-sharp, correctly spelled, Spanish accents correct, ' +
  'perfectly legible, premium typography. No watermarks, no borders, no extra text anywhere, ' +
  'nothing in the bottom strip.';

(async () => {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { imageConfig: { aspectRatio: '9:16', imageSize: '2K' } },
      }),
    }
  );
  if (!res.ok) {
    console.error('❌ ' + MODEL + ' → HTTP ' + res.status + ':', (await res.text()).slice(0, 500));
    process.exit(1);
  }
  const data = await res.json();
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) { console.error('❌ no devolvió imagen. Respuesta:', JSON.stringify(data).slice(0, 400)); process.exit(1); }
  const buf = await sharp(Buffer.from(img.inlineData.data, 'base64'))
    .resize(1080, 1920, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  fs.writeFileSync('/tmp/' + OUT + '.jpg', buf);
  console.log('✅ ' + MODEL + ' OK →', '/tmp/' + OUT + '.jpg ·', buf.length, 'bytes');
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
