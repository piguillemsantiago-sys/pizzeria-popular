// ============================================================
// lib/informe-reparacion.js — Arreglar lo que impide mandar el informe.
//
// Cuando la verificación falla, casi siempre es porque FALTAN DATOS, no
// porque estén mal: el TPV todavía no sincronizó el domingo, o las reseñas
// vienen atrasadas. Eso se arregla solo, así que en vez de avisar y quedarse
// quieto, el sistema resincroniza y vuelve a intentar.
//
// Lo que NO se puede reparar solo es que los números NO CUADREN entre sí
// (el informe dice una cosa y el recálculo otra): eso es un error de código
// y hay que avisar en el momento, porque reintentar no lo va a cambiar.
//
// El sync de ventas vive en el panel AJAX (Railway), no acá. Para llamarlo
// hace falta un token de usuario: se consigue con la service_role key
// pidiendo un enlace mágico y canjeándolo, así no hay que guardar ninguna
// contraseña en el servidor.
// ============================================================
const { supabaseAdmin } = require('./supabase');

const PANEL_AJAX = process.env.PANEL_AJAX_URL
  || 'https://habit-tracker-production-b9ab.up.railway.app';
const USUARIO_SYNC = process.env.INFORME_SYNC_USER || 'piguillemsantiago@gmail.com';

// Errores que se arreglan resincronizando (faltan datos o están viejos).
const REPARABLES = [
  'Cobertura de la semana',
  'Rango correcto',
  'Días completos en el informe',
  'Días de la semana anterior',
  'Datos sincronizados',
  'Cantidad de reseñas',
  'Nota media',
  'Reseñas negativas',
  'Semana anterior',
  'Misma semana del año pasado',
  // Cuando falta un día, la venta por productos deja de cuadrar con el total
  // diario: es un síntoma del mismo problema, no una causa aparte.
  'Productos vs total del día',
  'Total por familias',
  'Participación de',
  'Top 10',
  'Detalle día a día',
];

// Alcanza con que UNO de los errores sea de datos faltantes para que valga la
// pena resincronizar: un día que falta arrastra otros errores derivados, y
// exigir que TODOS fueran reparables hacía que no se intentara nada.
function esReparable(errores) {
  return errores.length > 0 && errores.some((e) => REPARABLES.some((r) => e.startsWith(r)));
}

function tocaResenas(errores) {
  return errores.some((e) => /reseñas|Nota media/i.test(e));
}

function tocaVentas(errores) {
  return errores.some((e) => !/reseñas|Nota media/i.test(e));
}

// Días que el TPV no tiene cargados: son los que hay que volver a pedir.
function diasFaltantes(errores) {
  const linea = errores.find((e) => e.startsWith('Cobertura de la semana'));
  if (!linea) return null;
  const m = linea.match(/\((.*)\)/);
  return m ? m[1].split(',').map((x) => x.trim()) : null;
}

// Token de usuario sin contraseñas: enlace mágico emitido con service_role
// y canjeado al instante. Dura lo que dura la llamada.
async function tokenDeUsuario() {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const A = process.env.SUPABASE_ANON_KEY;
  const gen = await fetch(base + '/auth/v1/admin/generate_link', {
    method: 'POST',
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: USUARIO_SYNC }),
    signal: AbortSignal.timeout(30000),
  });
  const d = await gen.json();
  const hash = d.hashed_token || (d.properties && d.properties.hashed_token);
  if (!hash) throw new Error('no se pudo emitir el enlace: ' + JSON.stringify(d).slice(0, 120));
  const ver = await fetch(base + '/auth/v1/verify', {
    method: 'POST',
    headers: { apikey: A, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hash }),
    signal: AbortSignal.timeout(30000),
  });
  const s = await ver.json();
  if (!s.access_token) throw new Error('no se pudo canjear el enlace: ' + JSON.stringify(s).slice(0, 120));
  return s.access_token;
}

// Vuelve a leer del TPV los 7 días de la semana. El upsert es idempotente,
// así que repetirlo no duplica nada.
async function resincronizarVentas(d1) {
  const token = await tokenDeUsuario();
  const hechos = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(d1 + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const dia = d.toISOString().slice(0, 10);
    try {
      const r = await fetch(PANEL_AJAX + '/api/agora-ventas/sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dia }),
        signal: AbortSignal.timeout(120000),
      });
      hechos.push(dia + (r.ok ? ' ok' : ' fallo ' + r.status));
    } catch (e) {
      hechos.push(dia + ' error: ' + e.message.slice(0, 40));
    }
  }
  return 'ventas resincronizadas (' + hechos.join(', ') + ')';
}

async function resincronizarResenas() {
  const gbp = require('./gbp');
  if (!gbp.mapeado()) return 'reseñas: Google no está mapeado, no se pudo resincronizar';
  const r = await gbp.sync({ full: false });
  const nuevas = (r.resultados || []).reduce((a, x) => a + (x.nuevas || 0), 0);
  return 'reseñas resincronizadas (' + nuevas + ' nuevas)';
}

// Ejecuta las reparaciones que correspondan a los errores encontrados.
// Devuelve la lista de lo que hizo, para dejarla registrada.
async function reparar(d1, errores) {
  const hechas = [];
  if (tocaVentas(errores)) {
    try { hechas.push(await resincronizarVentas(d1)); }
    catch (e) { hechas.push('ventas: no se pudo resincronizar (' + e.message.slice(0, 80) + ')'); }
  }
  if (tocaResenas(errores)) {
    try { hechas.push(await resincronizarResenas()); }
    catch (e) { hechas.push('reseñas: no se pudo resincronizar (' + e.message.slice(0, 80) + ')'); }
  }
  return hechas;
}

// ---- Bitácora de envíos (para reintentar solo lo que falta) ----
async function yaEnviado(local, semana) {
  const { data } = await supabaseAdmin.from('pp_informes_envios')
    .select('estado').eq('local_id', local).eq('semana', semana).maybeSingle();
  return !!(data && data.estado === 'enviado');
}

async function registrar(local, semana, campos) {
  const { error } = await supabaseAdmin.from('pp_informes_envios')
    .upsert({ local_id: local, semana, actualizado: new Date().toISOString(), ...campos },
      { onConflict: 'local_id,semana' });
  if (error) console.error('[InformeSemanal] no se pudo registrar el envío:', error.message);
}

async function intentosPrevios(local, semana) {
  const { data } = await supabaseAdmin.from('pp_informes_envios')
    .select('intentos').eq('local_id', local).eq('semana', semana).maybeSingle();
  return (data && data.intentos) || 0;
}

module.exports = {
  esReparable, reparar, resincronizarVentas, resincronizarResenas,
  yaEnviado, registrar, intentosPrevios,
};
