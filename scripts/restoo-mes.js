// Resumen mensual de reservas RESTOO por local, en JSON por stdout.
// Uso: node scripts/restoo-mes.js <YYYY-MM> [local ...]
// Sirve para correrlo en el VPS (donde están las credenciales que funcionan) y
// traer el resultado al informe mensual: node scripts/restoo-mes.js 2026-08 > reservas.json
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const restoo = require('../lib/restoo');

const periodo = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(periodo || '')) { console.error('Uso: node scripts/restoo-mes.js <YYYY-MM> [locales...]'); process.exit(1); }
const locales = process.argv.slice(3).length ? process.argv.slice(3) : ['playa-san-juan', 'luceros', 'benidorm', 'russafa'];

function rango(p) {
  const [y, m] = p.split('-').map(Number);
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${p}-01`, hasta: `${p}-${String(fin).padStart(2, '0')}` };
}
const mesAnterior = (p) => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const anoAnterior = (p) => `${Number(p.slice(0, 4)) - 1}${p.slice(4)}`;

(async () => {
  const out = {};
  for (const L of locales) {
    out[L] = {};
    for (const [k, p] of [['actual', periodo], ['previo', mesAnterior(periodo)], ['ano_anterior', anoAnterior(periodo)]]) {
      try { out[L][k] = await restoo.resumenMensual({ local_id: L, ...rango(p) }); }
      catch (e) { out[L][k] = { error: e.message }; }
    }
  }
  process.stdout.write(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
