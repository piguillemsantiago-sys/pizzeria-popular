// ============================================================
// lib/web-stats.js — analítica propia del sitio público (sin cookies).
// Registra eventos (pageview, whatsapp, reserva, instagram, formulario)
// en ppweb_eventos y los agrega por mes para el panel.
// ============================================================
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');

const TIPOS = ['pageview', 'whatsapp', 'reserva', 'instagram', 'formulario'];
const SALT = process.env.TRACK_SALT || 'pp-web-analytics';

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
function logEvento(req, { tipo, path, ref }) {
  if (!TIPOS.includes(tipo)) return;
  supabaseAdmin.from('ppweb_eventos').insert({
    tipo,
    path: path ? String(path).slice(0, 300) : null,
    referrer: refHost(ref),
    visitor: visitorHash(req),
    device: deviceFrom(req),
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

// Visitas y visitantes únicos de un mes (para la comparativa). Liviano.
async function totalesMes(desde, hasta) {
  const { data } = await supabaseAdmin
    .from('ppweb_eventos')
    .select('visitor')
    .eq('tipo', 'pageview')
    .gte('created_at', desde.toISOString())
    .lt('created_at', hasta.toISOString())
    .limit(50000);
  const rows = data || [];
  const vis = new Set();
  rows.forEach((r) => { if (r.visitor) vis.add(r.visitor); });
  return { visitas: rows.length, visitantes: vis.size };
}

// ---- Métricas del mes ----
async function getWebStats(mes) {
  const { desde, hasta, y, m } = mesRango(mes);

  const { data: rows, error } = await supabaseAdmin
    .from('ppweb_eventos')
    .select('tipo,path,referrer,visitor,device,created_at')
    .gte('created_at', desde.toISOString())
    .lt('created_at', hasta.toISOString())
    .order('created_at', { ascending: false })
    .limit(50000);
  if (error) throw new Error(error.message);
  const eventos = rows || [];

  // Contadores por tipo
  const conteo = { pageview: 0, whatsapp: 0, reserva: 0, instagram: 0, formulario: 0 };
  const visitantes = new Set();
  const fuentes = {};
  const paginas = {};
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
      if (e.device === 'movil') dispositivos.movil++;
      else if (e.device === 'escritorio') dispositivos.escritorio++;
    }
  });

  const top = (obj, n) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([nombre, count]) => ({ nombre, count }));

  // Comparativa con el mes anterior.
  const desdePrev = new Date(y, m - 2, 1);
  const hastaPrev = new Date(y, m - 1, 1);
  const prev = await totalesMes(desdePrev, hastaPrev);

  return {
    mes: y + '-' + String(m).padStart(2, '0'),
    visitas: conteo.pageview,
    visitantes: visitantes.size,
    whatsapp: conteo.whatsapp,
    reserva: conteo.reserva,
    instagram: conteo.instagram,
    formulario: conteo.formulario,
    porDia,
    porHora,
    fuentes: top(fuentes, 8),
    paginas: top(paginas, 8),
    dispositivos,
    previo: prev, // { visitas, visitantes } del mes anterior
  };
}

module.exports = { logEvento, getWebStats };
