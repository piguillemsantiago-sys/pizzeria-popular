// ============================================================
// lib/restoo.js — Lectura de reservas desde la API de RESTOO.
// Sirve para el informe mensual: total real de reservas y comensales por local,
// no-shows, cancelaciones y de qué canal viene cada reserva (Google, widget de
// la web, teléfono/mostrador). Es lo que permite poner en contexto las reservas
// que reporta Google: esas son un canal, no el total.
//
// Autenticación "por usuario" (en beta según RESTOO): API key estática + el mail
// del dueño del token + el Account ID del local, los tres por cabecera.
// No hay webhooks todavía: todo es consulta bajo demanda.
// ============================================================

const BASES = {
  dev: 'https://api-dev.myrestoo.net/v3',
  prod: 'https://api.myrestoo.net/v3',
};

// Account ID de cada local en RESTOO. Son los mismos slugs que ya usa el tracker
// web en lib/web-stats.js, así que el mapeo es directo.
const CUENTAS = {
  'russafa': 'pizzeriapopular',
  'benidorm': 'pizzeriapopular-benidorm',
  'boadilla': 'pizzeriapopular-boadilla',
  'luceros': 'pizzeriapopular-luceros',
  'playa-san-juan': 'pizzeriapopular-playasanjuan',
};

function err(status, message) { const e = new Error(message); e.status = status; return e; }

function config() {
  const token = process.env.RESTOO_API_KEY;
  const user = process.env.RESTOO_USER_ID;
  const entorno = process.env.RESTOO_ENV || 'prod';
  if (!token) throw err(500, 'Falta RESTOO_API_KEY en el .env');
  if (!user) throw err(500, 'Falta RESTOO_USER_ID en el .env (el mail dueño del token)');
  if (!BASES[entorno]) throw err(500, 'RESTOO_ENV tiene que ser "dev" o "prod"');
  return { token, user, base: BASES[entorno], entorno };
}

function disponible() { return !!process.env.RESTOO_API_KEY; }

function cuentaDe(localId) {
  // En el entorno de pruebas todos los locales apuntan a la cuenta de test.
  if ((process.env.RESTOO_ENV || 'prod') === 'dev') {
    return process.env.RESTOO_ACCOUNT_DEV || 'dev-test10';
  }
  const c = CUENTAS[localId];
  if (!c) throw err(400, 'local sin cuenta de RESTOO: ' + localId);
  return c;
}

async function pedir(ruta, { localId, params } = {}) {
  const { token, user, base } = config();
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k + '[]', x));
    else if (v !== undefined && v !== null) qs.set(k, v);
  });
  const url = base + ruta + (qs.toString() ? '?' + qs.toString() : '');
  const r = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      'Restoo-Partner-Id': 'api',
      'Restoo-User-Id': user,
      'Restoo-Account-Id': cuentaDe(localId),
      Accept: 'application/json',
    },
  });
  const cuerpo = await r.text();
  let json = null;
  try { json = cuerpo ? JSON.parse(cuerpo) : null; } catch (_) { /* respuesta no-JSON */ }
  if (!r.ok) throw err(r.status, 'RESTOO ' + r.status + ' en ' + ruta + ': ' + cuerpo.slice(0, 300));
  return json;
}

// La API no acepta rangos de más de 31 días: se trocea y se concatena.
function tramos(desde, hasta, maxDias = 31) {
  const out = [];
  let ini = new Date(desde + 'T00:00:00Z');
  const fin = new Date(hasta + 'T00:00:00Z');
  while (ini <= fin) {
    const corte = new Date(ini);
    corte.setUTCDate(corte.getUTCDate() + maxDias - 1);
    const f = corte > fin ? fin : corte;
    out.push({ desde: ini.toISOString().slice(0, 10), hasta: f.toISOString().slice(0, 10) });
    ini = new Date(f);
    ini.setUTCDate(ini.getUTCDate() + 1);
  }
  return out;
}

async function reservas({ local_id, desde, hasta } = {}) {
  if (!desde || !hasta) throw err(400, 'faltan desde/hasta');
  const todas = [];
  for (const t of tramos(desde, hasta)) {
    const res = await pedir('/bookings', {
      localId: local_id,
      params: { date_start: t.desde, date_end: t.hasta },
    });
    const filas = (res && (res.data || res.bookings || res.items)) || [];
    todas.push(...filas);
  }
  return todas;
}

// Estados que cuentan como "vino y consumió". CANCELED y NO_SHOW se miden aparte
// porque son justamente lo que hay que bajar.
const ASISTIDAS = ['SEATED', 'FINISHED', 'CLOSED', 'CONFIRMED', 'ARRIVED'];

function resumir(filas) {
  const total = filas.length;
  const porEstado = {};
  const porCanal = {};
  const porPartner = {};
  const porTurno = {};
  const porDia = {};
  let comensales = 0;
  let comensalesAsistidos = 0;

  filas.forEach((b) => {
    const estado = String(b.status || 'DESCONOCIDO').toUpperCase();
    porEstado[estado] = (porEstado[estado] || 0) + 1;

    const pax = Number(b.pax) || 0;
    comensales += pax;
    if (ASISTIDAS.includes(estado)) comensalesAsistidos += pax;

    // El canal cuenta el "cómo entró": el widget de la web, el mostrador/teléfono
    // (OFFLINE) o un partner externo. bookingPartner afina el externo (GOOGLE...).
    const canal = String(b.bookingPartner || b.channel || 'SIN_DATO').toUpperCase();
    porCanal[canal] = (porCanal[canal] || 0) + 1;
    if (b.bookingPartner) {
      const p = String(b.bookingPartner).toUpperCase();
      porPartner[p] = (porPartner[p] || 0) + 1;
    }

    const turno = String(b.shiftType || 'SIN_TURNO').toUpperCase();
    porTurno[turno] = (porTurno[turno] || 0) + 1;

    const dia = String(b.bookingAt || '').slice(0, 10);
    if (dia) porDia[dia] = (porDia[dia] || 0) + 1;
  });

  const noShows = porEstado.NO_SHOW || 0;
  const canceladas = porEstado.CANCELED || porEstado.CANCELLED || 0;
  const pct = (n) => (total ? Math.round(n / total * 1000) / 10 : null);

  return {
    total,
    comensales,
    comensales_asistidos: comensalesAsistidos,
    media_pax: total ? Math.round(comensales / total * 10) / 10 : null,
    no_shows: noShows,
    canceladas,
    pct_no_show: pct(noShows),
    pct_canceladas: pct(canceladas),
    por_estado: porEstado,
    por_canal: porCanal,
    por_partner: porPartner,
    por_turno: porTurno,
    por_dia: porDia,
  };
}

async function resumenMensual({ local_id, desde, hasta } = {}) {
  const filas = await reservas({ local_id, desde, hasta });
  return { ...resumir(filas), desde, hasta, local_id };
}

module.exports = { reservas, resumir, resumenMensual, disponible, CUENTAS, tramos };
