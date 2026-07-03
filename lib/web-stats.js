// ============================================================
// lib/web-stats.js — analítica propia del sitio público (sin cookies).
// Registra eventos (pageview, whatsapp, reserva, instagram, formulario)
// en ppweb_eventos y los agrega por mes para el panel.
// ============================================================
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');

const TIPOS = ['pageview', 'whatsapp', 'reserva', 'comollegar', 'instagram', 'formulario'];
const ACCIONES = ['whatsapp', 'reserva', 'comollegar', 'formulario'];
const SALT = process.env.TRACK_SALT || 'pp-web-analytics';

// Mapa de destino → local. Para WhatsApp el destino es el número (wa.me/NUM),
// para reservas el subdominio de myrestoo. Así sabemos qué sucursal genera cada click.
const LOCALES = {
  '34680223458': 'Benidorm', '34608376490': 'Santa Clara', '34696150393': 'Russafa',
  '34680445901': 'Playa San Juan', '34659625152': 'Luceros', '34696366068': 'Boadilla',
  'pizzeriapopular-benidorm': 'Benidorm', 'pizzeriapopular-santaclara': 'Santa Clara',
  'pizzeriapopular': 'Russafa', 'pizzeriapopular-playasanjuan': 'Playa San Juan',
  'pizzeriapopular-luceros': 'Luceros', 'pizzeriapopular-boadilla': 'Boadilla',
};
function localFromTarget(t) { return (t && LOCALES[t]) || null; }

// Hash anónimo del visitante: IP + User-Agent + salt. NO guardamos la IP.
// Estable en el tiempo → permite contar visitantes únicos del mes sin cookies.
function visitorHash(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + '|' + ua + '|' + SALT)
    .digest('hex').slice(0, 24);
}

// Solo el host del referrer (de dónde vienen), sin query ni path.
function refHost(ref) {
  if (!ref) return null;
  try { return new URL(ref).hostname.replace(/^www\./, ''); }
  catch (e) { return null; }
}

// Dispositivo a partir del User-Agent (móvil / escritorio).
function deviceFrom(req) {
  const ua = req.headers['user-agent'] || '';
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) ? 'movil' : 'escritorio';
}

// ---- Registro de un evento (fire-and-forget: nunca rompe la respuesta) ----
function logEvento(req, { tipo, path, ref, target }) {
  if (!TIPOS.includes(tipo)) return;
  supabaseAdmin.from('ppweb_eventos').insert({
    tipo,
    path: path ? String(path).slice(0, 300) : null,
    referrer: refHost(ref),
    visitor: visitorHash(req),
    device: deviceFrom(req),
    target: target ? String(target).slice(0, 80) : null, // local destino (wa/reserva)
  }).then(
    ({ error }) => { if (error) console.error('[WebStats] Error:', error.message); },
    (e) => console.error('[WebStats] Error:', e.message)
  );
}

// Rango [desde, hasta) de un mes 'YYYY-MM' en hora local del servidor.
function mesRango(mes) {
  const ahora = new Date();
  const [y, m] = (mes && /^\d{4}-\d{2}$/.test(mes))
    ? mes.split('-').map(Number)
    : [ahora.getFullYear(), ahora.getMonth() + 1];
  const desde = new Date(y, m - 1, 1);
  const hasta = new Date(y, m, 1);
  return { desde, hasta, y, m };
}

// Hora local (Europe/Madrid) de una fecha, 0-23.
function horaMadrid(ts) {
  const h = new Date(ts).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false });
  return parseInt(h, 10) % 24;
}

// PostgREST corta en 1000 filas por request (max-rows del servidor) aunque se
// pida más con .limit(). Paginamos con .range() para traer TODOS los eventos
// del mes; si no, en meses con +1000 eventos se perdían días enteros: la
// consulta ordena por fecha desc y solo veía los últimos 1000, así que los
// días con tráfico más viejos aparecían en 0 (y los totales quedaban cortos).
const PAGE = 1000;
async function fetchEventos(desde, hasta, columnas, soloPageview) {
  const todas = [];
  for (let offset = 0; offset < 200000; offset += PAGE) {
    let q = supabaseAdmin
      .from('ppweb_eventos')
      .select(columnas)
      .gte('created_at', desde.toISOString())
      .lt('created_at', hasta.toISOString());
    if (soloPageview) q = q.eq('tipo', 'pageview');
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || !data.length) break;
    todas.push(...data);
    if (data.length < PAGE) break;
  }
  return todas;
}

// Visitas y visitantes únicos de un mes (para la comparativa).
async function totalesMes(desde, hasta) {
  const rows = await fetchEventos(desde, hasta, 'visitor', true);
  const vis = new Set();
  rows.forEach((r) => { if (r.visitor) vis.add(r.visitor); });
  return { visitas: rows.length, visitantes: vis.size };
}

// ---- Métricas del mes ----
async function getWebStats(mes) {
  const { desde, hasta, y, m } = mesRango(mes);

  const eventos = await fetchEventos(
    desde, hasta, 'tipo,path,referrer,visitor,device,target,created_at', false);

  // Contadores por tipo
  const conteo = { pageview: 0, whatsapp: 0, reserva: 0, comollegar: 0, instagram: 0, formulario: 0 };
  const visitantes = new Set();
  const visAccion = new Set();           // visitantes que hicieron alguna acción
  const fuentes = {};
  const paginas = {};
  const idioma = { es: 0, en: 0 };        // visitas por idioma (según la ruta)
  const porLocal = {};                    // { local: { whatsapp, reserva } }
  const dispositivos = { movil: 0, escritorio: 0 };
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, count: 0 }));

  // Serie por día del mes
  const dias = new Date(y, m, 0).getDate();
  const porDia = [];
  const byDay = {};
  for (let d = 1; d <= dias; d++) {
    const obj = { dia: d, label: String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0'), count: 0 };
    porDia.push(obj);
    byDay[d] = obj;
  }

  eventos.forEach((e) => {
    if (conteo[e.tipo] != null) conteo[e.tipo]++;
    if (e.tipo === 'pageview') {
      if (e.visitor) visitantes.add(e.visitor);
      const d = new Date(e.created_at).getDate();
      if (byDay[d]) byDay[d].count++;
      porHora[horaMadrid(e.created_at)].count++;
      const f = e.referrer || 'directo';
      fuentes[f] = (fuentes[f] || 0) + 1;
      const p = e.path || '/';
      paginas[p] = (paginas[p] || 0) + 1;
      if (/^\/en(\/|$)/.test(p)) idioma.en++; else idioma.es++;
      if (e.device === 'movil') dispositivos.movil++;
      else if (e.device === 'escritorio') dispositivos.escritorio++;
    } else if (ACCIONES.includes(e.tipo)) {
      if (e.visitor) visAccion.add(e.visitor);
      if ((e.tipo === 'whatsapp' || e.tipo === 'reserva' || e.tipo === 'comollegar') && e.target) {
        const l = localFromTarget(e.target) || e.target;
        if (!porLocal[l]) porLocal[l] = { whatsapp: 0, reserva: 0, comollegar: 0 };
        porLocal[l][e.tipo]++;
      }
    }
  });

  const top = (obj, n) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([nombre, count]) => ({ nombre, count }));

  // Comparativa con el mes anterior "a la fecha" (month-to-date): si el mes en
  // curso va por el día N (hora H), comparamos SOLO contra los primeros N días
  // /H horas del mes anterior, no contra el mes completo. Comparar 3 días de
  // julio contra los 30 de junio daba una caída falsa (-73%). En meses ya
  // cerrados se compara mes completo vs mes completo.
  const ahora = new Date();
  const esMesActual = (y === ahora.getFullYear() && m === ahora.getMonth() + 1);
  const desdePrev = new Date(y, m - 2, 1);
  const hastaPrev = esMesActual
    ? new Date(desdePrev.getTime() + (ahora - desde)) // mismo tiempo transcurrido
    : new Date(y, m - 1, 1);                          // mes anterior completo
  const prev = await totalesMes(desdePrev, hastaPrev);

  // Tasa de conversión: % de visitantes que hicieron alguna acción.
  const conversion = visitantes.size
    ? Math.round((visAccion.size / visitantes.size) * 1000) / 10 : 0;

  // Desglose por local, ordenado por total de interacciones.
  const locales = Object.entries(porLocal)
    .map(([local, v]) => ({ local, whatsapp: v.whatsapp, reserva: v.reserva, comollegar: v.comollegar || 0, total: v.whatsapp + v.reserva + (v.comollegar || 0) }))
    .sort((a, b) => b.total - a.total);

  // Serie diaria del mes en curso: mostramos todos los días desde el 1 hasta
  // hoy (los días sin tráfico van en 0). Solo recortamos los días futuros, que
  // todavía no ocurrieron. En meses pasados se muestra el mes completo.
  const ultimoDia = esMesActual ? ahora.getDate() : dias;
  const porDiaVista = porDia.filter((o) => o.dia <= ultimoDia);

  return {
    mes: y + '-' + String(m).padStart(2, '0'),
    visitas: conteo.pageview,
    visitantes: visitantes.size,
    whatsapp: conteo.whatsapp,
    reserva: conteo.reserva,
    comollegar: conteo.comollegar,
    instagram: conteo.instagram,
    formulario: conteo.formulario,
    conversion,                  // % visitantes → acción
    conversionAcciones: visAccion.size,
    porDia: porDiaVista,
    porHora,
    fuentes: top(fuentes, 8),
    paginas: top(paginas, 8),
    idioma,                      // { es, en } visitas
    locales,                     // [{ local, whatsapp, reserva, total }]
    dispositivos,
    previo: prev,
  };
}

module.exports = { logEvento, getWebStats };
