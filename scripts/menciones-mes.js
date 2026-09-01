// Informe de menciones al equipo del mes, por local — el que sirve para liquidar
// la comisión por reseña que nombra a cada camarero.
// Uso: node scripts/menciones-mes.js <YYYY-MM> [local1 local2 ...]
//
// Salida en informes/<YYYY-MM>/menciones/:
//   - "Menciones equipo - <Local> - <rango>.pdf"  (ranking + una página por persona con sus frases)
//   - menciones-<local>.json                       (el informe crudo, por si hay que revisar un conteo)
//   - resumen-menciones-<YYYY-MM>.html             (todos los locales en una tabla: nombre, reseñas, estrellas)
//
// Además pisa `menciones.actual` en informes/<YYYY-MM>/datos-<local>.json, así el
// informe mensual del local muestra EXACTAMENTE el mismo número que este informe
// (la IA descubre nombres en cada corrida y dos corridas pueden diferir en los
// nombres de 1-2 menciones; con esto hay una sola corrida y un solo número).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { menciones, NOMINA } = require('../lib/menciones');
const pdf = require('../lib/menciones-pdf');
const { CSS } = require('./informe-css');

const periodo = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(periodo || '')) {
  console.error('Uso: node scripts/menciones-mes.js <YYYY-MM> [locales...]');
  process.exit(1);
}
const LOCALES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['playa-san-juan', 'luceros', 'benidorm', 'russafa'];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const [Y, M] = periodo.split('-').map(Number);
const MES = MESES[M - 1];
const desde = `${periodo}-01`;
const hasta = new Date(Date.UTC(Y, M, 0)).toISOString().slice(0, 10); // último día real
const DIR = path.join(__dirname, '..', 'informes', periodo);
const OUT = path.join(DIR, 'menciones');
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const coma = (n) => (n === null || n === undefined) ? '—' : String(n).replace('.', ',');

(async () => {
  const informes = [];
  for (const L of LOCALES) {
    const inf = await menciones({ local_id: L, desde, hasta, frases: 10 });
    informes.push(inf);

    // PDF del equipo (mismo generador que el botón del panel)
    const buf = await pdf.generar(inf, { personal: false });
    const nombrePdf = pdf.nombreArchivo(inf, false);
    fs.writeFileSync(path.join(OUT, nombrePdf), buf);
    fs.writeFileSync(path.join(OUT, `menciones-${L}.json`), JSON.stringify(inf, null, 2));

    // Un solo número: el informe mensual del local usa ESTA corrida.
    const datosPath = path.join(DIR, `datos-${L}.json`);
    if (fs.existsSync(datosPath)) {
      const d = JSON.parse((function (s) { s = String(s); if (s.trimStart().startsWith('{')) return s.trimStart(); const i = s.indexOf('\n{'); return i >= 0 ? s.slice(i + 1) : s; })(fs.readFileSync(datosPath, 'utf8')));
      d.menciones = d.menciones || {};
      d.menciones.actual = {
        totales: inf.totales,
        empleados: inf.empleados.map((e) => ({
          nombre: e.nombre, menciones: e.menciones, promedio: e.promedio,
          frase: (e.frases && e.frases[0]) ? e.frases[0].texto.slice(0, 220) : '',
        })),
      };
      fs.writeFileSync(datosPath, JSON.stringify(d, null, 2));
    }
    console.log(`${inf.local}: ${inf.totales.resenas} reseñas · ${inf.totales.conNombre} nombran a alguien · ` +
      inf.empleados.map((e) => `${e.nombre} ${e.menciones}`).join(' · '));
  }

  // ---- Resumen de todos los locales (para liquidar) ----
  const bloques = informes.map((inf) => {
    const filas = inf.empleados.map((e) => `<tr>
      <td>${esc(e.nombre)}</td><td class="n"><b>${fmt(e.menciones)}</b></td>
      ${[5, 4, 3, 2, 1].map((s) => `<td class="n">${e.estrellas[s] ? fmt(e.estrellas[s]) : '·'}</td>`).join('')}
      <td class="n">${coma(e.promedio)} ★</td></tr>`).join('');
    const totalMenciones = inf.empleados.reduce((a, e) => a + e.menciones, 0);
    const nomina = NOMINA[inf.local_id];
    return `<section>
      <h2>${esc(inf.local)}</h2>
      <div class="grid">
        <div class="stat"><div class="v">${fmt(inf.totales.resenas)}</div><div class="l">Reseñas en ${MES}</div></div>
        <div class="stat"><div class="v">${fmt(inf.totales.conTexto)}</div><div class="l">Con texto escrito</div></div>
        <div class="stat"><div class="v">${fmt(inf.totales.conNombre)}</div><div class="l">Nombran a alguien del equipo</div></div>
        <div class="stat"><div class="v">${fmt(totalMenciones)}</div><div class="l">Menciones a pagar (suma del ranking)</div></div>
      </div>
      ${inf.empleados.length ? `<table class="tabla">
        <thead><tr><th>Persona</th><th class="n">Reseñas que la nombran</th><th class="n">5★</th><th class="n">4★</th><th class="n">3★</th><th class="n">2★</th><th class="n">1★</th><th class="n">Media</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>` : '<p class="vacio">Nadie del equipo aparece nombrado en las reseñas del mes.</p>'}
      ${nomina ? `<p class="nota-chica">Nómina cargada para este local (formas en que la gente lo escribe, según el dueño): ${Object.entries(nomina).map(([n, v]) => `<b>${esc(n)}</b>${v.length ? ' (' + v.join(', ') + ')' : ''}`).join(' · ')}.</p>` : ''}
    </section>`;
  }).join('\n');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pizzería Popular · Menciones al equipo · ${MES} ${Y}</title>${CSS}
<style>
  .tabla { width: 100%; border-collapse: collapse; margin: 10px 0 6px; font-size: 14px; }
  .tabla th, .tabla td { padding: 7px 9px; border-bottom: 1px solid var(--linea); text-align: left; }
  .tabla th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--suave); }
  .tabla td.n, .tabla th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .tabla tbody tr:nth-child(odd) { background: var(--fondo2, #faf7f2); }
  @media print { section { break-inside: avoid; } }
</style></head><body>
<header><div class="kicker">🍕 Pizzería Popular · Reseñas de Google</div><h1>Menciones al equipo · ${MES} ${Y}</h1><div class="sub">Cuántas reseñas de Google del ${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')} nombran a cada persona, por local</div></header>
<div class="destacado">📌 <b>Cómo se cuenta:</b> una reseña suma <b>una vez</b> por persona nombrada, aunque el nombre aparezca varias veces en el texto. Se unifican las formas en que la gente escribe cada nombre (apodo, con o sin K, tipeos, letras repetidas). El conteo es exacto sobre el texto de cada reseña, no una estimación. El PDF de cada local trae, persona por persona, las frases textuales de los clientes.</div>
${bloques}
<div class="nota"><b>Fuente.</b> Reseñas de Google sincronizadas por el sistema cada 15 minutos. Grupo Ajax · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</div>
</body></html>`;
  const salida = path.join(OUT, `resumen-menciones-${periodo}.html`);
  fs.writeFileSync(salida, html);
  console.log('OK ' + salida);
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
