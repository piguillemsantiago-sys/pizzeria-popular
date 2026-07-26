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
      // 404 = la reseña ya no existe en Google → no reintentar nunca más.
      // Cualquier otro error: desmarcar para que el próximo cron reintente.
      const marca = e.status === 404 ? 'borrada-en-google' : null;
      await supabaseAdmin.from(TABLE).update({ auto_estado: marca }).eq('id', row.id).then(() => {});
      errores++;
    }
  }

  writeState(state);
  const r = { procesadas: rows.length, auto, para_humano: paraHumano, errores };
  console.log('[Auto reseñas] ' + JSON.stringify(r));
  return r;
}

module.exports = { autoResponder };
