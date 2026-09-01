// Arma el informe mensual de un local a partir del JSON de extract-informe-mensual.js.
// Uso: node scripts/build-informe-mensual.js <ruta-json> [ruta-salida.html]
//
// Reglas de comparativa que aplica el render:
//   - Estacional (ficha de Google) -> pill "vs <mes> <año anterior>". Si el local no
//     tiene base del año anterior, NO se muestra pill (nunca se inventa la comparación).
//   - Calidad (reseñas) -> pill "vs <mes anterior>".
//   - Carta digital y web: sin año anterior todavía -> valores absolutos y proporciones,
//     sin flecha de temporada.
const fs = require('fs');
const path = require('path');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const jsonPath = process.argv[2];
const nombreMes = (p) => MESES[Number(p.split('-')[1]) - 1];
const anio = (p) => p.split('-')[0];
const mesSiguiente = (p) => {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

const DIRECCIONES = {
  'playa-san-juan': 'Alicante · Av. de Niza (Playa de San Juan)',
  'luceros': 'Alicante · Plaza de los Luceros',
  'russafa': 'València · Barrio de Russafa',
  'santa-clara': 'València · C/ del Convent de Sta. Clara 11',
  'benidorm': 'Benidorm · Alicante',
};

// es-ES no agrupa los números de 4 dígitos ("1114"), y al lado de un "13.027"
// queda desprolijo. Acá se agrupa siempre a partir del millar.
const fmt = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Variación porcentual. Devuelve null si no hay base con la que comparar.
function variacion(actual, base) {
  if (base === null || base === undefined || Number(base) === 0) return null;
  if (actual === null || actual === undefined) return null;
  return Math.round((actual - base) / base * 1000) / 10;
}
function pill(pct, etiqueta, mejorEsSubir = true) {
  if (pct === null) return '';
  // Una flecha con 0,0% miente: da a entender que algo se movió cuando quedó igual.
  if (Math.abs(pct) < 0.05) return `<span class="pill neutro">= igual que ${etiqueta.replace(/^vs /, '')}</span>`;
  const sube = pct >= 0;
  const bueno = mejorEsSubir ? sube : !sube;
  const signo = sube ? '▲' : '▼';
  return `<span class="pill ${bueno ? 'verde' : 'rojo'}">${signo} ${Math.abs(pct).toFixed(1).replace('.', ',')}% ${etiqueta}</span>`;
}
function stat(valor, label, pillHtml) {
  return `<div class="stat"><div class="v">${valor}</div><div class="l">${label}</div>${pillHtml ? `<div>${pillHtml}</div>` : ''}</div>`;
}
// Una búsqueda de marca larga ("🍕pizzeria popular playa san juan, avenida de
// niza, alicante") ocupa cuatro líneas en móvil y desbalancea el gráfico.
function recorteEtiqueta(s) {
  const t = String(s);
  return t.length <= 44 ? t : t.slice(0, 43).replace(/[,\s]+$/, '') + '…';
}

function barras(pares, clase = '') {
  if (!pares.length) return '<p class="vacio">Sin datos en el período.</p>';
  const max = Math.max(...pares.map(([, v]) => v));
  // Con valores muy chicos la barra miente: "5" pintado al 100% del ancho parece
  // mucho. Debajo de 10 se listan como etiquetas, sin barra.
  if (max < 10) {
    return `<div class="chips">${pares.map(([k, v]) => `<span class="chip">${esc(k)} <b>${fmt(v)}</b></span>`).join('')}</div>`;
  }
  // El número va FUERA de la barra: adentro se recorta cuando la barra es angosta
  // (en móvil "143" se leía "3"). Afuera se lee igual con cualquier ancho.
  return pares.map(([k, v]) => `<div class="barra ${clase}"><div class="txt">${esc(recorteEtiqueta(k))}</div><div class="track"><div class="fill" style="width:${Math.max(Math.round(v / max * 100), 4)}%"></div></div><span class="val">${fmt(v)}</span></div>`).join('');
}
// Un 1★ dibujado con cinco glifos del mismo color se lee como 5★. Va el número
// delante y las estrellas vacías en gris.
function estrellas(n) {
  return `<span class="estrellas"><b>${n}★</b> <span class="llenas">${'★'.repeat(n)}</span><span class="vacias">${'★'.repeat(5 - n)}</span></span>`;
}

const { CSS } = require('./informe-css');
const extras = require('./informe-extras');

function construir(d, texto) {
  const P = d.periodo, MES = nombreMes(P), ANIO = anio(P);
  const MES_PREV = nombreMes(d.periodo_previo);
  const MES_YOY = `${nombreMes(d.periodo_ano_anterior)} ${anio(d.periodo_ano_anterior)}`;
  const MES_SIG = nombreMes(mesSiguiente(P));
  const gRaw = d.google.actual || {};
  const sinFicha = !!gRaw.error || !Number(gRaw.vistas_perfil);
  const g = sinFicha ? {} : gRaw, gy = d.google.ano_anterior || {}, hayYoY = !sinFicha && d.google.hay_base_ano_anterior;
  const r = d.resenas.actual, rp = d.resenas.previo;
  const carta = d.carta.actual, cartaPrev = d.carta.previo;
  const emp = (d.menciones.actual.empleados || []);
  let n = 0; const N = () => ++n;

  // etiqueta corta para los pills
  const vsYoY = `vs ${MES_YOY}`;
  const vsMes = `vs ${MES_PREV}`;
  const py = (k, mejorEsSubir = true) => hayYoY ? pill(variacion(g[k], gy[k]), vsYoY, mejorEsSubir) : '';

  // Todo lo que la gente HIZO con la ficha. Es el número que Google muestra
  // primero en su propio panel, así que el encargado lo puede verificar solo.
  const ACCIONES = ['llamadas', 'clicks_web', 'como_llegar', 'reservas', 'clicks_menu', 'chats', 'pedidos_comida'];
  const interacciones = (x) => ACCIONES.reduce((a, k) => a + (Number(x[k]) || 0), 0);
  const inter = interacciones(g);

  // El total del mes no se puede pensar ("17.039" no le dice nada a nadie).
  // El promedio diario sí. Se descartan los días del final que Google todavía
  // no publicó, que vienen en cero y hundirían la media.
  const serie = (g.serie_vistas || []).map((x) => Number(x.vistas) || 0);
  let fin = serie.length;
  while (fin > 0 && serie[fin - 1] === 0) fin--;
  const diasConDato = fin || serie.length || 1;
  const vistasDia = Math.round((g.vistas_perfil || 0) / diasConDato);
  const diasIncompletos = serie.length - fin;

  // ---- semáforo de cabecera ----
  const semNota = r.media >= 4.8 ? 'ok' : r.media >= 4.5 ? 'medio' : 'mal';
  const semNeg = r.pct_malas <= 2 ? 'ok' : r.pct_malas <= 5 ? 'medio' : 'mal';
  const semResp = r.pct_respondidas >= 98 ? 'ok' : r.pct_respondidas >= 90 ? 'medio' : 'mal';
  const varLlegar = hayYoY ? variacion(g.como_llegar, gy.como_llegar) : null;
  // Sin base del año anterior no hay juicio posible: gris, no ámbar (el ámbar
  // se lee como "regular" y acá simplemente no hay con qué comparar).
  const semLlegar = varLlegar === null ? 'neutro' : varLlegar >= 0 ? 'ok' : 'mal';

  // ---- búsquedas: marca vs genéricas ----
  // Se calcula sobre exactamente las que se muestran, para que el % sea verificable
  // mirando el propio gráfico.
  const busq = (d.google.busquedas || []).slice(0, 8);
  const esMarca = (t) => /popular/i.test(t);
  const totalBusq = busq.reduce((a, b) => a + b.veces, 0);
  const totalGen = busq.filter((b) => !esMarca(b.termino)).reduce((a, b) => a + b.veces, 0);
  const pctGen = totalBusq ? Math.round(totalGen / totalBusq * 100) : null;
  const busqMesLabel = d.google.busquedas_mes === P ? '' :
    ` <span style="text-transform:none;letter-spacing:0;font-weight:400">(Google publica las palabras con retraso: estas son las de ${nombreMes(d.google.busquedas_mes)})</span>`;

  // ---- carta digital: buscadores reales (se filtra el ruido) ----
  const RUIDO = /ignore all previous|select |script>|http/i;
  const searches = (carta.top_searches || []).filter((s) => !RUIDO.test(s.query));

  const H = { fmt, esc, pill, variacion, stat, N, MES, MES_YOY, hayBase: hayYoY };
  const DIR_INFORME = path.dirname(jsonPath);

  const cuerpo = `
  <div class="destacado">📌 <b>Lo más importante del mes:</b> ${texto.destacado}</div>

  <div class="semaforo">
    <div class="sem ${semNota}"><div class="v">${String(r.media).replace('.', ',')} ★</div><div class="l">Nota de las reseñas de ${MES}</div></div>
    <div class="sem ${semNeg}"><div class="v">${String(r.pct_malas).replace('.', ',')}%</div><div class="l">Reseñas de 1-2★</div></div>
    <div class="sem ${semResp}"><div class="v">${String(r.pct_respondidas).replace('.', ',')}%</div><div class="l">Reseñas respondidas</div></div>
    ${sinFicha
      ? `<div class="sem neutro"><div class="v">—</div><div class="l">Ficha de Google: sin datos este mes</div></div>`
      : `<div class="sem ${semLlegar}"><div class="v">${fmt(g.como_llegar)}</div><div class="l">Pidieron cómo llegar${varLlegar !== null ? ` (${varLlegar >= 0 ? '+' : '−'}${Math.abs(varLlegar).toFixed(1).replace('.', ',')}% ${vsYoY})` : ''}</div></div>`}
  </div>

  ${sinFicha ? `<section><h2><span class="n">${N()}</span> 📍 Tu ficha de Google</h2>
  <div class="aviso">${texto.avisoFicha || `⚠️ <b>Este mes no hay datos de la ficha.</b> Google no devolvió el rendimiento de ${MES} para este local (${esc(gRaw.error || 'sin datos')}). En cuanto se recupere el acceso se completa esta sección.`}</div>
  </section>` : `<section><h2><span class="n">${N()}</span> 📍 Tu ficha de Google</h2>
  <p class="explica">Lo que hizo en ${MES} la gente que te encontró en Google o Google Maps.
  ${hayYoY
    ? `Se compara contra <b>${MES_YOY}</b>, no contra ${MES_PREV}: son métricas de temporada y cada mes tiene su propio nivel normal.`
    : `Tu ficha todavía no tiene ${MES_YOY} medido, así que este mes va <b>sin comparativa</b> — es el primer ${MES} con medición.`}</p>
  <h3>Lo que la gente hizo</h3>
  <div class="grid">
    ${stat(fmt(inter), '🤝 Interacciones con tu ficha', hayYoY ? pill(variacion(inter, interacciones(gy)), vsYoY) : '')}
    ${stat(fmt(g.como_llegar), '🚗 Pidieron cómo llegar', py('como_llegar'))}
    ${stat(fmt(g.llamadas), '📞 Llamaron por teléfono', py('llamadas'))}
    ${stat(fmt(g.reservas), '📅 Reservaron desde Google', py('reservas'))}
    ${stat(fmt(g.clicks_menu), '🍕 Miraron el menú', py('clicks_menu'))}
    ${stat(fmt(g.clicks_web), '🌐 Entraron a la web', py('clicks_web'))}
  </div>
  <h3>Cuánta gente te vio</h3>
  <div class="grid">
    ${stat(fmt(vistasDia), '👀 Personas por día', py('vistas_perfil'))}
    ${stat(`${Math.round(g.vistas_maps / g.vistas_perfil * 100)}%`, 'Te vieron en Google Maps')}
    ${stat(`${Math.round(g.vistas_busqueda / g.vistas_perfil * 100)}%`, 'En la Búsqueda de Google')}
    ${stat(`${Math.round(g.vistas_movil / g.vistas_perfil * 100)}%`, 'Desde el móvil')}
  </div>
  <p class="nota-chica">En todo ${MES} tu ficha apareció <b>${fmt(g.vistas_perfil)} veces</b>, que es ese promedio de ${fmt(vistasDia)} personas por día.${diasIncompletos ? (diasIncompletos === 1
    ? ' El último día del mes todavía no lo publicó Google, así que el total real es algo mayor.'
    : ` Los últimos ${diasIncompletos} días del mes todavía no los publicó Google, así que el total real es algo mayor.`) : ''}</p>

  <h3>Qué significa cada dato</h3>
  <ul class="glosario">
    <li><b>Apareciste / personas por día:</b> tu ficha se mostró en la pantalla de alguien, en el mapa o en la lista de resultados. No hace falta que la abra ni que la lea. Google cuenta <b>una sola vez por persona y por día</b>.</li>
    <li><b>Interacciones:</b> la suma de todo lo que la gente hizo con tu ficha (las cinco de abajo). Es el número que Google muestra primero en su propio panel, así que lo podés verificar ahí en 10 segundos.</li>
    <li><b>Pidieron cómo llegar:</b> tocaron el botón para que el mapa los guíe hasta la puerta. Es la señal más fuerte de que alguien viene.</li>
    <li><b>Llamaron por teléfono:</b> tocaron el botón de llamar desde la ficha.</li>
    <li><b>Reservaron desde Google:</b> reservaron mesa con el botón de la ficha. <b>Solo ese canal</b> — las reservas por web, teléfono o las que entran directo no están acá, están en RESTOO.</li>
    <li><b>Miraron el menú:</b> abrieron la carta desde la ficha.</li>
    <li><b>Entraron a la web:</b> tocaron el enlace a la página.</li>
  </ul>
  ${busq.length ? `<h3>🔎 Con qué palabras te encuentran${busqMesLabel}</h3>
  ${barras(busq.map((b) => [b.termino, b.veces]), 'neutra')}
  ${pctGen !== null ? `<div class="ok">💡 El <b>${pctGen}%</b> de esas 8 búsquedas <b>no incluye tu nombre</b>: es gente buscando “restaurantes” o “pizza” en la zona que termina viendo tu ficha. La ficha no solo te encuentra quien ya te conoce — también te descubre gente nueva.</div>` : ''}` : ''}
  </section>`}
  ${extras.seccionReservas(d, H)}
  ${extras.seccionFranjas(d, H)}

  <section><h2><span class="n">${N()}</span> ⭐ Qué dice la gente</h2>
  <p class="explica">Las reseñas de Google de ${MES}. Acá sí se compara <b>contra ${MES_PREV}</b>: la calidad y la gestión no dependen de la temporada.</p>
  ${texto.avisoDatos ? `<div class="aviso">${texto.avisoDatos}</div>` : ''}
  <div class="grid">
    ${stat(`⭐ ${String(r.media).replace('.', ',')}`, `Nota media de ${MES}`, pill(variacion(r.media, rp.media), vsMes))}
    ${stat(fmt(r.total), `Reseñas nuevas en ${MES}`, '')}
    ${stat(`${String(r.pct_buenas).replace('.', ',')}%`, 'Fueron de 4 o 5 ★', pill(variacion(r.pct_buenas, rp.pct_buenas), vsMes))}
    ${stat(`${String(r.pct_malas).replace('.', ',')}%`, 'Fueron de 1 o 2 ★', pill(variacion(r.pct_malas, rp.pct_malas), vsMes, false))}
    ${stat(`${String(r.pct_respondidas).replace('.', ',')}%`, 'Respondidas', pill(variacion(r.pct_respondidas, rp.pct_respondidas), vsMes))}
  </div>
  <p class="nota-chica">La cantidad de reseñas no se compara con el año pasado: el histórico que Google devuelve está incompleto y daría un número falso. Sí se compara la <b>proporción</b> de buenas y malas, que no depende del volumen.</p>
  <h3>Cómo se repartieron las ${fmt(r.total)} reseñas</h3>
  ${barras([5, 4, 3, 2, 1].filter((e) => r.distribucion[e]).map((e) => [`${e} ★`, r.distribucion[e]]))}
  <h3>Qué día te dejan reseñas</h3>
  ${barras(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].filter((x) => r.por_dia_semana[x]).map((x) => [x, r.por_dia_semana[x]]), 'neutra')}
  </section>

  <section><h2><span class="n">${N()}</span> 🔍 Las reseñas malas del mes, una por una</h2>
  ${(() => {
    const conTexto = d.resenas.negativas.length;
    const sinTexto = Math.max((r.malas || 0) - conTexto, 0);
    // Sin reseñas malas con texto no hay nada que leer: se dice y se cierra, en vez
    // de dejar un titular hablando de "las 0 reseñas de 1 y 2 estrellas".
    if (!conTexto) {
      return r.malas === 0
        ? `<div class="ok">✅ <b>Ninguna reseña de 1 o 2 estrellas en ${MES}.</b> No hay nada que revisar en esta sección — es el mejor resultado posible y no es fácil de sostener.</div>`
        : `<div class="ok">✅ <b>Ninguna reseña mala con comentario en ${MES}.</b> Hubo ${sinTexto === 1 ? 'una puntuación baja' : sinTexto + ' puntuaciones bajas'} sin texto, así que no hay motivo declarado que se pueda trabajar.</div>`;
    }
    return `<p class="explica">Las ${conTexto} reseñas de 1 y 2 estrellas de ${MES} <b>que dejaron comentario</b>, con su texto real. No hay resumen que reemplace leerlas.${sinTexto ? ` (Hubo ${sinTexto} más con puntuación baja pero sin texto.)` : ''}</p>
  ${d.resenas.negativas.map((x) => `<div class="resena">
    <div class="cab">${estrellas(x.estrellas)}<span>${esc(x.fecha)}</span><span>${esc(x.autor)}</span>${x.respondida ? '' : '<span class="pend">SIN RESPONDER</span>'}</div>
    <div class="txt">“${esc(x.texto)}”</div>
  </div>`).join('')}`;
  })()}
  ${texto.lecturaNegativas ? `<div class="aviso">${texto.lecturaNegativas}</div>` : ''}
  </section>

  ${texto.restoo ? `<section><h2><span class="n">${N()}</span> 💬 Lo que te dejaron en RESTOO</h2>
  <p class="explica">${texto.restoo.intro}</p>
  ${texto.restoo.comentarios.map((c) => `<div class="resena">
    <div class="cab"><span>${esc(c.autor)}</span><span>${esc(c.cuando || '')}</span></div>
    <div class="txt">“${esc(c.texto)}”</div>
  </div>`).join('')}
  ${texto.restoo.cierre ? `<div class="aviso">${texto.restoo.cierre}</div>` : ''}
  </section>` : ''}

  <section><h2><span class="n">${N()}</span> 🏅 A quién nombran los clientes</h2>
  <p class="explica">Contamos cuántas reseñas de ${MES} nombran a cada persona del equipo. El conteo es exacto: se buscan el nombre y sus variantes en el texto de cada reseña.</p>
  <div class="grid">
    ${stat(fmt(d.menciones.actual.totales.conNombre), 'Reseñas que nombran a alguien')}
    ${stat(`${Math.round(d.menciones.actual.totales.conNombre / d.menciones.actual.totales.conTexto * 100)}%`, 'De las reseñas con texto', pill(variacion(
      d.menciones.actual.totales.conNombre / d.menciones.actual.totales.conTexto * 100,
      d.menciones.previo.totales ? d.menciones.previo.totales.conNombre / d.menciones.previo.totales.conTexto * 100 : null), vsMes))}
  </div>
  <h3>Ranking de ${MES}</h3>
  <div class="equipo">
    ${emp.slice(0, 12).map((e) => `<div class="persona"><div class="men">${fmt(e.menciones)}</div><div class="nom">${esc(e.nombre)}</div><div class="det">${e.promedio ? String(e.promedio).replace('.', ',') + ' ★ de media' : ''}</div></div>`).join('')}
  </div>
  <p class="nota-chica">Se cuenta cuántas reseñas nombran a cada persona, no se comparan meses entre sí: en un mes con más clientes hay más reseñas y más menciones para todos.</p>
  </section>

  <section><h2><span class="n">${N()}</span> 📱 Tu carta digital (el QR de las mesas)</h2>
  <p class="explica">Lo que hace la gente dentro de la carta que se abre con el QR. Lo que buscan y no encuentran es lo más valioso de esta sección.</p>
  <div class="grid">
    ${stat(fmt(carta.visitas), 'Veces que se abrió la carta')}
    ${stat(fmt(carta.unicos), 'Personas distintas')}
    ${stat(carta.devices ? carta.devices.mobile_percent + '%' : '—', 'Desde el móvil')}
  </div>
  <p class="nota-chica">La carta digital se mide desde abril de 2026, así que todavía no hay ${MES_YOY} con el que comparar. En ${MES_PREV} fueron ${fmt(cartaPrev.visitas)} aperturas, pero ojo: ${MES} y ${MES_PREV} no son meses equivalentes en la playa.</p>
  <h3>🍽️ Los platos más mirados</h3>
  ${barras((carta.top_items || []).slice(0, 6).map((i) => [i.name, i.count]))}
  ${searches.length ? `<h3>🔍 Qué busca la gente en tu carta</h3>${barras(searches.map((s) => [`“${s.query}”`, s.count]), 'neutra')}` : ''}
  <h3>📲 Por dónde llegan a la carta</h3>
  <div class="grid">
    ${stat(fmt(carta.origen && carta.origen.directo), 'QR en mesa / directo')}
    ${stat(fmt(carta.origen && carta.origen.google), 'Desde Google')}
    ${stat(fmt(carta.origen && carta.origen.redes), 'Desde redes')}
    ${stat(fmt(carta.origen && carta.origen.web), 'Desde la web')}
  </div>
  </section>

  <section><h2><span class="n">${N()}</span> 🌐 Lo que te trajo la web de la marca</h2>
  <p class="explica">Clics hacia tu local desde la página web durante ${MES}.</p>
  <div class="grid">
    ${stat(fmt(d.web.reserva || 0), 'Clics de reserva')}
    ${stat(fmt(d.web.whatsapp || 0), 'Clics de WhatsApp')}
    ${stat(fmt(d.web.comollegar || 0), 'Clics de “cómo llegar”')}
  </div>
  </section>

  ${extras.seccionTendencia(d, H)}

  ${texto.seguimiento && texto.seguimiento.length ? `<section><h2><span class="n">${N()}</span> 🔁 ¿Qué pasó con las acciones de ${MES_PREV}?</h2>
  <p class="explica">Lo que se dejó como tarea en el informe anterior, y qué efecto tuvo. Sin esto, el informe es solo una foto.</p>
  <div class="acciones">${texto.seguimiento.map((a) => `<div class="accion seg ${a.estado}"><div><span class="ico">${{ ok: '✅', mal: '❌', parcial: '🟡', na: '➖' }[a.estado] || '➖'}</span> <b>${a.accion}</b>${a.efecto ? ` — ${a.efecto}` : ''}</div></div>`).join('')}</div>
  </section>` : ''}

  <section><h2><span class="n">${N()}</span> 🧭 Lectura del mes</h2>
  ${texto.lectura.map((p) => `<p>${p}</p>`).join('')}
  </section>

  <section><h2><span class="n">${N()}</span> ✅ Qué hacer en ${MES_SIG}</h2>
  <p class="explica">Pocas cosas y concretas. Si se hacen estas, el informe de ${MES_SIG} mejora solo.</p>
  <div class="acciones">${texto.acciones.map((a) => `<div class="accion"><div>${a}</div></div>`).join('')}</div>
  </section>

  <section><h2><span class="n">${N()}</span> 📣 Ahora te toca a vos</h2>
  <p class="explica">Esta es la única parte del informe que te pedimos a vos. Decinos <b>3 cosas que querés que reforcemos desde las redes</b> en ${MES_SIG}. Con eso te armamos el plan de trabajo del mes y te lo presentamos.</p>
  <div class="pedido">
    <p style="margin:0 0 10px"><b>Mandanos por WhatsApp tus 3 pedidos</b>, y en cada uno decinos si lo querés <b>orgánico</b> (publicaciones), <b>pauta</b> (publicidad paga) o las dos cosas.</p>
    <div class="ejemplos">Por ejemplo: <i>“ayúdenme a fomentar el menú diario, orgánico y pauta”</i> · <i>“quiero captar clientes para cumpleaños y grupos, con pauta”</i> · <i>“este mes quiero reforzar el delivery, solo orgánico”</i>.</div>
  </div>
  </section>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pizzería Popular ${d.local} · ${MES} ${ANIO}</title>${CSS}<style>${extras.CSS_EXTRAS}</style></head><body>
<header><div class="kicker">🍕 Pizzería Popular · Informe de ${MES} ${ANIO}</div><h1>${d.local}</h1><div class="sub">${DIRECCIONES[d.local_id] || ''}</div></header>
${cuerpo}
<div class="nota"><b>Cómo se hizo este informe.</b> Los datos de la ficha vienen directo de la API de Google (ya no se cargan a mano) y por eso se pueden comparar con ${MES_YOY}. Las palabras de búsqueda las publica Google con más retraso que el resto. Las reseñas salen de nuestro sistema, que las sincroniza cada 15 minutos; el conteo de menciones al equipo es determinístico (se buscan el nombre y sus variantes en cada texto), no estimado. La carta digital y la web se miden con sistema propio. Los puntos de mejora operativos están en la <b>auditoría del local ya presentada</b>, que se trabaja aparte de este informe. Grupo Ajax · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</div>
</body></html>`;
}

// ---------- textos por local (lo único que se escribe a mano) ----------
const TEXTOS = Object.assign({}, require('./textos-informe-mensual.js'), require('./textos-informe-2026-08.js'));

if (!jsonPath) { console.error('Uso: node scripts/build-informe-mensual.js <ruta-json> [salida.html]'); process.exit(1); }
const datos = JSON.parse((function (s) { s = String(s); if (s.trimStart().startsWith('{')) return s.trimStart(); const i = s.indexOf('\n{'); return i >= 0 ? s.slice(i + 1) : s; })(fs.readFileSync(jsonPath, 'utf8')));
const clave = `${datos.local_id}|${datos.periodo}`;
const texto = TEXTOS[clave];
if (!texto) { console.error('Faltan los textos para ' + clave + ' en scripts/textos-informe-mensual.js'); process.exit(1); }

const salida = process.argv[3] || path.join(__dirname, '..', 'informes', datos.periodo, `informe-${datos.local_id}.html`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, construir(datos, texto));
console.log('OK ' + salida);
