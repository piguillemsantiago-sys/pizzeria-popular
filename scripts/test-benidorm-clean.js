require('dotenv').config();
// Limpia la UI de Instagram de una captura de reel (Benidorm) con Gemini.
// Uso en VPS: node test-benidorm-clean.js  (espera reel-benidorm-raw.jpg al lado)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MODEL = process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';

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

(async () => {
  const raw = fs.readFileSync(path.join(__dirname, 'reel-benidorm-raw.jpg'));
  // Recorte previo de bordes negros de la captura (banner superior y marcos).
  const meta = await sharp(raw).metadata();
  const crop = { left: 10, top: 72, width: meta.width - 20, height: meta.height - 80 };
  const base = await sharp(raw).extract(crop).jpeg({ quality: 95 }).toBuffer();

  const prompt =
    'Edit this photo: remove every Instagram interface overlay — the big white translucent play triangle in the center, ' +
    'the caption text "con esta vista" (white and yellow words), the small circular photo bubble with the purple remix icon at the bottom left, ' +
    'the round dark mute/speaker icon at the bottom right, and any remaining black bars or dark banner strips at the edges. ' +
    'Reconstruct the scene naturally behind each removed element (sky, sea, palm trees, beach, balcony glass, the woman\'s clothing). ' +
    'Keep EVERYTHING else pixel-identical: same woman, same pose and face, same balcony, same colors, same light, same framing. ' +
    'Photorealistic result. Do not add any new object, person, text or watermark.';

  const out = await llamarGemini([
    { inlineData: { mimeType: 'image/jpeg', data: base.toString('base64') } },
    { text: prompt },
  ]);
  fs.writeFileSync(path.join(__dirname, 'benidorm-limpia.png'), out);
  const m2 = await sharp(out).metadata();
  console.log('OK benidorm-limpia.png', m2.width + 'x' + m2.height, Math.round(out.length / 1024) + 'KB');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
