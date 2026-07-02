// Genera los informes mensuales de junio 2026: uno por local + uno de gerencia.
// Lee informes/2026-06/gbp-manual.json (capturas GBP/ValoraIA) y datos-sistema.json (Supabase).
// Salida: informes/2026-06/informe-<slug>.html — responsive (móvil y PC) e imprimibles a PDF.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'informes', '2026-06');
const gbp = JSON.parse(fs.readFileSync(path.join(DIR, 'gbp-manual.json'), 'utf8'));
const sys = JSON.parse(fs.readFileSync(path.join(DIR, 'datos-sistema.json'), 'utf8'));

const MAPA = {
  'santa-clara': 'Santa Clara',
  'russafa': 'Russafa',
  'benidorm': 'Benidorm',
  'playa-san-juan': 'Playa San Juan',
  'luceros': 'Luceros',
};

const SNAP18 = { // primer snapshot disponible: 2026-06-18
  'luceros': { rating: 4.8, reviews: 1029 }, 'russafa': { rating: 4.6, reviews: 1274 },
  'benidorm': { rating: 4.8, reviews: 83 }, 'boadilla': { rating: 4.7, reviews: 951 },
  'santa-clara': { rating: 4.7, reviews: 411 }, 'playa-san-juan': { rating: 4.7, reviews: 1884 },
};
const SNAP_FIN = sys.google.snapshot_fin.por_local;

const fmt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('es-ES');

function pill(delta) {
  if (!delta) return '';
  const neg = String(delta).startsWith('-');
  return `<span class="pill ${neg ? 'rojo' : 'verde'}">${neg ? '▼' : '▲'} ${delta.replace('-', '')} vs año pasado</span>`;
}

const CSS = `
<style>
  :root { --tinta:#22262b; --gris:#5f6a75; --linea:#e6e8ec; --marca:#c62828; --verde:#1e8e3e; --fondo:#f4f5f7; --amarillo:#fff6dd; }
  * { box-sizing: border-box; margin: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: var(--tinta); background: var(--fondo); max-width: 780px; margin: 0 auto; padding: 20px 14px 40px; line-height: 1.6; font-size: 16px; }
  header { background: var(--marca); color: #fff; border-radius: 16px; padding: 22px 20px; margin-bottom: 18px; }
  .kicker { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: .85; }
  h1 { font-size: clamp(24px, 5.5vw, 32px); margin-top: 4px; line-height: 1.2; }
  .sub { opacity: .9; font-size: 14px; margin-top: 4px; }

  section { background: #fff; border: 1px solid var(--linea); border-radius: 16px; padding: 18px 18px 20px; margin: 14px 0; }
  h2 { font-size: 19px; display: flex; align-items: center; gap: 10px; }
  h2 .n { background: var(--marca); color: #fff; border-radius: 50%; min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-size: 15px; flex: none; }
  .explica { color: var(--gris); font-size: 14px; margin: 6px 0 14px; }
  h3 { font-size: 14px; text-transform: uppercase; letter-spacing: .6px; color: var(--gris); margin: 18px 0 8px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 10px; }
  .stat { background: var(--fondo); border-radius: 12px; padding: 12px 14px; }
  .stat .v { font-size: 26px; font-weight: 800; line-height: 1.15; }
  .stat .l { font-size: 13px; color: var(--gris); margin-top: 2px; }
  .stat .pill { margin-top: 6px; }
  .pill { display: inline-block; font-size: 12px; font-weight: 700; border-radius: 20px; padding: 2px 9px; white-space: nowrap; }
  .pill.verde { background: #e3f3e6; color: var(--verde); }
  .pill.rojo { background: #fde8e8; color: var(--marca); }

  .barra { display: flex; align-items: center; gap: 10px; margin: 7px 0; font-size: 14.5px; }
  .barra .txt { flex: 1 1 40%; min-width: 0; }
  .barra .track { flex: 1 1 60%; background: var(--fondo); border-radius: 20px; height: 18px; overflow: hidden; }
  .barra .fill { height: 100%; background: var(--verde); border-radius: 20px; min-width: 8%; display: flex; align-items: center; justify-content: flex-end; color: #fff; font-size: 11.5px; font-weight: 700; padding-right: 7px; }
  .barra.mala .fill { background: #e57373; }

  .destacado { background: var(--amarillo); border: 1px solid #f0dfa8; border-radius: 14px; padding: 14px 16px; margin: 0 0 14px; font-size: 15.5px; }
  .aviso { background: #fdf1f1; border-left: 4px solid var(--marca); border-radius: 0 10px 10px 0; padding: 10px 14px; margin: 10px 0; font-size: 14.5px; }
  .ok { background: #eef8ef; border-left: 4px solid var(--verde); border-radius: 0 10px 10px 0; padding: 10px 14px; margin: 10px 0; font-size: 14.5px; }

  .acciones { counter-reset: acc; }
  .accion { display: flex; gap: 12px; background: var(--fondo); border-radius: 12px; padding: 12px 14px; margin: 8px 0; font-size: 15px; }
  .accion::before { counter-increment: acc; content: counter(acc); background: var(--marca); color: #fff; border-radius: 50%; min-width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex: none; margin-top: 1px; }

  .tabla-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 6px -4px; }
  table { border-collapse: collapse; font-size: 13.5px; min-width: 640px; width: 100%; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--gris); border-bottom: 2px solid var(--tinta); padding: 6px 8px; position: sticky; left: 0; }
  td { padding: 8px; border-bottom: 1px solid var(--linea); vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .hint-scroll { display: none; font-size: 12px; color: var(--gris); }
  @media (max-width: 700px) { .hint-scroll { display: block; margin-bottom: 4px; } }

  ul { padding-left: 20px; margin: 6px 0; } li { margin: 4px 0; }
  p { margin: 8px 0; }
  .nota { font-size: 12.5px; color: var(--gris); margin-top: 22px; padding: 0 6px; }
  @media print { body { background: #fff; padding: 0; font-size: 13px; } section, .stat, .accion, .destacado { break-inside: avoid; } header { border-radius: 0; } }
</style>`;

function pagina(titulo, sub, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo} · Junio 2026</title>${CSS}</head><body>
<header><div class="kicker">🍕 Pizzería Popular · Informe de junio 2026</div><h1>${titulo}</h1><div class="sub">${sub}</div></header>
${cuerpo}
<div class="nota"><b>Cómo se hizo este informe.</b> Los datos de Google se cargaron a mano desde el panel de cada ficha (la conexión automática está en revisión de Google; el mes que viene se automatiza). Los últimos 5-7 días de junio salen bajos en algunas métricas de Google porque Google tarda en publicarlos — lo verificamos con nuestro medidor propio: la actividad real no cayó. La parte de reseñas usa el análisis del dashboard (últimos 30 días; temas: 90 días). La carta digital y la web se miden con sistema propio, junio completo. Grupo Ajax · 2 de julio de 2026.</div>
</body></html>`;
}

// ---------- BLOQUES ----------
const LABELS_GBP = [
  ['como_llegar', '🚗 Pidieron cómo llegar', 'como_llegar_vs_2025'],
  ['llamadas', '📞 Llamaron por teléfono', 'llamadas_vs_2025'],
  ['reservas', '📅 Reservaron mesa', 'reservas_vs_2025'],
  ['clics_sitio_web', '🌐 Entraron a la web', 'clics_sitio_web_vs_2025'],
  ['vieron_menu', '🍕 Miraron el menú en Google', 'vieron_menu_vs_2025'],
  ['clics_chat', '💬 Escribieron por chat', 'clics_chat_vs_2025'],
];

function bloqueGoogle(g) {
  const cards = LABELS_GBP.filter(([k]) => g[k] !== undefined).map(([k, label, dk]) =>
    `<div class="stat"><div class="v">${fmt(g[k])}</div><div class="l">${label}</div>${pill(g[dk]) ? `<div>${pill(g[dk])}</div>` : ''}</div>`).join('');
  return `<div class="grid">${cards}</div>
  ${g.interacciones_totales ? `<p style="margin-top:10px">En total, <b>${fmt(g.interacciones_totales)} interacciones</b> con tu ficha en junio ${g.vs_jun_2025 ? pill(g.vs_jun_2025) : ''}.</p>` : ''}`;
}

function barras(obj, clase = '') {
  const entradas = Object.entries(obj || {});
  if (!entradas.length) return '';
  const max = Math.max(...entradas.map(([, v]) => typeof v === 'number' ? v : 1));
  return entradas.map(([k, v]) => {
    const label = k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
    if (typeof v !== 'number') return `<div class="barra ${clase}"><div class="txt">${label}</div><div style="font-size:13px;color:var(--gris)">${v}</div></div>`;
    return `<div class="barra ${clase}"><div class="txt">${label}</div><div class="track"><div class="fill" style="width:${Math.round(v / max * 100)}%">${v}</div></div></div>`;
  }).join('');
}

function bloqueVoz(v, slug) {
  if (!v) return '<p>Sin datos de reseñas este mes.</p>';
  const k = v.kpis_mes || {};
  const ini = SNAP18[slug], fin = SNAP_FIN[slug];
  const nuevas = ini && fin ? fin.reviews - ini.reviews : null;
  const malas = Object.keys(v.areas_mejora || {}).length;
  return `
  <div class="grid">
    <div class="stat"><div class="v">⭐ ${k.valoracion_media || '—'}</div><div class="l">Nota media del mes</div></div>
    <div class="stat"><div class="v">${fmt(fin && fin.reviews)}</div><div class="l">Reseñas totales en Google</div></div>
    ${nuevas !== null ? `<div class="stat"><div class="v">+${nuevas}</div><div class="l">Nuevas del 18 jun al 1 jul</div></div>` : ''}
    <div class="stat"><div class="v">${k.tasa_respuesta || '—'}</div><div class="l">Reseñas respondidas</div></div>
  </div>
  <h3>👍 Lo que más elogian los clientes</h3>
  ${barras(v.temas_positivos)}
  <h3>⚠️ Lo que hay que vigilar</h3>
  ${malas ? barras(v.areas_mejora, 'mala') : '<div class="ok">✅ Sin quejas repetidas en el período. Único local de la cadena que lo logra este mes.</div>'}
  ${v.empleados_destacados ? `<div class="ok">🏅 Los clientes nombran al equipo en sus reseñas: <b>${v.empleados_destacados.join(', ')}</b>.</div>` : ''}
  <h3>Datos útiles</h3>
  <ul>
    <li><b>La nota durante el mes:</b> ${v.rating_junio}.</li>
    <li><b>Cuándo entran las reseñas:</b> ${v.dias_con_mas_resenas}.</li>
    <li><b>Respuestas:</b> ${v.gestion_respuestas}.</li>
  </ul>`;
}

function bloqueMenu(nombre) {
  const m = sys.menu_digital[nombre];
  if (!m || m.error) return '<p>Sin datos de carta digital.</p>';
  const o = m.origen && m.origen.counts ? m.origen.counts : {};
  const busquedas = m.top_searches.filter(s => s.query.length >= 4).slice(0, 5);
  return `
  <div class="grid">
    <div class="stat"><div class="v">${fmt(m.visitas_junio)}</div><div class="l">Veces que se abrió la carta</div></div>
    <div class="stat"><div class="v">${fmt(m.visitantes_unicos_junio)}</div><div class="l">Personas distintas</div></div>
    <div class="stat"><div class="v">${m.devices ? m.devices.mobile_percent + '%' : '—'}</div><div class="l">Desde el móvil</div></div>
  </div>
  <h3>🔍 Qué es lo que más busca la gente en tu carta</h3>
  ${busquedas.length ? barras(Object.fromEntries(busquedas.map(s => [`“${s.query}”`, s.count]))) : '<p>Sin búsquedas relevantes registradas.</p>'}
  <h3>🍽️ Platos más mirados</h3>
  ${barras(Object.fromEntries(m.top_items.slice(0, 5).map(i => [i.name, i.count])))}
  <h3>📲 Por dónde llegan a la carta <span style="text-transform:none;letter-spacing:0">(se mide desde el 21 jun)</span></h3>
  <div class="grid">
    <div class="stat"><div class="v">${fmt(o.directo)}</div><div class="l">QR en mesa / directo</div></div>
    <div class="stat"><div class="v">${fmt(o.web)}</div><div class="l">Desde la web</div></div>
    <div class="stat"><div class="v">${fmt(o.google)}</div><div class="l">Desde Google</div></div>
    <div class="stat"><div class="v">${fmt(o.redes)}</div><div class="l">Desde redes</div></div>
  </div>`;
}

function bloqueWebLocal(nombre) {
  const l = (sys.web.locales || []).find(x => x.local === nombre);
  if (!l) return '';
  return `<div class="grid">
    <div class="stat"><div class="v">${fmt(l.reserva)}</div><div class="l">Clics de reserva</div></div>
    <div class="stat"><div class="v">${fmt(l.whatsapp)}</div><div class="l">Clics de WhatsApp</div></div>
    <div class="stat"><div class="v">${fmt(l.comollegar)}</div><div class="l">Clics de "cómo llegar"</div></div>
  </div>`;
}

// ---------- PAUTA ----------
function pautaResumen() {
  const objs = (sys.meta_ads.objetos || []);
  const camp = (nombre) => objs.find(o => o.level === 'campaign' && o.campaign_name === nombre);
  return {
    md: camp('PP_MenuDiario_Valencia_TestCreativa') && camp('PP_MenuDiario_Valencia_TestCreativa').acumulado_fin,
    tras: camp('Traspaso Santa Clara | WhatsApp | jun-2026') && camp('Traspaso Santa Clara | WhatsApp | jun-2026').acumulado_fin,
    adsets: objs.filter(o => o.level === 'adset' && o.campaign_name === 'PP_MenuDiario_Valencia_TestCreativa'),
  };
}
const PAUTA = pautaResumen();

function seccionPautaLocal(adsetName, num) {
  const a = PAUTA.adsets.find(x => x.adset_name === adsetName);
  if (!a) return '';
  const m = a.acumulado_fin;
  return `<section><h2><span class="n">${num}</span> 📢 Tu publicidad en Instagram/Facebook</h2>
  <p class="explica">Campaña "Menú Diario" activa desde el ~20 de junio. Esto es lo que hizo el anuncio de tu zona.</p>
  <div class="grid">
    <div class="stat"><div class="v">€${fmt(m.spend)}</div><div class="l">Invertido</div></div>
    <div class="stat"><div class="v">${fmt(m.impressions)}</div><div class="l">Veces que se mostró</div></div>
    <div class="stat"><div class="v">${fmt(m.link_clicks)}</div><div class="l">Clics al anuncio</div></div>
    <div class="stat"><div class="v">${fmt(m.landing_views)}</div><div class="l">Llegaron a la página</div></div>
  </div>
  <p>El resultado que importa (cuántos tocaron "Cómo llegar" en la página) se evalúa con el corte de la campaña, alrededor del 7 de julio.</p></section>`;
}

// ---------- INFORME DE LOCAL ----------
function informeLocal(slug, destacado, lectura, acciones, pautaAdset) {
  const g = gbp.locales[slug];
  const nombre = MAPA[slug];
  let n = 0; const N = () => ++n;
  const cuerpo = `
  ${destacado ? `<div class="destacado">📌 <b>Lo más importante del mes:</b> ${destacado}</div>` : ''}
  <section><h2><span class="n">${N()}</span> 📍 Tu ficha de Google</h2>
  <p class="explica">Esto hizo en junio la gente que encontró el restaurante en Google o Google Maps.</p>
  ${bloqueGoogle(g)}</section>
  <section><h2><span class="n">${N()}</span> ⭐ Qué dice la gente</h2>
  <p class="explica">Resumen de las reseñas de Google: lo bueno, lo malo y cómo las estamos gestionando.</p>
  ${bloqueVoz(g.voz_cliente, slug)}</section>
  <section><h2><span class="n">${N()}</span> 📱 Tu carta digital (el QR de las mesas)</h2>
  <p class="explica">Lo que hace la gente dentro de la carta que se abre con el QR. Las búsquedas dicen qué quieren y no encuentran.</p>
  ${bloqueMenu(nombre)}</section>
  <section><h2><span class="n">${N()}</span> 🌐 Lo que te trajo la web de la marca</h2>
  <p class="explica">Clics hacia tu local desde la página web (grupoajax.es) durante junio.</p>
  ${bloqueWebLocal(nombre)}</section>
  ${pautaAdset ? seccionPautaLocal(pautaAdset, N()) : ''}
  <section><h2><span class="n">${N()}</span> 🧭 Lectura del mes</h2>
  <p>${lectura}</p></section>
  <section><h2><span class="n">${N()}</span> ✅ Qué hacer en julio</h2>
  <p class="explica">Pocas cosas, concretas. Si se hacen estas, el informe de julio mejora solo.</p>
  <div class="acciones">${acciones.map(a => `<div class="accion"><div>${a}</div></div>`).join('')}</div></section>`;
  const titulo = g.nombre.split('(')[0].trim();
  const subDir = g.nombre.includes('(') ? g.nombre.match(/\((.+)\)/)[1] : 'Informe del local';
  fs.writeFileSync(path.join(DIR, `informe-${slug}.html`), pagina(titulo, subDir, cuerpo));
  console.log('OK informe-' + slug + '.html');
}

// ================= INFORMES POR LOCAL =================

informeLocal('santa-clara',
  'Tu nota <b>subió de 4,7 a 4,8 ★</b> durante junio, con <b>+40 reseñas nuevas</b> en dos semanas — el mejor salto de reputación de la cadena este mes.',
  'Mes muy sólido en reputación: la gente nombra a Samuel, Juan y Florencia una y otra vez — el servicio es tu diferencial. Los 400 "cómo llegar" muestran que la ficha trae gente al local. La carta digital todavía se usa poco (874 aperturas, la más baja de la cadena): el QR en mesa y en el escaparate puede trabajar más. Las dos únicas quejas del período apuntan a lo mismo: prometer una oferta y que en la mesa aparezca otra cosa.',
  [
    'Responder las reseñas del 28-29 de junio que quedaron pendientes (son ~4).',
    'Repasar con el equipo que la oferta que se comunica sea exactamente la que se cobra (única queja repetida del mes).',
    'Reconocer a <b>Samuel</b> (22 menciones), <b>Juan</b> (18) y <b>Florencia</b> (8) — salen con nombre en las reseñas.',
    'Dar más visibilidad al QR de la carta en mesa: es la carta menos consultada de la cadena.',
  ],
  'Santa Clara'
);

informeLocal('russafa',
  'Google te trajo <b>más negocio con menos ruido</b>: las visitas a la ficha bajaron un poco (−5,6%) pero las llamadas subieron +20,2%, las reservas +11,7% y las vistas de menú +107% respecto al año pasado.',
  'Russafa convierte mejor que el año pasado: menos curiosos, más clientes. Responder el 100% de las reseñas es impecable — mantenerlo. El punto a vigilar es la consistencia: dos reseñas hablan de "pizza de calidad inferior" y dos de mala atención puntual; con nota global 4,6 (la más justa de la cadena) cada reseña pesa. En la carta digital, la Buenos Aires (Fugazzeta) es tu plato estrella.',
  [
    'Trabajar la consistencia de la pizza entre turnos (queja repetida del mes) — es lo que separa el 4,6 del 4,8.',
    'Verificar el chat de la ficha de Google: 0 clics en todo junio (¿está desactivado?).',
    'Mantener el 100% de reseñas respondidas — hoy es el estándar de la cadena.',
    'El domingo es el día con más reseñas: si se piden reseñas en sala, ese es el día.',
  ],
  'Russafa'
);

informeLocal('benidorm',
  'Tu ficha creció fuerte (<b>+34 reseñas en dos semanas</b>, 22 solo la última semana) pero la nota <b>bajó de 4,8 a 4,7 ★</b>: junio tuvo 4 días con reseñas malas. Es el local a estabilizar.',
  'Benidorm tiene volumen y un diferencial único (las vistas aparecen en 17 reseñas — ningún otro local tiene eso), pero también la mayor cantidad de reseñas de 1-2★ de la cadena (~7 en 30 días). Las quejas son operativas y arreglables: ingredientes agotados al cierre, calidad dispar en platos concretos (masa, milanesa) y reservas mal comunicadas. Justo lo de reservas ya tiene causa conocida: la ficha estuvo sin sistema de reservas conectado todo junio (0 reservas con 503 "cómo llegar") — se conectó el 2 de julio y en el informe de julio se debería notar.',
  [
    'Medir en julio las reservas de la ficha recién conectadas (junio: 0 por desconexión, ya resuelto el 02/07).',
    'Plan de cierre de cocina: las quejas de "ingredientes agotados" se concentran al final del servicio.',
    'Estandarizar masa y milanesa entre turnos — "calidad inconsistente" aparece 2 veces.',
    'Evaluar opciones sin gluten: lo piden en reseñas acá y es la búsqueda #1 en las cartas digitales de Alicante (decisión de marca, ya elevada a gerencia).',
    'Responder las reseñas del 28-30 de junio pendientes y sostener la tasa de respuesta arriba del 95%.',
  ]
);

informeLocal('playa-san-juan',
  '<b>El local #1 de la cadena en Google:</b> 1.013 "cómo llegar" (+15,4%), 120 reservas desde la ficha (+14,3%) y 96,4% de opiniones positivas con <b>cero quejas repetidas</b> — único local que lo logra.',
  'Playa San Juan es el modelo a seguir: volumen máximo (3.949 aperturas de carta, 61 reseñas nuevas en una semana) con gestión impecable (100% de reseñas respondidas). El equipo sale con nombre propio — Cata, Sergio, Agus, Leila e Inez — y Agus con mención especial por sus recomendaciones. Dato de carta: "sin gluten" es lo que más busca la gente en tu carta digital; esa demanda hoy no tiene respuesta. La campaña de Google Ads (desde el 28 jun) empezará a verse en el informe de julio.',
  [
    'Felicitar al equipo con nombres: <b>Cata, Sergio, Agus, Leila, Inez</b> — salen en las reseñas y sostienen el 4,8.',
    'Evaluar opciones sin gluten: es la búsqueda #1 en tu carta digital (elevado a gerencia como decisión de marca).',
    'El domingo concentra ~60 reseñas del mes: reforzar el pedido de reseña justo ese día.',
    'Seguir en julio el efecto de la campaña de Google Ads lanzada el 28 de junio.',
  ]
);

informeLocal('luceros',
  '<b>La mejor nota de la cadena (4,9 ★)</b> y el mayor crecimiento de visibilidad: "cómo llegar" <b>+182,5% vs junio 2025</b> — las Hogueras en la propia plaza + la pauta "Hogueras Luceros" convirtieron la ficha en un imán.',
  'Luceros demuestra que un evento en la puerta, bien aprovechado, multiplica la ficha: el pico de "cómo llegar" (~39 por día) cayó exactamente en la semana de Hogueras. Todo lo importante creció: llamadas +17,7%, reservas +23,3%, menú de ficha +303%. En reseñas, la comida manda (39 menciones) y el equipo — Cintia, Clara, Valentina, Joaco — sostiene un 4,9 casi perfecto. Dos detalles: una reseña mala el 30 de junio bajó el promedio de ese día (revisarla y responderla), y de las dos tarjetas NFC para pedir reseñas, una consiguió 12 y la otra cero — la #2 no se está usando. Además, "pizza sin gluten" aparece en las búsquedas top de tu carta: mismo patrón que Playa San Juan.',
  [
    'Revisar y responder la reseña negativa del 30 de junio.',
    'Poner en uso la tarjeta NFC #2 del equipo (la #1 trajo 12 reseñas en el mes; la #2, cero).',
    'Repetir la fórmula de Hogueras en el próximo evento de la plaza: pauta local + ficha al día = +182% de "cómo llegar".',
    'El lunes casi no entran reseñas y el sábado es pico: concentrar el pedido de reseñas el finde.',
  ]
);

// ================= INFORME GERENCIA =================
(function gerencia() {
  const filas = Object.entries(MAPA).map(([slug, nombre]) => {
    const g = gbp.locales[slug]; const v = g.voz_cliente || {}; const k = v.kpis_mes || {};
    const m = sys.menu_digital[nombre] || {};
    const ini = SNAP18[slug], fin = SNAP_FIN[slug];
    return { slug, nombre, rating: (k.valoracion_media || (fin && fin.rating)), total: fin && fin.reviews,
      nuevas: ini && fin ? fin.reviews - ini.reviews : null, tasa: k.tasa_respuesta || '—',
      llegar: g.como_llegar, reservas: g.reservas, llamadas: g.llamadas, carta: m.visitas_junio };
  });
  const web = sys.web; const chat = sys.chat_pepe;
  const md = PAUTA.md, tras = PAUTA.tras;
  let n = 0; const N = () => ++n;

  const cuerpo = `
  <div class="destacado">📌 <b>El titular del mes:</b> la marca ganó ~186 reseñas nuevas en dos semanas manteniendo notas de 4,6 a 4,9, y las fichas de Google generaron <b>~2.985 "cómo llegar"</b> y <b>247 reservas directas</b> en junio. La ficha ES el canal: los clics ficha→web caen en toda la cadena vs 2025 (hasta −30%), pero llamadas y reservas suben — Google retiene al usuario y convierte dentro de la ficha.</div>

  <section><h2><span class="n">${N()}</span> 🏪 Los 5 locales, lado a lado</h2>
  <p class="explica">Junio de un vistazo. "Nuevas" = reseñas nuevas del 18 jun al 1 jul. La nota es la media de las reseñas del mes (la global de Google puede diferir: Russafa 4,6).</p>
  <p class="hint-scroll">👉 Deslizá la tabla hacia el costado para ver todo.</p>
  <div class="tabla-scroll"><table>
  <tr><th>Local</th><th class="num">Nota</th><th class="num">Reseñas</th><th class="num">Nuevas</th><th class="num">Respondidas</th><th class="num">Cómo llegar</th><th class="num">Reservas ficha</th><th class="num">Llamadas</th><th class="num">Carta digital</th></tr>
  ${filas.map(f => `<tr><td><b>${f.nombre}</b></td><td class="num">${f.rating} ★</td><td class="num">${fmt(f.total)}</td><td class="num">+${fmt(f.nuevas)}</td><td class="num">${f.tasa}</td><td class="num">${fmt(f.llegar)}</td><td class="num">${fmt(f.reservas)}</td><td class="num">${fmt(f.llamadas)}</td><td class="num">${fmt(f.carta)}</td></tr>`).join('')}
  </table></div>
  <div class="ok">🏆 <b>Playa San Juan</b> es el local modelo (máximo volumen + cero quejas repetidas). <b>Luceros</b> tiene la mejor nota (4,9) y el mayor crecimiento (+182% "cómo llegar", efecto Hogueras). <b>Santa Clara</b> subió de 4,7 a 4,8.</div>
  <div class="aviso">⚠️ <b>Benidorm es el local a estabilizar:</b> bajó de 4,8 a 4,7 con la mayor cantidad de reseñas de 1-2★ — quejas operativas (cierre de cocina, consistencia de platos) con plan concreto en su informe.</div>
  <p style="font-size:13px;color:var(--gris)">Boadilla (954 reseñas, 4,7★) sigue fuera del perímetro operativo del informe.</p></section>

  <section><h2><span class="n">${N()}</span> 🎯 Decisiones de marca sobre la mesa</h2>
  <p class="explica">Cosas que no puede resolver un local solo: son de gerencia.</p>
  <ul>
    <li><b>Sin gluten:</b> la demanda aparece por dos canales independientes — es lo que más busca la gente en las cartas digitales de Playa San Juan y Luceros, y hay quejas explícitas en reseñas de Benidorm. Hoy la carta no tiene respuesta. Decisión de carta a nivel marca.</li>
    <li><b>La ficha como escaparate principal:</b> los clics ficha→web caen en toda la cadena (−3,7% a −30,5% vs 2025). La gente ya no sale de Google: decide ahí. La higiene pendiente de las fichas (descripciones, fotos, https, dirección de Benidorm, rango de precio) pasa de "deseable" a prioritaria.</li>
    <li><b>Fórmula de eventos:</b> Hogueras + pauta local = +182% de visibilidad en Luceros. Replicable: calendario de eventos por plaza y pauta de €10/día la semana del evento.</li>
    <li><b>Reseñas por empleado (tarjetas NFC):</b> donde se usa, funciona — la tarjeta líder de Luceros consiguió 12 reseñas en el mes; la segunda, cero. Vale formalizarlo en los 5 locales, con el equipo que ya sale nombrado en reseñas como embajador (Samuel/Juan/Florencia en Santa Clara; Cata/Sergio/Agus/Leila/Inez en PSJ; Cintia/Clara/Valentina/Joaco en Luceros).</li>
    <li><b>Reservas de Benidorm:</b> la ficha estuvo todo junio sin sistema de reservas conectado (0 reservas con 503 "cómo llegar"). Corregido el 02/07 — verificar impacto en julio.</li>
  </ul></section>

  <section><h2><span class="n">${N()}</span> 🌐 La web de la marca</h2>
  <p class="explica">grupoajax.es en junio, medido con sistema propio.</p>
  <div class="grid">
    <div class="stat"><div class="v">${fmt(web.visitas)}</div><div class="l">Visitas</div></div>
    <div class="stat"><div class="v">${fmt(web.visitantes)}</div><div class="l">Personas distintas</div></div>
    <div class="stat"><div class="v">${web.conversion}%</div><div class="l">Hicieron algo (reserva, WhatsApp…)</div></div>
  </div>
  <h3>De dónde llega la gente</h3>
  ${barras(Object.fromEntries((web.fuentes || []).slice(0, 5).map(f => [f.nombre, f.count])))}
  <p>Instagram es la primera fuente externa, seguida de Google y Facebook.</p>
  <h3>Clics hacia cada local desde la web</h3>
  ${barras(Object.fromEntries((web.locales || []).map(l => [l.local, l.total])))}</section>

  <section><h2><span class="n">${N()}</span> 📢 Publicidad</h2>
  <ul>
    <li><b>Meta · Menú Diario Valencia</b> (desde ~20 jun): <b>€${fmt(md && md.spend)}</b> invertidos · ${fmt(md && md.impressions)} impresiones · ${fmt(md && md.link_clicks)} clics · ${fmt(md && md.landing_views)} vistas de la página. Russafa y Santa Clara casi empatados; el ganador se define por los clics de "cómo llegar" en la página (medidor propio) con el corte del ~7 de julio.</li>
    <li><b>Meta · Traspaso Santa Clara</b> (WhatsApp): €${fmt(tras && tras.spend)} · ${fmt(tras && tras.impressions)} impresiones · ${fmt(tras && tras.link_clicks)} clics. Parada programada al día 14 de campaña.</li>
    <li><b>Google Ads · Playa San Juan</b> (desde el 28 jun, €4,50/día): sin datos significativos aún — evaluación en el informe de julio. Pendientes: campaña en inglés y marca como palabra negativa.</li>
  </ul></section>

  <section><h2><span class="n">${N()}</span> 💬 Qué pregunta la gente en la web (asistente "Pepe")</h2>
  <div class="grid">
    <div class="stat"><div class="v">${fmt(chat.mensajes)}</div><div class="l">Mensajes en junio</div></div>
    <div class="stat"><div class="v">${fmt(chat.sesiones)}</div><div class="l">Personas</div></div>
  </div>
  <p>Consultas repetidas: ${(chat.recurrentes || []).slice(0, 5).map(r => `“${r.pregunta}” (×${r.veces})`).join(' · ') || 'sin repeticiones significativas'}. Aparece gente preguntando por <b>trabajar en la empresa</b> — puede valer una página o formulario de empleo para captar CVs sin fricción.</p></section>

  <section><h2><span class="n">${N()}</span> ✅ Acciones de gerencia para julio</h2>
  <div class="acciones">
    <div class="accion"><div>Decidir la línea <b>sin gluten</b> (demanda validada en 3 locales por 2 canales).</div></div>
    <div class="accion"><div>Ejecutar la <b>higiene de fichas</b> pendiente (descripciones, https, dirección Benidorm, precio) — la ficha ya es el escaparate principal.</div></div>
    <div class="accion"><div>Formalizar el <b>programa de reseñas por empleado (NFC)</b> en los 5 locales.</div></div>
    <div class="accion"><div>Seguimiento <b>Benidorm</b>: reservas reconectadas + plan de consistencia (único local con nota en baja).</div></div>
    <div class="accion"><div>Leer el corte de la campaña <b>Menú Diario</b> (~7 jul) y decidir escalar o apagar por conjunto.</div></div>
    <div class="accion"><div>Armar el <b>calendario de eventos por plaza</b> para repetir la fórmula Hogueras.</div></div>
  </div></section>`;

  fs.writeFileSync(path.join(DIR, 'informe-gerencia.html'), pagina('Informe de Gerencia', 'Vista de marca · 5 locales · Grupo Ajax', cuerpo));
  console.log('OK informe-gerencia.html');
})();

console.log('Listo.');
