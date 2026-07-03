// Reproduce el bug del 3 jul: un ajuste que solo pedía agregar los nombres de
// los países borró título/acento/bajada/CTA e inventó el lugar. Verifica que
// ajustarCopy sea conservador: los campos no pedidos NO vuelven (u omitidos),
// nada se vacía y no aparece contenido inventado.
// Corre en el VPS:  node scripts/test-ajuste-conservador.js
require('dotenv').config();
const { ajustarCopy } = require('../lib/generador');

const PLACA = {
  titulo: 'La previa se juega acá',
  acento: 'te esperamos',
  bajada: 'Lunes 6 de julio, 21:00. Pizza al horno de leña y buena tribuna.',
  cta: 'Reservá tu mesa',
  lugar: '',
  estilo: 'sandwich',
  logo: 'iso-blanco',
  banderas: ['pt', 'es'],
  evento: 'LO PASAMOS EN VIVO',
  modoIA: 'completa',
};
const INSTRUCCION = 'Agrega los nombres "Portugal" y "España" al lado de su bandera.';

(async () => {
  const out = await ajustarCopy(INSTRUCCION, 'historia', [PLACA], 'La previa del Mundial se vive en Pizzería Popular 🍕');
  const nu = (out.placas && out.placas[0]) || {};
  console.log('CAMPOS DEVUELTOS POR EL AJUSTADOR:\n' + JSON.stringify(nu, null, 2));

  const fallas = [];
  for (const campo of ['titulo', 'acento', 'bajada', 'cta']) {
    if (nu[campo] === '') fallas.push(campo + ' vino "" (borraría el texto sin que nadie lo pida)');
    if (nu[campo] != null && nu[campo] !== PLACA[campo]) fallas.push(campo + ' vino REESCRITO: "' + nu[campo] + '"');
  }
  if (nu.lugar) fallas.push('lugar INVENTADO: "' + nu.lugar + '"');
  if (nu.banderas != null && !nu.banderas.length) fallas.push('banderas vaciadas');
  if (nu.evento === '') fallas.push('evento vaciado');
  if (!String(nu.notaDiseno || '').trim()) fallas.push('falta la notaDiseno con el pedido de los nombres');

  if (fallas.length) {
    console.log('\n❌ FALLAS:');
    fallas.forEach((f) => console.log('  · ' + f));
    process.exit(1);
  }
  console.log('\n✅ Conservador: solo vino el cambio pedido (notaDiseno), nada borrado ni inventado.');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
