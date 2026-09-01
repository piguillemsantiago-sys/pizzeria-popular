// Junta los informes de todos los locales en un solo HTML (y de ahí, un solo PDF).
// Uso: node scripts/build-informe-unico.js <YYYY-MM> [local1 local2 ...]
// Cada local arranca en página nueva al imprimir.
const fs = require('fs');
const path = require('path');

const periodo = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(periodo || '')) {
  console.error('Uso: node scripts/build-informe-unico.js <YYYY-MM> [locales...]');
  process.exit(1);
}
const LOCALES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['playa-san-juan', 'luceros', 'benidorm', 'russafa', 'santa-clara'];

const DIR = path.join(__dirname, '..', 'informes', periodo);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mes = MESES[Number(periodo.split('-')[1]) - 1];
const anio = periodo.split('-')[0];

let css = '';
const bloques = [];

for (const L of LOCALES) {
  const f = path.join(DIR, `informe-${L}.html`);
  if (!fs.existsSync(f)) { console.error('falta ' + f); process.exit(1); }
  const html = fs.readFileSync(f, 'utf8');
  if (!css) css = html.slice(html.indexOf('<style>'), html.lastIndexOf('</style>') + 8);
  const cuerpo = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  bloques.push(`<div class="informe">${cuerpo}</div>`);
  console.log('  + ' + L);
}

const salida = path.join(DIR, `informe-todos-los-locales-${periodo}.html`);
fs.writeFileSync(salida, `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pizzería Popular · Informes de ${mes} ${anio}</title>
${css}
<style>
  /* Cada local empieza en página nueva; en pantalla van separados por una línea. */
  .informe + .informe { border-top: 3px solid var(--linea); margin-top: 34px; padding-top: 10px; }
  @media print { .informe { break-before: page; } .informe:first-child { break-before: auto; } }
</style></head><body>
${bloques.join('\n')}
</body></html>`);
console.log('OK ' + salida);
