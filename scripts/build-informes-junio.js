// Genera los informes mensuales de junio 2026: uno por local + uno de gerencia.
// Lee informes/2026-06/gbp-manual.json (capturas GBP/ValoraIA) y datos-sistema.json (Supabase).
// Salida: informes/2026-06/informe-<slug>.html (imprimibles a PDF con Ctrl+P).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'informes', '2026-06');
const gbp = JSON.parse(fs.readFileSync(path.join(DIR, 'gbp-manual.json'), 'utf8'));
const sys = JSON.parse(fs.readFileSync(path.join(DIR, 'datos-sistema.json'), 'utf8'));

// slug GBP -> nombre en menu_digital / web.locales
const MAPA = {
  'santa-clara': 'Santa Clara',
  'russafa': 'Russafa',
  'benidorm': 'Benidorm',
  'playa-san-juan': 'Playa San Juan',
  'luceros': 'Luceros',
};

const RATING_INICIO = (sys.google.snapshot_inicio && sys.google.snapshot_inicio.por_local) || null;
const SNAP18 = { // primer snapshot disponible: 2026-06-18 (consultado aparte)
  'luceros': { rating: 4.8, reviews: 1029 }, 'russafa': { rating: 4.6, reviews: 1274 },
  'benidorm': { rating: 4.8, reviews: 83 }, 'boadilla': { rating: 4.7, reviews: 951 },
  'santa-clara': { rating: 4.7, reviews: 411 }, 'playa-san-juan': { rating: 4.7, reviews: 1884 },
};
const SNAP_FIN = sys.google.snapshot_fin.por_local;

const fmt = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('es-ES');
const pct = (s) => s ? `<span class="${String(s).startsWith('-') ? 'down' : 'up'}">${s} vs jun 2025</span>` : '';

function titulos(obj) {
  return Object.entries(obj || {}).map(([k, v]) =>
    `<li>${k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())} <b>${typeof v === 'number' ? v + ' menciones' : v}</b></li>`).join('');
}

const CSS = `
<style>
  :root { --tinta:#1a1a1a; --gris:#666; --linea:#e3e3e3; --marca:#c62828; --verde:#2e7d32; --fondo:#faf8f5; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: var(--tinta); background: var(--fondo); max-width: 860px; margin: 0 auto; padding: 40px 28px; line-height: 1.55; }
  header { border-bottom: 3px solid var(--marca); padding-bottom: 14px; margin-bottom: 26px; }
  .kicker { font-family: Arial, sans-serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--marca); }
  h1 { font-size: 30px; margin-top: 4px; }
  .sub { color: var(--gris); font-size: 14px; margin-top: 2px; }
  h2 { font-size: 19px; margin: 30px 0 10px; border-bottom: 1px solid var(--linea); padding-bottom: 5px; }
  h3 { font-family: Arial, sans-serif; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--gris); margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13.5px; margin: 8px 0 4px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--gris); border-bottom: 2px solid var(--tinta); padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid var(--linea); vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .up { color: var(--verde); font-size: 12px; white-space: nowrap; }
  .down { color: var(--marca); font-size: 12px; white-space: nowrap; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
  .kpi { flex: 1 1 120px; background: #fff; border: 1px solid var(--linea); border-radius: 8px; padding: 10px 12px; }
  .kpi .v { font-size: 24px; font-weight: bold; font-family: Arial, sans-serif; }
  .kpi .l { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--gris); }
  ul { padding-left: 20px; margin: 6px 0; }
  li { margin: 3px 0; }
  .acciones { background: #fff; border-left: 4px solid var(--marca); border-radius: 0 8px 8px 0; padding: 14px 18px; margin-top: 10px; }
  .acciones ol { padding-left: 20px; } .acciones li { margin: 6px 0; }
  .nota { font-size: 12px; color: var(--gris); border-top: 1px solid var(--linea); margin-top: 34px; padding-top: 10px; }
  .destacado { background: #fff8e1; border: 1px solid #f0e0a0; border-radius: 8px; padding: 12px 16px; margin: 12px 0; font-size: 14.5px; }
  @media print { body { background: #fff; padding: 0; } .kpi, .acciones, .destacado { break-inside: avoid; } }
</style>`;

function pagina(titulo, sub, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>${CSS}</head><body>
<header><div class="kicker">Pizzería Popular · Informe mensual · Junio 2026</div><h1>${titulo}</h1><div class="sub">${sub}</div></header>
${cuerpo}
<div class="nota"><b>Nota metodológica.</b> Datos de Google Business Profile cargados manualmente desde el panel de cada ficha (la API oficial sigue en revisión de Google; desde el próximo mes se automatiza). Los últimos 5-7 días de junio aparecen subcontados en algunas métricas de Google por su retraso de consolidación — verificado contra nuestra analítica propia: la actividad real no cayó. "Voz del cliente" proviene del análisis de reseñas (ventana 30 días; temas 90 días) y es aproximado hasta tener la API. Analítica de carta digital y web: sistema propio sin cookies, junio completo. Elaborado por Grupo Ajax · 2 de julio de 2026.</div>
</body></html>`;
}

function bloqueGoogle(g) {
  const filas = [
    ['Solicitudes "Cómo llegar"', g.como_llegar, g.como_llegar_vs_2025],
    ['Clics al sitio web', g.clics_sitio_web, g.clics_sitio_web_vs_2025],
    ['Llamadas desde la ficha', g.llamadas, g.llamadas_vs_2025],
    ['Reservas desde la ficha', g.reservas, g.reservas_vs_2025],
    ['Vieron el menú de la ficha', g.vieron_menu, g.vieron_menu_vs_2025],
    ['Clics al chat', g.clics_chat, g.clics_chat_vs_2025],
  ].filter(([, v]) => v !== undefined);
  return `<table><tr><th>Acción del cliente en Google</th><th class="num">Junio</th><th></th></tr>
  ${filas.map(([l, v, d]) => `<tr><td>${l}</td><td class="num"><b>${fmt(v)}</b></td><td>${pct(d)}</td></tr>`).join('')}
  ${g.interacciones_totales ? `<tr><td><b>Interacciones totales</b></td><td class="num"><b>${fmt(g.interacciones_totales)}</b></td><td>${pct(g.vs_jun_2025)}</td></tr>` : ''}</table>`;
}

function bloqueVoz(v, slug) {
  if (!v) return '<p>Sin dashboard de reseñas para este local este mes.</p>';
  const k = v.kpis_mes || {};
  const ini = SNAP18[slug], fin = SNAP_FIN[slug];
  const nuevas = ini && fin ? fin.reviews - ini.reviews : null;
  return `
  <div class="kpis">
    <div class="kpi"><div class="v">${k.valoracion_media || '—'} ★</div><div class="l">Valoración media</div></div>
    <div class="kpi"><div class="v">${fmt(fin && fin.reviews)}</div><div class="l">Reseñas totales en Google</div></div>
    ${nuevas !== null ? `<div class="kpi"><div class="v">+${nuevas}</div><div class="l">Nuevas (18 jun→1 jul)</div></div>` : ''}
    <div class="kpi"><div class="v">${k.tasa_respuesta || '—'}</div><div class="l">Tasa de respuesta</div></div>
  </div>
  <h3>Qué dice la gente para bien</h3><ul>${titulos(v.temas_positivos)}</ul>
  <h3>Qué dice para mal / a vigilar</h3>${Object.keys(v.areas_mejora || {}).length ? `<ul>${titulos(v.areas_mejora)}</ul>` : '<p>✅ Sin quejas recurrentes detectadas en el período — caso único en la cadena.</p>'}
  ${v.empleados_destacados ? `<p><b>Equipo mencionado con nombre en reseñas:</b> ${v.empleados_destacados.join(', ')}.</p>` : ''}
  <p><b>Rating durante junio:</b> ${v.rating_junio}</p>
  <p><b>Cuándo entran las reseñas:</b> ${v.dias_con_mas_resenas}.</p>
  <p><b>Gestión de respuestas:</b> ${v.gestion_respuestas}.</p>`;
}

function bloqueMenu(nombre) {
  const m = sys.menu_digital[nombre];
  if (!m || m.error) return '<p>Sin datos de carta digital.</p>';
  const o = m.origen && m.origen.counts ? m.origen.counts : {};
  return `
  <div class="kpis">
    <div class="kpi"><div class="v">${fmt(m.visitas_junio)}</div><div class="l">Aperturas de la carta</div></div>
    <div class="kpi"><div class="v">${fmt(m.visitantes_unicos_junio)}</div><div class="l">Personas distintas</div></div>
    <div class="kpi"><div class="v">${m.devices ? m.devices.mobile_percent + '%' : '—'}</div><div class="l">Desde el móvil</div></div>
  </div>
  <h3>Qué es lo que más se busca en la carta</h3>
  ${(() => { const q = m.top_searches.filter(s => s.query.length >= 4); return q.length ? `<ul>${q.slice(0, 5).map(s => `<li>“${s.query}” <b>${s.count} búsquedas</b></li>`).join('')}</ul>` : '<p>Sin búsquedas relevantes registradas.</p>'; })()}
  <h3>Platos más mirados</h3><ul>${m.top_items.slice(0, 5).map(i => `<li>${i.name} <b>${i.count} vistas</b></li>`).join('')}</ul>
  <h3>De dónde llega la gente a la carta <span style="text-transform:none;letter-spacing:0">(medido desde el 21 jun)</span></h3>
  <p>QR / directo: <b>${fmt(o.directo)}</b> · Web: <b>${fmt(o.web)}</b> · Google: <b>${fmt(o.google)}</b> · Redes: <b>${fmt(o.redes)}</b> · Otros: <b>${fmt(o.otros)}</b></p>`;
}

function bloqueWebLocal(nombre) {
  const l = (sys.web.locales || []).find(x => x.local === nombre);
  if (!l) return '';
  return `<p>Desde la web de la marca (grupoajax.es), en junio este local recibió <b>${l.reserva} clics de reserva</b>, <b>${l.whatsapp} de WhatsApp</b> y <b>${l.comollegar} de "cómo llegar"</b>.</p>`;
}

function informeLocal(slug, destacado, lectura, acciones, extra = '') {
  const g = gbp.locales[slug];
  const nombre = MAPA[slug];
  const cuerpo = `
  ${destacado ? `<div class="destacado">${destacado}</div>` : ''}
  <h2>1 · Tu ficha de Google en junio</h2>
  ${bloqueGoogle(g)}
  <h2>2 · Qué dice la gente (reseñas)</h2>
  ${bloqueVoz(g.voz_cliente, slug)}
  <h2>3 · Tu carta digital (QR)</h2>
  ${bloqueMenu(nombre)}
  <h2>4 · La web de la marca</h2>
  ${bloqueWebLocal(nombre)}
  ${extra}
  <h2>5 · Lectura del mes</h2>
  <p>${lectura}</p>
  <h2>6 · Acciones para julio</h2>
  <div class="acciones"><ol>${acciones.map(a => `<li>${a}</li>`).join('')}</ol></div>`;
  const titulo = g.nombre.split('(')[0].trim();
  const subDir = g.nombre.includes('(') ? g.nombre.match(/\((.+)\)/)[1] : 'Informe del local';
  fs.writeFileSync(path.join(DIR, `informe-${slug}.html`), pagina(titulo, subDir, cuerpo));
  console.log('OK informe-' + slug + '.html');
}

// ---------- PAUTA (para Russafa, Santa Clara y gerencia) ----------
function pautaResumen() {
  const objs = (sys.meta_ads.objetos || []);
  const camp = (nombre) => objs.find(o => o.level === 'campaign' && o.campaign_name === nombre);
  const md = camp('PP_MenuDiario_Valencia_TestCreativa');
  const tras = camp('Traspaso Santa Clara | WhatsApp | jun-2026');
  return { md: md && md.acumulado_fin, tras: tras && tras.acumulado_fin,
    adsets: objs.filter(o => o.level === 'adset' && o.campaign_name === 'PP_MenuDiario_Valencia_TestCreativa') };
}
const PAUTA = pautaResumen();
function bloquePautaLocal(adsetName) {
  const a = PAUTA.adsets.find(x => x.adset_name === adsetName);
  if (!a) return '';
  const m = a.acumulado_fin;
  return `<h2>4b · Publicidad en Meta (campaña "Menú Diario", lanzada ~20 jun)</h2>
  <p>Conjunto <b>${adsetName}</b>: <b>€${fmt(m.spend)}</b> invertidos · <b>${fmt(m.impressions)}</b> impresiones · <b>${fmt(m.link_clicks)}</b> clics al anuncio · <b>${fmt(m.landing_views)}</b> llegaron a la página del menú diario. La intención real (clic en "Cómo llegar" en la landing) se mide con nuestro tracker y se evalúa con el corte de la campaña (~7 jul).</p>`;
}

// ================= INFORMES POR LOCAL =================

informeLocal('santa-clara',
  'Tu rating <b>subió de 4,7 a 4,8 ★</b> durante junio, con <b>+40 reseñas nuevas</b> en dos semanas — el mejor salto de reputación de la cadena este mes.',
  'Mes muy sólido en reputación: la gente nombra a Samuel, Juan y Florencia una y otra vez — el servicio es tu diferencial. Los 400 "cómo llegar" muestran que la ficha trae gente al local; la carta digital todavía se usa poco (874 aperturas, la más baja de la cadena) — el QR en mesa y en el escaparate puede trabajar más. Las dos únicas quejas del período apuntan a lo mismo: prometer una oferta y que en la mesa aparezca otra cosa.',
  [
    'Responder las reseñas del 28-29 de junio que quedaron pendientes (son ~4).',
    'Repasar con el equipo que la oferta que se comunica sea exactamente la que se cobra (única queja repetida del mes).',
    'Reconocer a Samuel (22 menciones), Juan (18) y Florencia (8) — salen con nombre en las reseñas.',
    'Dar más visibilidad al QR de la carta en mesa: es la carta menos consultada de la cadena.',
  ],
  bloquePautaLocal('Santa Clara')
);

informeLocal('russafa',
  'Google te trajo <b>más negocio con menos ruido</b>: las interacciones bajaron (−5,6% vs 2025) pero las llamadas subieron +20,2%, las reservas +11,7% y las vistas de menú +107%.',
  'Russafa convierte mejor que el año pasado: menos curiosos, más clientes. La tasa de respuesta de reseñas del 100% es impecable — mantenerla. El punto a vigilar es la consistencia: dos reseñas hablan de "pizza de calidad inferior" y dos de mala atención puntual; con 4,6 ★ (el rating más justo de la cadena) cada reseña pesa. En la carta digital, la Buenos Aires (Fugazzeta) es tu plato estrella (2.654 aperturas de carta en el mes, segunda de la cadena).',
  [
    'Trabajar la consistencia de la pizza entre turnos (queja repetida: "calidad inferior según algunos") — es lo que separa el 4,6 del 4,8.',
    'Verificar el chat de la ficha de Google: 0 clics en todo junio (¿está desactivado?).',
    'Mantener la tasa de respuesta 100% — hoy es el estándar de la cadena.',
    'El domingo concentra las reseñas (~8): si se piden reseñas en sala, ese es el día.',
  ],
  bloquePautaLocal('Russafa')
);

informeLocal('benidorm',
  'Tu ficha creció fuerte (<b>+34 reseñas en dos semanas</b>, 22 solo la última semana) pero el rating <b>bajó de 4,8 a 4,7 ★</b>: junio tuvo 4 caídas puntuales por reseñas malas. Es el local a estabilizar.',
  'Benidorm tiene volumen y diferencial (las vistas aparecen en 17 reseñas — nadie más tiene eso), pero también la cola negativa más grande: ~7 reseñas de 1-2★ en 30 días. Las quejas son operativas y arreglables: ingredientes agotados al cierre, calidad dispar en platos concretos (masa, milanesa) y reservas mal comunicadas. Justo lo de reservas ya tiene causa conocida: la ficha estuvo sin sistema de reservas sincronizado todo junio (0 reservas con 503 "cómo llegar") — se conectó el 2 de julio y el informe de julio debería mostrar la diferencia.',
  [
    'Medir en julio las reservas de la ficha recién conectadas (junio: 0 por desincronización, ya resuelto el 02/07).',
    'Plan de cierre de cocina: las quejas de "ingredientes agotados" se concentran al final del servicio.',
    'Estandarizar masa y milanesa entre turnos — "calidad inconsistente en platos específicos" aparece 2 veces.',
    'Evaluar opciones sin gluten: lo piden en reseñas acá y es la búsqueda #1 en las cartas digitales de Alicante (decisión de marca, propuesta elevada a gerencia).',
    'Responder las reseñas del 28-30 de junio pendientes y sostener la tasa de respuesta arriba del 95%.',
  ]
);

informeLocal('playa-san-juan',
  '<b>El local #1 de la cadena en Google:</b> 1.013 "cómo llegar" (+15,4%), 120 reservas desde la ficha (+14,3%) y 96,4% de sentimiento positivo con <b>cero quejas recurrentes</b> — único local sin áreas de mejora detectadas.',
  'Playa San Juan es el modelo a seguir: volumen máximo (3.949 aperturas de carta, 61 reseñas nuevas en una semana) con gestión impecable (100% de respuesta). El equipo sale con nombre propio — Cata, Sergio, Agus, Leila e Inez — y Agus con mención especial por sus recomendaciones. Dato de carta: "sin gluten" es la búsqueda #1 de tu carta digital; la demanda celíaca en la zona es real y hoy no tiene respuesta. La campaña de Google Ads (PMax, desde el 28 jun) empezará a verse en el informe de julio.',
  [
    'Felicitar al equipo con nombres: Cata, Sergio, Agus, Leila, Inez — salen en las reseñas y sostienen el 4,8.',
    'Evaluar opciones sin gluten: búsqueda #1 en tu carta digital (elevado a gerencia como decisión de marca).',
    'El domingo concentra ~60 reseñas del mes: reforzar el pedido de reseña justo ese día.',
    'Seguir en julio el efecto de la campaña de Google Ads lanzada el 28 de junio.',
  ]
);

informeLocal('luceros',
  '<b>El mejor rating de la cadena (4,9 ★)</b> y el mayor crecimiento de visibilidad: "Cómo llegar" <b>+182,5% vs junio 2025</b> — las Hogueras en la propia plaza + la pauta "Hogueras Luceros" convirtieron la ficha en un imán.',
  'Luceros demuestra que un evento en la puerta, bien capitalizado, multiplica la ficha: el pico de "cómo llegar" (~39/día) cayó exactamente en la semana de Hogueras. Todo lo transaccional creció (llamadas +17,7%, reservas +23,3%, menú de ficha +303%). En reseñas, la comida manda (39 menciones) y el equipo — Cintia, Clara, Valentina, Joaco — sostiene un 4,9 casi perfecto. Dos detalles: una reseña mala el 30 de junio tumbó el promedio diario al cierre (revisarla y responderla), y de las dos tarjetas NFC de reseñas del equipo, una acumuló 12 reseñas y la otra cero — la #2 no se está usando. En carta digital, "pizza sin gluten" aparece en tus búsquedas top: mismo patrón que Playa San Juan.',
  [
    'Revisar y responder la reseña negativa del 30 de junio (tumbó el promedio del día a ~3,7).',
    'Poner en uso la tarjeta NFC #2 del equipo (la #1 trajo 12 reseñas en el mes; la #2, cero).',
    'Replicar el playbook Hogueras en el próximo evento de la plaza: pauta local + ficha al día = +182% de "cómo llegar".',
    'El lunes casi no entran reseñas y el sábado es pico (~24): concentrar el pedido de reseñas el finde.',
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
      llegar: g.como_llegar, reservas: g.reservas, llamadas: g.llamadas,
      carta: m.visitas_junio, unicos: m.visitantes_unicos_junio };
  });
  const web = sys.web; const chat = sys.chat_pepe;
  const tabla = `<table>
  <tr><th>Local</th><th class="num">Rating</th><th class="num">Reseñas</th><th class="num">Nuevas*</th><th class="num">Respuesta</th><th class="num">Cómo llegar</th><th class="num">Reservas ficha</th><th class="num">Llamadas</th><th class="num">Carta digital</th></tr>
  ${filas.map(f => `<tr><td><b>${f.nombre}</b></td><td class="num">${f.rating} ★</td><td class="num">${fmt(f.total)}</td><td class="num">+${fmt(f.nuevas)}</td><td class="num">${f.tasa}</td><td class="num">${fmt(f.llegar)}</td><td class="num">${fmt(f.reservas)}</td><td class="num">${fmt(f.llamadas)}</td><td class="num">${fmt(f.carta)}</td></tr>`).join('')}
  </table><p style="font-size:12px;color:#666">* Reseñas nuevas medidas del 18 jun al 1 jul (inicio de nuestro registro diario). Rating = valoración media de las reseñas del mes; el rating global de la ficha puede diferir (Russafa 4,6 global). "Cómo llegar", reservas y llamadas: mes completo según ficha de Google. Carta digital: aperturas de junio completo, sistema propio. Boadilla (954 reseñas, 4,7★) sigue fuera del perímetro operativo del informe.</p>`;

  const md = PAUTA.md, tras = PAUTA.tras;
  const cuerpo = `
  <div class="destacado"><b>El titular del mes:</b> la marca ganó ~186 reseñas nuevas en dos semanas manteniendo ratings 4,6-4,9, y la ficha de Google consolidada generó <b>~2.985 solicitudes de "cómo llegar"</b> y <b>247 reservas directas</b> en junio. La ficha ES el canal: los clics ficha→web caen en toda la cadena vs 2025 (hasta −30%), pero llamadas y reservas suben — Google retiene al usuario y convierte dentro de la ficha.</div>

  <h2>1 · Comparativa de locales</h2>
  ${tabla}
  <p><b>Lecturas rápidas:</b> Playa San Juan es el local modelo (volumen + cero quejas). Luceros tiene el mejor rating (4,9) y el mayor crecimiento (+182% "cómo llegar", efecto Hogueras). Santa Clara subió de 4,7 a 4,8. <b>Benidorm es el local a estabilizar</b>: bajó de 4,8 a 4,7 con la cola de reseñas negativas más grande — quejas operativas (cierre de cocina, consistencia) con plan en su informe.</p>

  <h2>2 · Decisiones de marca sobre la mesa</h2>
  <ul>
    <li><b>Sin gluten:</b> la demanda aparece por dos canales independientes — búsqueda #1 en las cartas digitales de Playa San Juan y Luceros, y quejas explícitas en reseñas de Benidorm. Hoy la carta no tiene respuesta. Decisión de carta a nivel marca.</li>
    <li><b>La ficha como landing:</b> con los clics ficha→web cayendo en toda la cadena (−3,7% a −30,5% interanual), la ficha tiene que estar impecable (fotos, menú, reservas conectadas, respuesta a reseñas). La higiene pendiente de la auditoría SEO (descripciones, https, dirección de Benidorm, rango de precio) pasa de "deseable" a prioritaria.</li>
    <li><b>Playbook de eventos:</b> Hogueras + pauta local = +182% de visibilidad en Luceros. Replicable: calendario de eventos por plaza y pauta de €10/día la semana del evento.</li>
    <li><b>Reseñas por empleado (tarjetas NFC):</b> donde se usa, funciona — la tarjeta líder de Luceros atribuyó 12 reseñas en el mes; la segunda tarjeta, cero. Vale la pena formalizarlo en los 5 locales con el equipo nombrado en reseñas como embajador (Samuel/Juan/Florencia en Santa Clara; Cata/Sergio/Agus/Leila/Inez en PSJ; Cintia/Clara/Valentina/Joaco en Luceros).</li>
    <li><b>Benidorm reservas:</b> la ficha estuvo todo junio sin sistema de reservas sincronizado (0 reservas con 503 "cómo llegar"). Corregido el 02/07 — verificar impacto en julio.</li>
  </ul>

  <h2>3 · Web de la marca (grupoajax.es)</h2>
  <div class="kpis">
    <div class="kpi"><div class="v">${fmt(web.visitas)}</div><div class="l">Visitas junio</div></div>
    <div class="kpi"><div class="v">${fmt(web.visitantes)}</div><div class="l">Visitantes únicos</div></div>
    <div class="kpi"><div class="v">${web.conversion}%</div><div class="l">Conversión a acción</div></div>
  </div>
  <p><b>Fuentes:</b> ${(web.fuentes || []).slice(0, 5).map(f => `${f.nombre} (${fmt(f.count)})`).join(' · ')}. Instagram es la primera fuente externa (998), seguida de Google (725) y Facebook (521).</p>
  <p><b>Acciones hacia locales desde la web:</b> ${(web.locales || []).map(l => `${l.local} ${l.total}`).join(' · ')} (reserva + WhatsApp + cómo llegar).</p>

  <h2>4 · Publicidad</h2>
  <ul>
    <li><b>Meta · Menú Diario Valencia</b> (desde ~20 jun): €${fmt(md && md.spend)} invertidos · ${fmt(md && md.impressions)} impresiones · ${fmt(md && md.link_clicks)} clics · ${fmt(md && md.landing_views)} vistas de landing. Conjuntos Russafa y Santa Clara casi empatados en entrega; la lectura del ganador (por clics de "cómo llegar" en la landing, tracker propio) corresponde al corte del ~7 de julio.</li>
    <li><b>Meta · Traspaso Santa Clara</b> (Click-to-WhatsApp): €${fmt(tras && tras.spend)} · ${fmt(tras && tras.impressions)} impresiones · ${fmt(tras && tras.link_clicks)} clics. Parada dura programada el día 14 de campaña.</li>
    <li><b>Google Ads · Playa San Juan</b> (PMax, lanzada 28 jun, €4,50/día): sin datos significativos aún — lectura incremental en días 5-10 y evaluación en el informe de julio. Pendientes: campaña en inglés y exclusión de marca como negativa.</li>
  </ul>

  <h2>5 · Qué pregunta la gente (asistente web "Pepe")</h2>
  <p>${fmt(chat.mensajes)} mensajes de ${fmt(chat.sesiones)} personas en junio. Consultas repetidas: ${(chat.recurrentes || []).slice(0, 5).map(r => `“${r.pregunta}” (×${r.veces})`).join(' · ') || 'sin repeticiones significativas'}. Aparece gente preguntando por <b>trabajar en la empresa</b> — puede valer una página/formulario de empleo para captar CVs sin fricción.</p>

  <h2>6 · Acciones de gerencia para julio</h2>
  <div class="acciones"><ol>
    <li>Decidir la línea sin gluten (demanda validada en 3 locales por 2 canales).</li>
    <li>Ejecutar la higiene de fichas pendiente de la auditoría (descripciones, https, dirección Benidorm, precio) — la ficha ya es la landing principal.</li>
    <li>Formalizar el programa de reseñas por empleado (NFC) en los 5 locales.</li>
    <li>Seguimiento Benidorm: reservas reconectadas + plan de consistencia (es el único local con rating en baja).</li>
    <li>Leer el corte de la campaña Menú Diario (~7 jul) y decidir escala o apagado por conjunto.</li>
    <li>Armar calendario de eventos por plaza para replicar el playbook Hogueras.</li>
  </ol></div>`;

  fs.writeFileSync(path.join(DIR, 'informe-gerencia.html'), pagina('Informe de Gerencia', 'Vista de marca · 5 locales · Grupo Ajax', cuerpo));
  console.log('OK informe-gerencia.html');
})();

console.log('Listo.');
