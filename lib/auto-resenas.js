// ============================================================
// lib/auto-resenas.js — Auto-responder de reseñas 4-5★.
// Plantillas fijas del dueño que rotan 1→2→3→1. Regla del dueño (26/07):
// si la reseña menciona algo malo o a mejorar, NO se responde sola — queda
// pendiente para respuesta humana. Eso lo decide un clasificador haiku;
// ante cualquier duda o error, la deja para el humano (conservador).
// Las de ≤3★ nunca se tocan. Estado por fila en auto_estado:
//   null = sin procesar · 'auto' = respondida con plantilla ·
//   'para-humano' = tiene algo que leer, la responde una persona.
// ============================================================
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('./supabase');
const gbp = require('./gbp');

const TABLE = 'pp_resenas_google';
const MODELO = 'claude-haiku-4-5-20251001';
const STATE_FILE = path.join(__dirname, '..', 'gbp-auto-state.json');

// Plantillas EXACTAS del dueño (26/07/2026). Rotan una vez cada una.
const PLANTILLAS = [
  (n) => (n ? `Hola ${n} gracias por tu aporte ♥️` : 'Hola, gracias por tu aporte ♥️'),
  (n) => (n ? `Hola ${n} gracias por tu feedback, esperamos verte pronto ♥️` : 'Hola, gracias por tu feedback, esperamos verte pronto ♥️'),
  (n) => (n ? `Hola ${n} gracias por tu mensaje ♥️` : 'Hola, gracias por tu mensaje ♥️'),
];

function primerNombre(displayName) {
  const n = String(displayName || '').trim().split(/\s+/)[0];
  if (!n) return null;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch (_) { return { idx: 0 }; }
}
function writeState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e) { console.error('[Auto reseñas] state:', e.message); }
}

// ¿La reseña menciona algo negativo o a mejorar? → la responde un humano.
async function esParaHumano(texto) {
  if (!texto || !texto.trim()) return false; // solo estrellas → plantilla
  if (!process.env.ANTHROPIC_API_KEY) return true;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 60,
        system: 'Clasificás reseñas de una pizzería. Respondé SOLO JSON: {"mejorable":true|false}. ' +
          'mejorable=true si la reseña menciona CUALQUIER queja, problema, crítica, decepción o sugerencia de mejora ' +
          '(aunque el tono general sea positivo: "todo rico pero tardó" → true). ' +
          'mejorable=false solo si es 100% elogio o neutra.',
        messages: [{ role: 'user', content: 'Reseña: """' + texto.slice(0, 1500) + '"""' }],
      }),
    });
    const body = await r.json();
    if (body.error) return true;
    const t = (body.content || []).map((c) => c.text).join('');
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return true;
    return JSON.parse(m[0]).mejorable !== false;
  } catch (_) {
    return true; // ante la duda, humano
  }
}

// Procesa un lote de pendientes 4-5★ sin clasificar. Devuelve conteos.
async function autoResponder({ limit = 30 } = {}) {
  const { data: rows, error } = await supabaseAdmin.from(TABLE)
    .select('id, estrellas, cliente_nombre, texto_original')
    .eq('origen', 'google').eq('estado', 'pendiente')
    .gte('estrellas', 4).not('google_review_id', 'is', null)
    .is('auto_estado', null)
    .order('fecha_resena', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!rows || !rows.length) return { procesadas: 0, auto: 0, para_humano: 0, errores: 0 };

  const state = readState();
  let auto = 0, paraHumano = 0, errores = 0;

  for (const row of rows) {
    try {
      if (await esParaHumano(row.texto_original)) {
        const { error: e1 } = await supabaseAdmin.from(TABLE)
          .update({ auto_estado: 'para-humano' }).eq('id', row.id);
        if (e1) throw new Error(e1.message);
        paraHumano++;
        continue;
      }
      const texto = PLANTILLAS[state.idx % PLANTILLAS.length](primerNombre(row.cliente_nombre));
      const { error: e2 } = await supabaseAdmin.from(TABLE)
        .update({ respuesta_elegida: texto, modelo_usado: 'plantilla-auto', auto_estado: 'auto' })
        .eq('id', row.id);
      if (e2) throw new Error(e2.message);
      await gbp.publicar(row.id); // PUT del reply en Google + estado 'respondida'
      state.idx = (state.idx + 1) % PLANTILLAS.length;
      auto++;
    } catch (e) {
      console.error('[Auto reseñas] ' + row.id + ':', e.message);
      // 404 = la reseña ya no existe en Google → descartarla (fuera de pendientes).
      // Cualquier otro error: desmarcar para que el próximo cron reintente.
      const patch = e.status === 404
        ? { auto_estado: 'borrada-en-google', estado: 'descartada' }
        : { auto_estado: null };
      await supabaseAdmin.from(TABLE).update(patch).eq('id', row.id).then(() => {});
      errores++;
    }
  }

  writeState(state);
  const r = { procesadas: rows.length, auto, para_humano: paraHumano, errores };
  console.log('[Auto reseñas] ' + JSON.stringify(r));
  return r;
}

// Pre-redacta la respuesta de las pendientes que va a responder un humano
// (≤3★ y las 4-5★ marcadas para-humano): genera las 3 variantes con Claude
// y deja la primera como borrador en respuesta_elegida. El panel las muestra
// inline → el dueño lee, retoca si quiere y publica con UN click.
async function prepararBorradores({ limit = 10 } = {}) {
  const resenas = require('./google-reviews');
  const { data: rows, error } = await supabaseAdmin.from(TABLE)
    .select('id, local_id, estrellas, cliente_nombre, texto_original')
    .eq('origen', 'google').eq('estado', 'pendiente')
    .is('respuesta_elegida', null)
    .not('google_review_id', 'is', null)
    .or('estrellas.lte.3,auto_estado.eq.para-humano')
    .order('fecha_resena', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!rows || !rows.length) return { borradores: 0 };

  let ok = 0;
  for (const row of rows) {
    try {
      const g = await resenas.generar({
        local_id: row.local_id,
        estrellas: row.estrellas,
        cliente_nombre: row.cliente_nombre,
        texto: (row.texto_original && row.texto_original.trim())
          ? row.texto_original
          : '(reseña sin texto, solo ' + row.estrellas + ' estrellas)',
      });
      const { error: e1 } = await supabaseAdmin.from(TABLE).update({
        respuesta_elegida: g.variantes[0],
        variantes_generadas: g.variantes,
        idioma_detectado: g.idioma_detectado,
        modelo_usado: g.modelo_usado,
      }).eq('id', row.id);
      if (e1) throw new Error(e1.message);
      ok++;
    } catch (e) {
      console.error('[Borradores] ' + row.id + ':', e.message);
    }
  }
  if (ok) console.log('[Borradores] ' + ok + ' respuestas pre-redactadas.');
  return { borradores: ok };
}

module.exports = { autoResponder, prepararBorradores };
