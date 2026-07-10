// Verifica el render del TÍTULO EXACTO sobre la portada (overlayTituloPortada).
// Corre en el VPS (fontconfig resuelve las fuentes de marca). Genera un fondo
// que estresa la legibilidad (claro abajo, donde va el título) y prueba varios
// largos + signos ¡¿. Cargar dotenv sí o sí para el FONTCONFIG_FILE.
require('dotenv').config();
const fs = require('fs');
const sharp = require('sharp');
const { overlayTituloPortada } = require('../lib/generador');

(async () => {
  const base = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 40, g: 30, b: 25 } },
  }).composite([{
    input: Buffer.from(
      '<svg width="1080" height="1920"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2a1e17"/><stop offset="1" stop-color="#e8c9a0"/></linearGradient></defs>' +
      '<rect width="1080" height="1920" fill="url(#g)"/></svg>'),
    top: 0, left: 0,
  }]).jpeg().toBuffer();

  const casos = [
    ['corto', 'FLAN MIXTO'],
    ['medio', 'Postre de la casa'],
    ['pregunta', '¿Quién gana hoy?'],
    ['largo', 'Una noche de pizza, cerveza y fútbol'],
    ['vacio', ''],
  ];
  for (const [nombre, titulo] of casos) {
    const buf = await overlayTituloPortada(base, titulo);
    const out = '/tmp/portada-' + nombre + '.jpg';
    fs.writeFileSync(out, buf);
    console.log('OK', nombre.padEnd(9), '→', out, '·', buf.length, 'bytes');
  }
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
