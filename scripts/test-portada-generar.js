// Genera portadas REALES con el prompt nuevo (zonas estrictas) + título, para
// verificar a ojo que: top calmo, sujeto en el centro, 40% inferior oscuro con
// el título legible. Corre en el VPS (Gemini + fontconfig). Cuesta 1 call por tema.
require('dotenv').config();
const fs = require('fs');
const { generarPortadaReel } = require('../lib/generador');

const casos = [
  ['flan', 'un flan casero con dulce de leche y crema', 'ámbar cálido', 'FLAN MIXTO'],
  ['futbol', 'la pasión por el fútbol en el bar, una noche de partido', 'rojo profundo', '¿QUIÉN GANA HOY?'],
];

(async () => {
  for (const [nombre, tema, color, titulo] of casos) {
    const buf = await generarPortadaReel({ modo: 'generar', tema, color, titulo });
    const out = '/tmp/portgen-' + nombre + '.jpg';
    fs.writeFileSync(out, buf);
    console.log('OK', nombre.padEnd(7), '→', out, '·', buf.length, 'bytes');
  }
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
