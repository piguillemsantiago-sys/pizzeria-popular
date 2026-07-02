// lib/google-stats.js — Métrica de reseñas de Google para el panel admin.
// Reusa los datos que ya recolecta google-places.js (rating + nº de reseñas
// por local) y agrega un histórico diario en Supabase para mostrar tendencia
// (reseñas nuevas, evolución de la valoración).

const { loadRatings } = require('../google-places');
const { supabaseAdmin } = require('./supabase');

const TABLE = 'ppweb_google_metrics';

// Guarda una foto del estado actual (una fila por día). No rompe si la tabla
// no existe todavía: el error se loguea y se sigue.
async function snapshotGoogle() {
  const data = loadRatings();
  if (!data) return null;
  const porLocal = {};
  (data.locals || []).forEach((l) => {
    porLocal[l.slug] = { rating: l.rating, reviews: l.reviews };
  });
  const row = {
    dia: new Date().toISOString().slice(0, 10),
    promedio: data.averageRating,
    total: data.totalReviews,
    por_local: porLocal,
  };
  const { error } = await supabaseAdmin.from(TABLE).upsert(row, { onConflict: 'dia' });
  if (error) throw new Error(error.message);
  return row;
}

// Estimación de cuántas reseñas 5★ faltan para subir 0,1★ el rating mostrado.
// Google redondea el promedio a 1 decimal y oculta el real, así que ESTO ES
// UNA ESTIMACIÓN (asume que el promedio real = el rating mostrado). El número
// exacto solo se puede con todas las reseñas (la API). Fórmula:
//   k = 0,05·N / (4,95 − rating)   → reseñas 5★ para cruzar al próximo décimo.
function faltanParaSubir(rating, reviews) {
  if (rating == null || reviews == null || rating >= 5) return { target: null, faltan: null };
  const target = Math.round((rating + 0.1) * 10) / 10;
  const k = Math.ceil((0.05 * reviews) / (4.95 - rating));
  return { target, faltan: k > 0 ? k : 1 };
}

// Último snapshot con fecha <= hoy−days (para medir reseñas nuevas en la ventana).
async function snapshotAntesDe(days) {
  const ref = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data: snaps } = await supabaseAdmin
    .from(TABLE)
    .select('dia,total,promedio,por_local')
    .lte('dia', ref)
    .order('dia', { ascending: false })
    .limit(1);
  return (snaps && snaps.length) ? snaps[0] : null;
}

// Suma a cada local cuántas reseñas nuevas tiene vs el snapshot dado.
function aplicarNuevasPorLocal(locales, porLocalAntes, key) {
  if (!porLocalAntes) return;
  locales.forEach((l) => {
    const antes = porLocalAntes[l.slug];
    if (antes && antes.reviews != null) l[key] = l.reviews - antes.reviews;
  });
}

// Estado actual + tendencia para el panel. La valoración y el total son
// acumulativos (no por mes): se muestran "ahora mismo". La tendencia compara
// contra los snapshots de ~7 y ~30 días atrás (si ya existe histórico).
async function getGoogleStats() {
  const data = loadRatings();
  if (!data) return { configurado: false };

  const locales = (data.locals || [])
    .map((l) => ({
      slug: l.slug, name: l.name, city: l.city, rating: l.rating, reviews: l.reviews,
      ...faltanParaSubir(l.rating, l.reviews),
    }))
    .sort((a, b) => b.reviews - a.reviews);
  const mejor = locales.slice().sort((a, b) => b.rating - a.rating)[0] || null;

  let nuevas30 = null;
  let nuevas7 = null;
  let promedioPrev = null;
  try {
    const snap30 = await snapshotAntesDe(30);
    if (snap30) {
      nuevas30 = data.totalReviews - snap30.total;
      promedioPrev = snap30.promedio;
      aplicarNuevasPorLocal(locales, snap30.por_local, 'nuevas30');
    }
    const snap7 = await snapshotAntesDe(7);
    if (snap7) {
      nuevas7 = data.totalReviews - snap7.total;
      aplicarNuevasPorLocal(locales, snap7.por_local, 'nuevas7');
    }
  } catch (e) {
    // Sin histórico todavía (tabla nueva): la tendencia queda en null.
  }

  return {
    configurado: true,
    updatedAt: data.updatedAt,
    promedio: data.averageRating,
    total: data.totalReviews,
    locales,
    mejor: mejor ? { name: mejor.name, rating: mejor.rating } : null,
    nuevas30,
    nuevas7,
    promedioPrev,
  };
}

module.exports = { snapshotGoogle, getGoogleStats, faltanParaSubir };
