// Verifica el flujo COMPLETO de portada editorial "Método Ana":
// tema → Claude redacta el copy → PRO pinta la portada → logo real pegado.
// Corre en el VPS. Uso: node scripts/test-portada-editorial.js "<tema>" <salida>
require('dotenv').config();
const fs = require('fs');
const { generarPortadaEditorial } = require('../lib/generador');

(async () => {
  const tema = process.argv[2] || 'noche de pizza y fútbol, hoy pasamos el partido';
  const out = process.argv[3] || 'portada-editorial';
  const { buf, copy } = await generarPortadaEditorial({ tema });
  fs.writeFileSync('/tmp/' + out + '.jpg', buf);
  console.log('COPY:', JSON.stringify(copy, null, 2));
  console.log('✅ →', '/tmp/' + out + '.jpg ·', buf.length, 'bytes');
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
