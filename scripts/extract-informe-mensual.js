// Extrae todos los datos de un local para el informe mensual.
// Uso: node scripts/extract-informe-mensual.js <local_id> <YYYY-MM>
// Salida: JSON por stdout (se guarda en informes/<periodo>/datos-<local>.json).
//
// Regla de comparativas (ver memoria del proyecto):
//   - Estacional (vistas, llamadas, cómo llegar, reservas) -> vs mismo mes del año anterior.
//   - Calidad (nota, % negativas, respuestas, menciones)   -> vs mes anterior.
//   - El conteo de reseñas NUNCA se compara contra el año anterior: el backfill
//     histórico de Google está incompleto y daría un número falso.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { supabaseAdmin } = require('../lib/supabase');
const { rendimiento } = require('../lib/gbp-performance');
const { menciones, textoOriginal } = require('../lib/menciones');
const menuAnalytics = require('../lib/menu-analytics');
const menu = require('../lib/menu');

const NOMBRES = {
  'luceros': 'Luceros', 'playa-san-juan': 'Playa San Juan', 'russafa': 'Russafa',
  'santa-clara': 'Santa Clara', 'benidorm': 'Benidorm',
};

const localId = process.argv[2];
const periodo = process.argv[3]; // '2026-07'
if (!NOMBRES[localId] || !/^\d{4}-\d{2}$/.test(periodo)) {
  console.error('Uso: node scripts/extract-informe-mensual.js <local_id> <YYYY-MM>');
  process.exit(1);
}

// --- rangos ---
function mesRango(p) {
  const [y, m] = p.split('-').map(Number);
  const ini = new Date(Date.UTC(y, m - 1, 1));
  const fin = new Date(Date.UTC(y, m, 1));
  return { ini: ini.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}
function mesAnterior(p) {
  const [y, m] = p.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
function mesAnoAnterior(p) { const [y, m] = p.split('-'); return `${Number(y) - 1}-${m}`; }
// último día real del mes (para las APIs que piden fecha inclusiva)
function ultimoDia(p) {
  const { fin } = mesRango(p);
  const d = new Date(fin + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const ACTUAL = periodo;
const PREVIO = mesAnterior(periodo);
const ANO_ANT = mesAnoAnterior(periodo);

// ---------- 1. Ficha de Google (estacional -> YoY) ----------
async function bloqueGoogle() {
  const pedir = async (p) => {
    try {
      return await rendimiento({
        local_id: localId, desde: mesRango(p).ini, hasta: ultimoDia(p),
      });
    } catch (e) { return { error: e.message }; }
  };
  const act = await pedir(ACTUAL);
  const ant = await pedir(ANO_ANT);
  // Sin base del año anterior (ficha nueva) el informe NO lleva comparativa.
  const hayBase = ant && !ant.error && Number(ant.vistas_perfil) > 0;

  // Google publica las búsquedas con más retraso que el resto de las métricas:
  // si el mes del informe todavía no está, se cae al último mes publicado y se
  // etiqueta cuál es (nunca se presenta como si fuera del mes del informe).
  let busquedas = act.busquedas || [];
  let busquedasMes = ACTUAL;
  if (!busquedas.length) {
    const prev = await pedir(PREVIO);
    if (prev && !prev.error && (prev.busquedas || []).length) {
      busquedas = prev.busquedas; busquedasMes = PREVIO;
    }
  }
  return { actual: act, ano_anterior: ant, hay_base_ano_anterior: hayBase, busquedas, busquedas_mes: busquedasMes };
}

// ---------- 2. Reseñas (calidad -> mes a mes) ----------
async function resenasDe(p) {
  const { ini, fin } = mesRango(p);
  const { data, error } = await supabaseAdmin.from('pp_resenas_google')
    .select('id, fecha_resena, estrellas, texto_original, cliente_nombre, respuesta_publicada, respuesta_elegida, respuesta_editada, estado, auto_estado')
    .eq('local_id', localId)
    .gte('fecha_resena', ini).lt('fecha_resena', fin)
    .order('fecha_resena', { ascending: true })
    .limit(5000); // ojo: PostgREST corta en 1000 por defecto
  if (error) throw error;
  return data || [];
}

function resumirResenas(filas) {
  const est = filas.map((r) => Number(r.estrellas)).filter((n) => n > 0);
  const total = est.length;
  const buenas = est.filter((n) => n >= 4).length;
  const malas = est.filter((n) => n <= 2).length;
  const media = total ? est.reduce((a, b) => a + b, 0) / total : null;
  const dist = {};
  est.forEach((n) => { dist[n] = (dist[n] || 0) + 1; });
  const conTexto = filas.filter((r) => String(r.texto_original || '').trim()).length;
  const respondidas = filas.filter((r) => r.respuesta_publicada).length;
  // por día de semana, para saber cuándo pedir reseñas
  const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const porDia = {};
  filas.forEach((r) => {
    const d = DOW[new Date(r.fecha_resena).getUTCDay()];
    porDia[d] = (porDia[d] || 0) + 1;
  });
  return {
    total, buenas, malas, conTexto, respondidas,
    media: media === null ? null : Math.round(media * 100) / 100,
    pct_buenas: total ? Math.round(buenas / total * 1000) / 10 : null,
    pct_malas: total ? Math.round(malas / total * 1000) / 10 : null,
    pct_respondidas: total ? Math.round(respondidas / total * 1000) / 10 : null,
    // proporción comparable aunque cambie el volumen (temporada alta vs baja)
    malas_por_100: total ? Math.round(malas / total * 100 * 10) / 10 : null,
    distribucion: dist,
    por_dia_semana: porDia,
  };
}

// Corta en el último espacio para no partir una palabra al medio.
function recortar(s, max) {
  if (s.length <= max) return s;
  const cortado = s.slice(0, max);
  const i = cortado.lastIndexOf(' ');
  return (i > max * 0.6 ? cortado.slice(0, i) : cortado).replace(/[,;.\s]+$/, '') + '…';
}

function negativasLiterales(filas) {
  return filas
    .filter((r) => Number(r.estrellas) <= 2 && String(r.texto_original || '').trim())
    .map((r) => ({
      fecha: String(r.fecha_resena).slice(0, 10),
      estrellas: Number(r.estrellas),
      autor: r.cliente_nombre || 'Anónimo',
      // textoOriginal() se queda con el idioma en que la escribió el cliente y
      // descarta el "(Translated by Google)" que duplica cada reseña.
      texto: recortar(textoOriginal(r.texto_original), 600),
      respondida: !!r.respuesta_publicada,
      respuesta: recortar(String(r.respuesta_editada || r.respuesta_elegida || '').replace(/\s+/g, ' ').trim(), 400),
    }));
}

// ---------- 3. Menciones al equipo (calidad -> mes a mes) ----------
async function bloqueMenciones(p) {
  try {
    const r = await menciones({ local_id: localId, desde: mesRango(p).ini, hasta: ultimoDia(p), frases: 3 });
    return {
      totales: r.totales,
      empleados: (r.empleados || []).map((e) => ({
        nombre: e.nombre, menciones: e.menciones, promedio: e.promedio,
        frase: (e.frases && e.frases[0]) ? e.frases[0].texto.slice(0, 220) : '',
      })),
    };
  } catch (e) { return { error: e.message }; }
}

// ---------- 4. Carta digital (mes a mes + proporciones) ----------
async function bloqueCarta(p) {
  const { ini, fin } = mesRango(p);
  try {
    const { data: restaurants } = await supabaseAdmin.from('restaurants').select('id, name');
    const ajaxId = await menu.getAjaxRestaurantId();
    const r = (restaurants || []).find((x) => x.name === NOMBRES[localId]);
    if (!r) return { error: 'restaurante no encontrado: ' + NOMBRES[localId] };
    const ctx = { access: { restaurantIds: (restaurants || []).map((x) => x.id) }, ajaxId };
    const s = await menuAnalytics.getSummary(ctx, {
      restaurant_id: r.id, range: 'custom',
      from: ini + 'T00:00:00.000Z', to: fin + 'T00:00:00.000Z',
    });
    return {
      visitas: (s.visits_by_day || []).reduce((a, d) => a + d.count, 0),
      unicos: s.funnel && s.funnel.scan,
      devices: s.devices,
      top_items: (s.top_items || []).slice(0, 6),
      top_searches: (s.top_searches || []).filter((x) => x.query.length >= 4).slice(0, 6),
      origen: s.origen && s.origen.counts,
    };
  } catch (e) { return { error: e.message }; }
}

// ---------- 5. Web de la marca ----------
async function bloqueWeb(p) {
  const { ini, fin } = mesRango(p);
  const TARGETS = {
    'playa-san-juan': ['34680445901', 'pizzeriapopular-playasanjuan'],
    'luceros': ['34659625152', 'pizzeriapopular-luceros'],
    'russafa': ['34696150393', 'pizzeriapopular'],
    'santa-clara': ['34608376490', 'pizzeriapopular-santaclara'],
    'benidorm': ['34680223458', 'pizzeriapopular-benidorm'],
  }[localId] || [];
  const { data, error } = await supabaseAdmin.from('ppweb_eventos')
    .select('tipo, target')
    .gte('created_at', ini + 'T00:00:00.000Z').lt('created_at', fin + 'T00:00:00.000Z')
    .in('target', TARGETS).limit(5000);
  if (error) return { error: error.message };
  const out = {};
  (data || []).forEach((e) => { out[e.tipo] = (out[e.tipo] || 0) + 1; });
  return out;
}

// ---------- main ----------
(async () => {
  const filasAct = await resenasDe(ACTUAL);
  const filasPre = await resenasDe(PREVIO);
  const out = {
    local_id: localId,
    local: NOMBRES[localId],
    periodo: ACTUAL,
    periodo_previo: PREVIO,
    periodo_ano_anterior: ANO_ANT,
    google: await bloqueGoogle(),
    resenas: {
      actual: resumirResenas(filasAct),
      previo: resumirResenas(filasPre),
      negativas: negativasLiterales(filasAct),
    },
    menciones: { actual: await bloqueMenciones(ACTUAL), previo: await bloqueMenciones(PREVIO) },
    carta: { actual: await bloqueCarta(ACTUAL), previo: await bloqueCarta(PREVIO) },
    web: await bloqueWeb(ACTUAL),
    generado: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
