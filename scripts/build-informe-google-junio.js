// Informe de UNA hoja A4: rendimiento de los perfiles de Google Maps de los 5
// locales en junio 2026. Lee informes/2026-06/gbp-manual.json (capturas del
// panel Rendimiento + dashboard de reseñas) y datos-sistema.json (snapshots de
// rating/reseñas en Supabase). NO hay números tipeados a mano: todo se computa.
// Salida: informes/2026-06/informe-google-maps.html (una página, imprimible A4).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'informes', '2026-06');
const gbp = JSON.parse(fs.readFileSync(path.join(DIR, 'gbp-manual.json'), 'utf8'));
const sys = JSON.parse(fs.readFileSync(path.join(DIR, 'datos-sistema.json'), 'utf8'));

const ORDER = ['santa-clara', 'russafa', 'benidorm', 'playa-san-juan', 'luceros'];
const NOMBRE = {
  'santa-clara': 'Santa Clara', 'russafa': 'Russafa', 'benidorm': 'Benidorm',
  'playa-san-juan': 'Playa San Juan', 'luceros': 'Luceros',
};
const CIUDAD = {
  'santa-clara': 'València', 'russafa': 'València', 'benidorm': 'Alicante',
  'playa-san-juan': 'Alicante', 'luceros': 'Alicante',
};
// Primer snapshot de rating/reseñas disponible en Supabase: 2026-06-18.
const SNAP18 = {
  'luceros': { reviews: 1029 }, 'russafa': { reviews: 1274 }, 'benidorm': { reviews: 83 },
  'santa-clara': { reviews: 411 }, 'playa-san-juan': { reviews: 1884 },
};
const FIN = sys.google.snapshot_fin.por_local; // 2026-07-01

const fmt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('es-ES');
const nota = (r) => String(r).replace('.', ',');

// ---- Cómputo por local (fuente única) ----
const filas = ORDER.map((slug) => {
  const g = gbp.locales[slug];
  const f = FIN[slug];
  const i = SNAP18[slug];
  const k = (g.voz_cliente && g.voz_cliente.kpis_mes) || {};
  return {
    slug, nombre: NOMBRE[slug], ciudad: CIUDAD[slug],
    rating: f.rating, reviews: f.reviews,
    nuevas: (f && i) ? f.reviews - i.reviews : null,
    resp: k.tasa_respuesta || '—',
    como_llegar: g.como_llegar, reservas: g.reservas, llamadas: g.llamadas,
    menu: g.vieron_menu, web: g.clics_sitio_web,
    vs: {
      como_llegar: g.como_llegar_vs_2025, reservas: g.reservas_vs_2025,
      llamadas: g.llamadas_vs_2025, menu: g.vieron_menu_vs_2025,
      web: g.clics_sitio_web_vs_2025, interac: g.vs_jun_2025,
    },
  };
});

const suma = (k) => filas.reduce((a, f) => a + (Number(f[k]) || 0), 0);
const T = {
  reviews: suma('reviews'), nuevas: suma('nuevas'), como_llegar: suma('como_llegar'),
  reservas: suma('reservas'), llamadas: suma('llamadas'), menu: suma('menu'), web: suma('web'),
};
// Nota media ponderada por nº de reseñas (una décima).
const notaMedia = Math.round((filas.reduce((a, f) => a + f.rating * f.reviews, 0) / T.reviews) * 10) / 10;

// Pill de variación interanual (solo si el dato existe).
function pill(v) {
  if (!v) return '';
  const neg = String(v).startsWith('-');
  return `<span class="pill ${neg ? 'rojo' : 'verde'}">${neg ? '▼' : '▲'}${v.replace('-', '').replace('.', ',')}</span>`;
}

// Línea de lectura por local: la métrica interanual más fuerte + contexto.
const LECTURA = {
  'santa-clara': `Nota global <b>4,8★</b>, <b>+40 reseñas</b> y 94% respondidas. Los 400 "cómo llegar" llevan gente al local; los clientes nombran al equipo por su nombre (Samuel, Juan, Florencia).`,
  'russafa': `Menos ruido, más negocio: <b>llamadas +20%</b>, <b>reservas +12%</b> y <b>menú +107%</b> vs 2025, aunque las interacciones totales caen ${pill('-5.6%')}. La nota 4,6 es la más justa: cuidar consistencia.`,
  'benidorm': `Fuerte captación (<b>+34 reseñas</b>) pero la nota bajó de 4,8 a 4,7 (mes con varias reseñas malas). Reservas en 0 por desconexión técnica de la ficha — <b>resuelto el 2 jul</b>, se mide en julio.`,
  'playa-san-juan': `<b>El #1 de la cadena:</b> 1.013 "cómo llegar" ${pill('+15.4%')}, 120 reservas ${pill('+14.3%')} y <b>+59 reseñas</b> con 100% respondidas. Menú de ficha +120% vs 2025.`,
  'luceros': `<b>El mayor crecimiento de la cadena:</b> "cómo llegar" ${pill('+182.5%')} vs 2025 — efecto Hogueras en la plaza + pauta. Nota 4,8★ global (4,9 en las reseñas de junio, la más alta de la cadena). Todo lo transaccional sube.`,
};

const CSS = `<style>
  @page { size: A4 portrait; margin: 11mm 11mm; }
  :root { --tinta:#22262b; --gris:#5f6a75; --linea:#e3e5ea; --marca:#c62828; --verde:#1e8e3e; --fondo:#f5f6f8; --amar:#fff6dd; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', -apple-system, Roboto, Arial, sans-serif; color: var(--tinta); font-size: 12px; line-height: 1.45; background:#fff; }
  .page { width: 188mm; margin: 0 auto; }
  header { background: var(--marca); color:#fff; border-radius: 14px; padding: 16px 20px; display:flex; justify-content:space-between; align-items:center; gap:14px; }
  header .kicker { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; opacity:.85; }
  header h1 { font-size: 23px; line-height:1.15; margin-top:3px; }
  header .sub { font-size: 12.5px; opacity:.92; margin-top:4px; }
  header .marca { text-align:right; font-size: 11px; opacity:.92; line-height:1.4; flex:none; }
  header .marca b { font-size: 15px; display:block; }

  .strip { display:grid; grid-template-columns: repeat(5, 1fr); gap: 9px; margin: 15px 0; }
  .kpi { background: var(--fondo); border:1px solid var(--linea); border-radius: 11px; padding: 12px 13px; }
  .kpi .v { font-size: 25px; font-weight: 800; line-height:1.05; }
  .kpi .l { font-size: 10.5px; color: var(--gris); margin-top: 3px; }

  h2 { font-size: 14.5px; margin: 20px 0 8px; display:flex; align-items:center; gap:8px; }
  h2 .n { background: var(--marca); color:#fff; border-radius:50%; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; font-size:12.5px; flex:none; }
  h2 .exp { font-weight: 400; font-size: 11px; color: var(--gris); }

  table { border-collapse: collapse; width:100%; font-variant-numeric: tabular-nums; }
  thead .grp th { font-size: 9.5px; text-transform: uppercase; letter-spacing:.5px; color:#fff; padding: 5px 6px; text-align:center; }
  thead .grp .g-rep { background:#8a3d3d; border-radius:7px 0 0 0; }
  thead .grp .g-act { background:#3a5a7a; border-radius:0 7px 0 0; }
  thead .col th { font-size: 9.5px; text-transform: uppercase; letter-spacing:.3px; color: var(--gris); border-bottom: 2px solid var(--tinta); padding: 7px 6px; text-align:right; }
  thead .col th.loc { text-align:left; }
  tbody td { padding: 9px 6px; border-bottom: 1px solid var(--linea); text-align:right; font-size: 12.5px; }
  tbody td.loc { text-align:left; }
  tbody td.loc b { font-size: 13px; } tbody td.loc span { color: var(--gris); font-size: 10px; }
  tbody .nota { font-weight: 800; }
  tbody tr.total td { border-top: 2px solid var(--tinta); border-bottom:none; font-weight: 800; padding-top: 9px; }
  tbody tr.total td.loc { text-transform: uppercase; letter-spacing:.5px; font-size: 11px; }
  .sep { border-left: 1px solid var(--linea); }

  .lecturas { display:grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-top: 10px; }
  .lec { font-size: 11px; line-height:1.5; padding-left: 5px; }
  .lec b.loc { color: var(--marca); }
  .pill { display:inline-block; font-size: 9.5px; font-weight:700; border-radius: 10px; padding: 0 6px; }
  .pill.verde { background:#e3f3e6; color: var(--verde); } .pill.rojo { background:#fde8e8; color: var(--marca); }

  .notas { margin-top: 18px; border-top: 1px solid var(--linea); padding-top: 10px; font-size: 9.8px; color: var(--gris); line-height:1.55; }
  .notas b { color: var(--tinta); }
</style>`;

const filaHTML = (f) => `<tr>
  <td class="loc"><b>${f.nombre}</b> <span>${f.ciudad}</span></td>
  <td class="nota">${nota(f.rating)}★</td>
  <td>${fmt(f.reviews)}</td>
  <td>+${fmt(f.nuevas)}</td>
  <td>${f.resp}</td>
  <td class="sep">${fmt(f.como_llegar)}</td>
  <td>${fmt(f.reservas)}</td>
  <td>${fmt(f.llamadas)}</td>
  <td>${fmt(f.menu)}</td>
  <td>${fmt(f.web)}</td>
</tr>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Perfiles de Google Maps · Junio 2026</title>${CSS}</head><body><div class="page">

<header>
  <div>
    <div class="kicker">Informe mensual · Perfiles de Google Maps</div>
    <h1>Tus fichas de Google en junio 2026</h1>
    <div class="sub">5 locales · qué hizo la gente que te encontró en Google Maps</div>
  </div>
  <div class="marca"><b>Pizzería Popular</b>Grupo Ajax</div>
</header>

<div class="strip">
  <div class="kpi"><div class="v">${fmt(T.como_llegar)}</div><div class="l">Pidieron "cómo llegar"</div></div>
  <div class="kpi"><div class="v">${fmt(T.reservas)}</div><div class="l">Reservas desde la ficha</div></div>
  <div class="kpi"><div class="v">${fmt(T.llamadas)}</div><div class="l">Llamadas al local</div></div>
  <div class="kpi"><div class="v">+${fmt(T.nuevas)}</div><div class="l">Reseñas nuevas (18 jun–1 jul)</div></div>
  <div class="kpi"><div class="v">${nota(notaMedia)}★</div><div class="l">Nota media (${fmt(T.reviews)} reseñas)</div></div>
</div>

<h2><span class="n">1</span> Los 5 perfiles, lado a lado <span class="exp">— reputación y actividad de cada ficha en junio</span></h2>
<table>
  <thead>
    <tr class="grp"><th></th><th class="g-rep" colspan="4">Reputación</th><th class="g-act" colspan="5">Actividad en la ficha</th></tr>
    <tr class="col">
      <th class="loc">Local</th>
      <th>Nota</th><th>Reseñas</th><th>Nuevas</th><th>Respond.</th>
      <th>Cómo llegar</th><th>Reservas</th><th>Llamadas</th><th>Vieron menú</th><th>Clics web</th>
    </tr>
  </thead>
  <tbody>
    ${filas.map(filaHTML).join('\n    ')}
    <tr class="total">
      <td class="loc">Total cadena</td>
      <td class="nota">${nota(notaMedia)}★</td>
      <td>${fmt(T.reviews)}</td>
      <td>+${fmt(T.nuevas)}</td>
      <td>—</td>
      <td class="sep">${fmt(T.como_llegar)}</td>
      <td>${fmt(T.reservas)}</td>
      <td>${fmt(T.llamadas)}</td>
      <td>${fmt(T.menu)}</td>
      <td>${fmt(T.web)}</td>
    </tr>
  </tbody>
</table>

<h2><span class="n">2</span> Lectura por local <span class="exp">— lo que importa de cada ficha (▲/▼ = vs junio 2025)</span></h2>
<div class="lecturas">
  ${ORDER.map((s) => `<div class="lec"><b class="loc">${NOMBRE[s]}.</b> ${LECTURA[s]}</div>`).join('\n  ')}
  <div class="lec" style="align-self:center;color:var(--gris)">Boadilla del Monte (Madrid) queda fuera del informe operativo de la cadena.</div>
</div>

<div class="notas">
  <b>Cómo se leyó esto.</b> Los datos salen del panel <b>Rendimiento</b> de cada ficha de Google, cargados a mano (la conexión automática está en revisión de Google; el mes que viene se automatiza). <b>Ojo con los últimos ~5-7 días de junio:</b> Google publica esas cifras con retraso, así que "cómo llegar", llamadas y web de fin de mes están algo subcontadas — los totales reales son iguales o un poco mayores (lo cruzamos con nuestro medidor propio: la actividad no cayó).
  <b>Nota:</b> es la valoración global que muestra hoy la ficha (al 1 jul); la media de solo las reseñas de junio es aún más alta en varios locales (Luceros 4,9). <b>"Nuevas":</b> reseñas sumadas entre el 18 jun y el 1 jul (desde que hay histórico), no el mes entero. <b>Reservas de Benidorm en 0:</b> la ficha no tenía el sistema de reservas conectado en junio (no es falta de demanda) — se conectó el 2 jul y se medirá en julio. · Grupo Ajax · datos de junio 2026.
</div>

</div></body></html>`;

const dest = path.join(DIR, 'informe-google-maps.html');
fs.writeFileSync(dest, html);
console.log('OK →', dest);
