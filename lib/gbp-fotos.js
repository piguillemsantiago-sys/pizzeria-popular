// ============================================================
// lib/gbp-fotos.js — Fotos frescas en las fichas de Google.
// Google premia la recencia: un cron semanal sube UNA foto por local,
// rotando el banco de fotos reales ya hosteadas en la web (las mismas
// verificadas del pool de Novedades). Estado de rotación por local en
// gbp-fotos-state.json (solo VPS). Boadilla queda fuera.
// ============================================================
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./google-oauth');
const gbp = require('./gbp');

const STATE_FILE = path.join(__dirname, '..', 'gbp-fotos-state.json');
const BASE = 'https://grupoajax.es';
const LOCALES = ['luceros', 'playa-san-juan', 'russafa', 'santa-clara', 'benidorm'];

// category = categoría de foto de la GBP API (FOOD_AND_DRINK, AT_WORK, INTERIOR…)
const POOL_GENERICO = [
  { url: BASE + '/images/extracted/producto-pizza-argentina.jpg', category: 'FOOD_AND_DRINK' },
  { url: BASE + '/images/extracted/producto-milanesa.jpg', category: 'FOOD_AND_DRINK' },
  { url: BASE + '/images/bg-carta.jpg', category: 'AT_WORK' },
  { url: BASE + '/images/extracted/producto-milanesa-ternera.jpg', category: 'FOOD_AND_DRINK' },
  { url: BASE + '/images/bg-promos.jpg', category: 'FOOD_AND_DRINK' },
  { url: BASE + '/images/blog/cta-horno.jpg', category: 'FOOD_AND_DRINK' },
];
const POOL_LOCAL = {
  benidorm: [
    { url: BASE + '/images/blog/benidorm/benidorm-interior-1.jpg', category: 'INTERIOR' },
    { url: BASE + '/images/blog/benidorm/benidorm-hero.jpg', category: 'ADDITIONAL' },
  ],
};

function poolDe(slug) { return [...(POOL_LOCAL[slug] || []), ...POOL_GENERICO]; }

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch (_) { return {}; }
}

// Sube la próxima foto del pool a cada local mapeado. Una por local.
async function subirSemana() {
  const m = gbp.loadLocations();
  if (!m || !m.locales) throw new Error('Locales sin mapear');
  const token = await getAccessToken();
  const state = readState();
  const resultados = [];

  for (const slug of LOCALES) {
    const loc = m.locales[slug];
    if (!loc) continue;
    const pool = poolDe(slug);
    const idx = state[slug] || 0;
    const foto = pool[idx % pool.length];
    try {
      const r = await fetch('https://mybusiness.googleapis.com/v4/' + loc.v4 + '/media', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaFormat: 'PHOTO',
          locationAssociation: { category: foto.category },
          sourceUrl: foto.url,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d.error && d.error.message) || 'HTTP ' + r.status);
      state[slug] = idx + 1;
      resultados.push({ local: slug, foto: foto.url.split('/').pop(), ok: true });
    } catch (e) {
      console.error('[GBP Fotos] ' + slug + ':', e.message);
      resultados.push({ local: slug, error: e.message });
    }
  }

  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) { console.error('[GBP Fotos] state:', e.message); }
  const ok = resultados.filter((r) => r.ok).length;
  console.log('[GBP Fotos] ' + ok + '/' + LOCALES.length + ' fotos subidas.');
  return resultados;
}

module.exports = { subirSemana };
