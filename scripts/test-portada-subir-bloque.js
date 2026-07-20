require('dotenv').config();
// v3 — EL CÓDIGO POSICIONA, LA IA CURA. Gemini demostró (4 intentos) que calca la
// posición de la gráfica de la referencia e ignora instrucciones de porcentaje.
// Entonces: se pega POR CÓDIGO la banda gráfica de la portada original 110px más
// arriba sobre la foto limpia, y Gemini solo repara las costuras fotográficas
// (duplicaciones/cortes en piernas y vereda) SIN mover la gráfica.
// Banda original medida: banderas 1154..1252 · pill ~1400..1500 · título 1565..1657.
const sharp = require('sharp');
const fs = require('fs');

const MODEL = process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';
const W = 1080, H = 1920;
const SHIFT = 110;               // corrimiento medido contra portada-reel-final
const BANDA_TOP = 1040, BANDA_BOT = 1720; // banda que contiene TODA la gráfica

async function llamarGemini(parts) {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio: '9:16' } } }),
    }
  );
  if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const img = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error('Gemini no devolvió imagen.');
  return Buffer.from(img.inlineData.data, 'base64');
}

async function medirBandas(buf) {
  const { data, info } = await sharp(buf).resize(W, H, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, umbral = (W - 120) * 0.08;
  const bandas = [];
  let inicio = null;
  for (let y = 900; y < H; y++) {
    let blancos = 0;
    for (let x = 60; x < W - 60; x++) {
      const i = (y * W + x) * ch;
      if (data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) blancos++;
    }
    if (blancos > umbral) { if (inicio === null) inicio = y; }
    else if (inicio !== null) { if (y - inicio > 8) bandas.push([inicio, y - 1]); inicio = null; }
  }
  if (inicio !== null) bandas.push([inicio, H - 1]);
  return bandas;
}

const PROMPT_CURAR =
  'La imagen es una portada de reel casi terminada. La GRÁFICA (fila bandera de España + "VS" + bandera de Argentina, texto dorado "COPA DEL MUNDO", etiqueta crema "AYER GANÓ ESPAÑA", título blanco "HOY GANAMOS TODOS" con su línea) está en su posición FINAL y CORRECTA: queda EXACTAMENTE donde está, sin moverla ni un píxel, sin cambiar tamaños, colores ni letras. ' +
  'El ÚNICO problema son errores de montaje en la FOTOGRAFÍA de fondo: hay dos líneas de corte horizontales con contenido duplicado o discontinuo (alrededor de las piernas, los shorts y la vereda) y un salto de iluminación. Reparalos reconstruyendo la fotografía de forma natural y continua, con el degradé oscuro inferior suave y parejo. ' +
  'Las personas, caras y camisetas quedan intactas. No agregues ni quites ningún elemento gráfico ni texto.';

(async () => {
  const orig = await sharp(fs.readFileSync('portada-ayer-gano-in.png')).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();
  const limpia = await sharp(fs.readFileSync('portada-limpia.png')).resize(W, H, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();

  // 1) Montaje por código: banda gráfica de la original, 110px más arriba, sobre la limpia.
  const banda = await sharp(orig).extract({ left: 0, top: BANDA_TOP, width: W, height: BANDA_BOT - BANDA_TOP }).toBuffer();
  const montada = await sharp(limpia).composite([{ input: banda, left: 0, top: BANDA_TOP - SHIFT }]).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync('portada-montada.png', await sharp(montada).png().toBuffer());
  console.log('montada: bandas', (await medirBandas(montada)).map(([a, b]) => a + '..' + b).join(' · '));

  // 2) Gemini cura las costuras (2 intentos; la gráfica no debe moverse → se verifica midiendo).
  for (let i = 1; i <= 2; i++) {
    const out = await llamarGemini([
      { inlineData: { mimeType: 'image/jpeg', data: montada.toString('base64') } },
      { text: PROMPT_CURAR },
    ]);
    const png = await sharp(out).resize(W, H, { fit: 'cover' }).png().toBuffer();
    fs.writeFileSync('portada-fix-' + i + '.png', png);
    console.log('portada-fix-' + i + '.png bandas:', (await medirBandas(png)).map(([a, b]) => a + '..' + b).join(' · '));
  }
  console.log('objetivo: banderas ~1044..1142 · título ~1455..1547 · nada pasando y=1632');
})();
