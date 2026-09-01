// Secciones nuevas del informe mensual por local (desde agosto 2026, 1 sep):
//   - Franjas del mes (mañana / mediodía / noche) vs mismo mes del año anterior.
//   - Tendencia de 12 meses (reseñas, nota, vistas de la ficha, comensales).
//   - Reservas (RESTOO) — se dibuja solo cuando la API devuelve datos.
//   - Lugar en la cadena: el local contra los demás locales del mismo mes.
//
// Mitad "extract" (saca datos de Supabase / GBP / RESTOO) y mitad "build" (HTML).
// Sin euros: este informe lo lee el encargado y puede terminar en el equipo. El
// bruto por turno queda en el JSON (sirve para el % de la venta) pero no se imprime.
const fs = require('fs');
const path = require('path');

const WP = { 'playa-san-juan': 1, 'russafa': 2, 'luceros': 3, 'boadilla': 4, 'santa-clara': 5, 'benidorm': 6 };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// El turno es por hora de COBRO (como en el semanal). La madrugada (0-5h) es
// el cierre de la noche anterior, no "mañana": el business_day de Ágora ya la
// asigna al día que corresponde.
const TURNOS = [
  { k: 'manana', nombre: 'Mañana', horas: '6 a 12h', es: (h) => h >= 6 && h < 12 },
  { k: 'mediodia', nombre: 'Mediodía', horas: '12 a 18h', es: (h) => h >= 12 && h < 18 },
  { k: 'noche', nombre: 'Noche', horas: '18 a 6h', es: (h) => h >= 18 || h < 6 },
];

function mesRango(p) {
  const [y, m] = p.split('-').map(Number);
  const ini = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const fin = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { ini, fin, ultimo };
}
function mesRelativo(p, delta) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// PostgREST corta en 1000 filas: siempre paginar.
async function todas(armar) {
  const filas = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await armar(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

// ============================ EXTRACT ============================

async function franjasDe(supabase, localId, p) {
  const wp = WP[localId];
  if (!wp) return null;
  const { ini, ultimo } = mesRango(p);
  const horas = await todas((a, b) => supabase.from('agora_ventas_horas')
    .select('hora, total_bruto, tickets').eq('workplace_id', wp)
    .gte('business_day', ini).lte('business_day', ultimo).range(a, b));
  if (!horas.length) return null;
  const dias = await todas((a, b) => supabase.from('agora_ventas_dias')
    .select('business_day, comensales, facturas').eq('workplace_id', wp)
    .gte('business_day', ini).lte('business_day', ultimo).range(a, b));
  const out = { turnos: {}, tickets: 0, bruto: 0, comensales: 0, dias: dias.length };
  TURNOS.forEach((t) => { out.turnos[t.k] = { tickets: 0, bruto: 0 }; });
  horas.forEach((h) => {
    const t = TURNOS.find((x) => x.es(Number(h.hora)));
    if (!t) return;
    out.turnos[t.k].tickets += Number(h.tickets) || 0;
    out.turnos[t.k].bruto += Number(h.total_bruto) || 0;
    out.tickets += Number(h.tickets) || 0;
    out.bruto += Number(h.total_bruto) || 0;
  });
  out.comensales = dias.reduce((a, d) => a + (Number(d.comensales) || 0), 0);
  TURNOS.forEach((t) => {
    const x = out.turnos[t.k];
    x.pct_venta = out.bruto ? Math.round(x.bruto / out.bruto * 1000) / 10 : null;
    x.pct_tickets = out.tickets ? Math.round(x.tickets / out.tickets * 1000) / 10 : null;
  });
  return out;
}

async function tendenciaDe(supabase, rendimiento, localId, p) {
  const meses = [];
  for (let i = 11; i >= 0; i--) meses.push(mesRelativo(p, -i));
  const ini = meses[0] + '-01';
  const { fin, ultimo } = mesRango(p);

  const res = await todas((a, b) => supabase.from('pp_resenas_google')
    .select('fecha_resena, estrellas').eq('local_id', localId)
    .gte('fecha_resena', ini).lt('fecha_resena', fin).order('fecha_resena').range(a, b));
  const wp = WP[localId];
  const dias = wp ? await todas((a, b) => supabase.from('agora_ventas_dias')
    .select('business_day, comensales').eq('workplace_id', wp)
    .gte('business_day', ini).lte('business_day', ultimo).range(a, b)) : [];
  let serie = null;
  try {
    const r = await rendimiento({ local_id: localId, desde: ini, hasta: ultimo });
    serie = r.serie_vistas || [];
  } catch (e) { serie = null; }

  return meses.map((m) => {
    const rs = res.filter((r) => String(r.fecha_resena).slice(0, 7) === m);
    const est = rs.map((r) => Number(r.estrellas)).filter((n) => n > 0);
    const com = dias.filter((d) => String(d.business_day).slice(0, 7) === m)
      .reduce((a, d) => a + (Number(d.comensales) || 0), 0);
    const vistas = serie ? serie.filter((x) => String(x.fecha).slice(0, 7) === m)
      .reduce((a, x) => a + (Number(x.vistas) || 0), 0) : null;
    return {
      mes: m,
      resenas: rs.length,
      nota: est.length ? Math.round(est.reduce((a, b) => a + b, 0) / est.length * 100) / 100 : null,
      comensales: com || null,
      vistas: serie ? vistas : null,
    };
  });
}

async function reservasDe(restoo, localId, p) {
  if (!restoo || !restoo.disponible()) return { error: 'RESTOO no configurado' };
  const { ini, ultimo } = mesRango(p);
  try { return await restoo.resumenMensual({ local_id: localId, desde: ini, hasta: ultimo }); }
  catch (e) { return { error: e.message }; }
}

// ============================= BUILD =============================
// h = { fmt, esc, pill, variacion, stat, N, MES, MES_YOY, hayBase }

const coma = (n, dec = 1) => (n === null || n === undefined || Number.isNaN(Number(n))) ? '—'
  : Number(n).toFixed(dec).replace('.', ',');
const nombreMes = (p) => MESES[Number(p.split('-')[1]) - 1];
const mesCorto = (p) => MESES_CORTO[Number(p.split('-')[1]) - 1] + ' ' + p.slice(2, 4);

function seccionFranjas(d, h) {
  const f = d.franjas && d.franjas.actual;
  if (!f || !f.tickets) return '';
  const fy = d.franjas.ano_anterior;
  const hayBase = !!(fy && fy.tickets);
  const vs = 'vs ' + h.MES_YOY;
  const filas = TURNOS.map((t) => {
    const x = f.turnos[t.k]; const y = hayBase ? fy.turnos[t.k] : null;
    return `<tr><td><b>${t.nombre}</b> <span class="suave">${t.horas}</span></td>
      <td class="n">${h.fmt(x.tickets)}</td>
      <td class="n">${x.pct_tickets === null ? '—' : coma(x.pct_tickets, 0) + '%'}</td>
      <td class="n">${x.pct_venta === null ? '—' : coma(x.pct_venta, 0) + '%'}</td>
      ${hayBase ? `<td class="n">${h.pill(h.variacion(x.tickets, y.tickets), vs)}</td>` : ''}</tr>`;
  }).join('');
  const fuerte = TURNOS.map((t) => [t, f.turnos[t.k]]).sort((a, b) => b[1].bruto - a[1].bruto)[0];
  return `
  <section><h2><span class="n">${h.N()}</span> 🕒 Tu mes por franja</h2>
  <p class="explica">Cuántas mesas se cobraron en cada turno de ${h.MES} (por hora de cobro, igual que en el informe semanal). Se compara contra <b>${h.MES_YOY}</b>: cada mes tiene su propio nivel normal.</p>
  <div class="grid">
    ${h.stat(h.fmt(f.comensales), 'Comensales en el mes', hayBase ? h.pill(h.variacion(f.comensales, fy.comensales), vs) : '')}
    ${h.stat(h.fmt(f.tickets), 'Mesas cobradas (tickets)', hayBase ? h.pill(h.variacion(f.tickets, fy.tickets), vs) : '')}
    ${h.stat(coma(f.tickets ? f.comensales / f.tickets : null), 'Personas por mesa', hayBase && fy.tickets ? h.pill(h.variacion(f.comensales / f.tickets, fy.comensales / fy.tickets), vs) : '')}
  </div>
  <div class="scroll"><table class="tabla"><thead><tr><th>Turno</th><th class="n">Mesas</th><th class="n">% de las mesas</th><th class="n">% de la venta</th>${hayBase ? `<th class="n">Mesas ${vs}</th>` : ''}</tr></thead><tbody>${filas}</tbody></table></div>
  <p class="nota-chica">La <b>${fuerte[0].nombre.toLowerCase()}</b> pone el ${coma(fuerte[1].pct_venta, 0)}% de la venta del mes. ${hayBase ? 'Las flechas comparan mesas, no dinero: dicen si vino más o menos gente en ese turno que hace un año.' : 'Sin ' + h.MES_YOY + ' en el TPV, este mes va sin comparativa.'}</p>
  </section>`;
}

function seccionReservas(d, h) {
  const r = d.reservas && d.reservas.actual;
  if (!r || r.error || !r.total) return '';
  const ry = d.reservas.ano_anterior;
  const hayBase = !!(ry && !ry.error && ry.total);
  const vs = 'vs ' + h.MES_YOY;
  const chips = (obj, etiqueta) => {
    const pares = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return pares.length ? `<h3>${etiqueta}</h3><div class="chips">${pares.map(([k, v]) => `<span class="chip">${h.esc(k.toLowerCase().replace(/_/g, ' '))} <b>${h.fmt(v)}</b></span>`).join('')}</div>` : '';
  };
  return `
  <section><h2><span class="n">${h.N()}</span> 📅 Reservas del mes</h2>
  <p class="explica">Todas las reservas de ${h.MES} según RESTOO, entren por donde entren (Google, web, teléfono, mostrador). Las de Google también están en la sección de la ficha.</p>
  <div class="grid">
    ${h.stat(h.fmt(r.total), 'Reservas', hayBase ? h.pill(h.variacion(r.total, ry.total), vs) : '')}
    ${h.stat(h.fmt(r.comensales), 'Comensales reservados', hayBase ? h.pill(h.variacion(r.comensales, ry.comensales), vs) : '')}
    ${h.stat(coma(r.media_pax), 'Personas por reserva', '')}
    ${h.stat(r.pct_no_show === null ? '—' : coma(r.pct_no_show) + '%', 'No se presentaron (no-show)', hayBase ? h.pill(h.variacion(r.pct_no_show, ry.pct_no_show), vs, false) : '')}
    ${h.stat(h.fmt(r.canceladas), 'Canceladas', '')}
  </div>
  ${chips(r.por_canal, '📲 Por dónde entraron')}
  ${chips(r.por_turno, '🕒 Por turno')}
  </section>`;
}

function seccionTendencia(d, h) {
  const t = d.tendencia;
  if (!Array.isArray(t) || !t.length) return '';
  const max = (k) => Math.max(...t.map((x) => Number(x[k]) || 0));
  const mx = { resenas: max('resenas'), vistas: max('vistas'), comensales: max('comensales') };
  const celda = (v, k, dec) => {
    if (v === null || v === undefined) return '<td class="n suave">—</td>';
    const top = mx[k] && Number(v) === mx[k];
    return `<td class="n${top ? ' top' : ''}">${dec !== undefined ? coma(v, dec) : h.fmt(v)}</td>`;
  };
  const tieneDato = (x) => (x.resenas > 0) || (x.vistas > 0) || (x.comensales > 0);
  const primero = t.findIndex(tieneDato);
  const vacio = '<td class="n suave">—</td>';
  const filas = t.map((x, i) => {
    const antes = primero < 0 || i < primero;
    return `<tr class="${x.mes === d.periodo ? 'actual' : ''}"><td>${mesCorto(x.mes)}</td>${antes ? vacio + vacio + vacio + vacio
      : celda(x.resenas, 'resenas') + celda(x.nota, 'nota', 2) + celda(x.vistas ? x.vistas : null, 'vistas') + celda(x.comensales, 'comensales')}</tr>`;
  }).join('');
  const conVistas = t.some((x) => x.vistas !== null);
  const mesesSinActividad = primero > 0 ? primero : 0;
  return `
  <section><h2><span class="n">${h.N()}</span> 📈 Los últimos 12 meses</h2>
  <p class="explica">Mes a mes, para ver ${h.MES} en contexto y no como una foto suelta. En negrita, el mejor mes de cada columna.</p>
  <div class="scroll"><table class="tabla"><thead><tr><th>Mes</th><th class="n">Reseñas</th><th class="n">Nota</th><th class="n">Vistas de la ficha</th><th class="n">Comensales</th></tr></thead><tbody>${filas}</tbody></table></div>
  <p class="nota-chica">Reseñas y nota: Google. Vistas: ficha de Google${conVistas ? '' : ' (sin datos este mes)'}. Comensales: TPV. Los meses sin dato se muestran con “—”${mesesSinActividad ? ` (los ${mesesSinActividad} primeros son anteriores a la apertura o a la medición del local)` : ''}.</p>
  </section>`;
}

// Carga los datos del mes de los otros locales (mismo directorio del informe).
function cargarHermanos(dir, periodo) {
  const out = [];
  for (const slug of ['playa-san-juan', 'luceros', 'benidorm', 'russafa', 'santa-clara']) {
    const f = path.join(dir, `datos-${slug}.json`);
    if (!fs.existsSync(f)) continue;
    try {
      const s = fs.readFileSync(f, 'utf8');
      const j = JSON.parse(s.trimStart().startsWith('{') ? s : s.slice(s.indexOf('\n{') + 1));
      if (j.periodo === periodo) out.push(j);
    } catch (e) { /* se ignora */ }
  }
  return out;
}

function seccionCadena(d, h, dir) {
  const todos = cargarHermanos(dir, d.periodo);
  if (todos.length < 2) return '';
  const val = {
    con_nombre: (x) => (x.menciones && x.menciones.actual && x.menciones.actual.totales && x.menciones.actual.totales.conTexto)
      ? x.menciones.actual.totales.conNombre / x.menciones.actual.totales.conTexto * 100 : null,
    negativas: (x) => x.resenas && x.resenas.actual ? x.resenas.actual.pct_malas : null,
    respondidas: (x) => x.resenas && x.resenas.actual ? x.resenas.actual.pct_respondidas : null,
    nota: (x) => x.resenas && x.resenas.actual ? x.resenas.actual.media : null,
    resenas_100: (x) => (x.franjas && x.franjas.actual && x.franjas.actual.comensales && x.resenas && x.resenas.actual)
      ? x.resenas.actual.total / x.franjas.actual.comensales * 100 : null,
    noche: (x) => (x.franjas && x.franjas.actual && x.franjas.actual.turnos) ? x.franjas.actual.turnos.noche.pct_venta : null,
  };
  const IND = [
    { k: 'con_nombre', label: 'Reseñas que nombran a alguien del equipo', alto: true, f: (v) => coma(v, 0) + '%' },
    { k: 'resenas_100', label: 'Reseñas por cada 100 comensales', alto: true, f: (v) => coma(v, 1) },
    { k: 'nota', label: 'Nota media del mes', alto: true, f: (v) => coma(v, 2) + ' ★' },
    { k: 'negativas', label: 'Reseñas de 1-2★', alto: false, f: (v) => coma(v, 1) + '%' },
    { k: 'respondidas', label: 'Reseñas respondidas', alto: true, f: (v) => coma(v, 1) + '%' },
    { k: 'noche', label: 'Parte de la venta que es de noche', alto: null, f: (v) => coma(v, 0) + '%' },
  ];
  const filas = IND.map((ind) => {
    const lista = todos.map((x) => ({ local: x.local, id: x.local_id, v: val[ind.k](x) })).filter((x) => x.v !== null && !Number.isNaN(x.v));
    if (lista.length < 2) return '';
    if (ind.alto !== null) lista.sort((a, b) => ind.alto ? b.v - a.v : a.v - b.v);
    else lista.sort((a, b) => b.v - a.v);
    const pos = lista.findIndex((x) => x.id === d.local_id);
    if (pos < 0) return '';
    const yo = lista[pos]; const primero = lista[0];
    const puesto = ind.alto === null ? `${pos + 1}º de ${lista.length} (más noche)` : `<b>${pos + 1}º</b> de ${lista.length}`;
    const clase = ind.alto === null ? '' : (pos === 0 ? 'ok' : pos === lista.length - 1 ? 'mal' : 'medio');
    return `<tr><td>${ind.label}</td><td class="n"><b>${ind.f(yo.v)}</b></td><td class="n puesto ${clase}">${puesto}</td><td class="suave">${pos === 0 ? 'Sos el primero' : h.esc(primero.local) + ' (' + ind.f(primero.v) + ')'}</td></tr>`;
  }).join('');
  if (!filas) return '';
  const russafa = todos.find((x) => x.local_id === 'russafa');
  return `
  <section><h2><span class="n">${h.N()}</span> 🏆 Tu lugar en la cadena</h2>
  <p class="explica">Tu local contra los otros ${todos.length - 1} en el mismo mes. Sirve para saber qué es “normal” en la marca y en qué estás por encima o por debajo.</p>
  <div class="scroll"><table class="tabla"><thead><tr><th>Indicador</th><th class="n">Tu ${h.MES}</th><th class="n">Puesto</th><th>Quién va primero</th></tr></thead><tbody>${filas}</tbody></table></div>
  <p class="nota-chica">Locales comparados: ${todos.map((x) => h.esc(x.local)).join(', ')}.${russafa && russafa.resenas && russafa.resenas.actual && russafa.resenas.actual.total < 30 ? ' Russafa entra con las reseñas que Google dejó sincronizar (acceso a la ficha cortado desde el 14/8).' : ''}</p>
  </section>`;
}

// CSS de las tablas de estas secciones (se suma al CSS común del informe).
const CSS_EXTRAS = `
  .tabla { width: 100%; border-collapse: collapse; margin: 10px 0 6px; font-size: 14px; }
  .tabla th, .tabla td { padding: 7px 9px; border-bottom: 1px solid var(--linea); text-align: left; vertical-align: top; }
  .tabla th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--suave); }
  .tabla td.n, .tabla th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tabla tbody tr:nth-child(odd) { background: rgba(0,0,0,.025); }
  .tabla tr.actual td { background: rgba(216,164,96,.18); font-weight: 700; }
  .tabla td.top { font-weight: 800; }
  .tabla td.puesto.ok { color: #2e7d32; } .tabla td.puesto.mal { color: #c62828; } .tabla td.puesto.medio { color: #8a6d1d; }
  .tabla .suave, .suave { color: var(--suave); font-weight: 400; font-size: 12px; }
  .scroll { overflow-x: auto; }
  @media (max-width: 480px) { .tabla { font-size: 12px; } .tabla th, .tabla td { padding: 6px 5px; } }
`;

module.exports = { franjasDe, tendenciaDe, reservasDe, seccionFranjas, seccionReservas, seccionTendencia, seccionCadena, CSS_EXTRAS, TURNOS, WP };
