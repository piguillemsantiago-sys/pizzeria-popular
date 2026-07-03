// Prueba end-to-end del modo "placa completa IA" con un caso de partido en vivo
// (el que produjo el pill inventado "ARGENTINE DA"). Corre EN EL VPS (ahí está
// GEMINI_API_KEY):  node scripts/test-placa-evento.js ["instrucción"]
// Imprime el copy, los avisos de verificación y guarda la pieza en /tmp/test-placa.jpg.
require('dotenv').config();
const fs = require('fs');
const { generarCopy, generarPlacaCompletaIA, terminarPlacaIA } = require('../lib/generador');

(async () => {
  const instruccion = process.argv[2] ||
    'Partido España vs Portugal este sábado a las 21h, lo pasamos en vivo en Plaza de los Luceros, Alicante';
  console.log('INSTRUCCIÓN:', instruccion);

  const copy = await generarCopy(instruccion, 'historia');
  const p = copy.placas[0];
  console.log('\nCOPY GENERADO:\n' + JSON.stringify(p, null, 2));

  p.modoIA = 'completa';
  const t0 = Date.now();
  const gen = await generarPlacaCompletaIA(p, 'historia');
  console.log('\nAVISOS DE VERIFICACIÓN:', gen.avisos.length ? '' : '(ninguno — pasó limpia)');
  gen.avisos.forEach((a) => console.log('  • ' + a));

  const final = await terminarPlacaIA(gen.buf, p, 'historia', 1, 1);
  fs.writeFileSync('/tmp/test-placa.jpg', final);
  console.log('\nOK → /tmp/test-placa.jpg (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
