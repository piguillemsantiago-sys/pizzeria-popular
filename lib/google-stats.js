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

// Estado actual + tendencia para el panel. La valoración y el total son
// acumulativos (no por mes): se muestran "ahora mismo". La tendencia compara
// contra el snapshot de ~30 días atrás (si ya existe histórico).
async function getGoogleStats() {
  const data = loadRatings();
  if (!data) return { configurado: false };

  const locales = (data.locals || [])
    .map((l) => ({ slug: l.slug, name: l.name, city: l.city, rating: l.rating, reviews: l.reviews }))
    .sort((a, b) => b.reviews - a.reviews);
  const mejor = locales.slice().sort((a, b) => b.rating - a.rating)[0] || null;

  let nuevas30 = null;
  let promedioPrev = null;
  try {
    const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: snaps } = await supabaseAdmin
      .from(TABLE)
      .select('dia,total,promedio')
      .lte('dia', hace30)
      .order('dia', { ascending: false })
      .limit(1);
    if (snaps && snaps.length) {
      nuevas30 = data.totalReviews - snaps[0].total;
      promedioPrev = snaps[0].promedio;
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
    promedioPrev,
  };
}

module.exports = { snapshotGoogle, getGoogleStats };
