// ============================================================
// lib/chat-stats.js — estadísticas y análisis del chat de Pepe.
// Registra cada turno (consulta + respuesta) en ppweb_chat_logs,
// calcula métricas y genera recomendaciones con IA.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('./supabase');

const client = new Anthropic();

// ---- Registro de un turno (fire-and-forget: nunca rompe el chat) ----
function logTurn(sessionId, userMsg, botReply) {
  supabaseAdmin.from('ppweb_chat_logs').insert({
    session_id: sessionId ? String(sessionId).slice(0, 80) : null,
    user_msg: String(userMsg || '').slice(0, 2000),
    bot_reply: botReply ? String(botReply).slice(0, 4000) : null,
  }).then(
    ({ error }) => { if (error) console.error('[ChatLog] Error:', error.message); },
    (e) => console.error('[ChatLog] Error:', e.message)
  );
}

// Normaliza una consulta para detectar repeticiones.
function normalize(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[¿?¡!.,;:"'()]/g, '')
    .replace(/\s+/g, ' ');
}

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

// ---- Métricas del chat ----
async function getStats() {
  const { count: total } = await supabaseAdmin
    .from('ppweb_chat_logs')
    .select('*', { count: 'exact', head: true });

  const { data: rows, error } = await supabaseAdmin
    .from('ppweb_chat_logs')
    .select('session_id,user_msg,bot_reply,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const logs = rows || [];

  // Conversaciones distintas (sobre los registros traídos)
  const sesiones = new Set();
  logs.forEach((l) => { if (l.session_id) sesiones.add(l.session_id); });

  // Por día — últimos 14 días
  const hoyKey = new Date().toISOString().slice(0, 10);
  const porDia = [];
  const byKey = {};
  for (let i = 13; i >= 0; i--) {
    const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const d = { fecha: k, label: k.slice(8, 10) + '/' + k.slice(5, 7), count: 0 };
    porDia.push(d);
    byKey[k] = d;
  }
  const hace7 = Date.now() - 7 * 86400000;
  let hoy = 0, ultimos7 = 0;
  logs.forEach((l) => {
    const k = dayKey(l.created_at);
    if (byKey[k]) byKey[k].count++;
    if (k === hoyKey) hoy++;
    if (new Date(l.created_at).getTime() >= hace7) ultimos7++;
  });

  // Consultas que más se repiten
  const grupos = {};
  logs.forEach((l) => {
    const n = normalize(l.user_msg);
    if (n.length < 3) return;
    if (!grupos[n]) grupos[n] = { texto: l.user_msg, count: 0 };
    grupos[n].count++;
  });
  const recurrentes = Object.values(grupos)
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    total: total || 0,
    conversaciones: sesiones.size,
    ultimos7,
    hoy,
    porDia,
    recurrentes,
    recientes: logs.slice(0, 40),
  };
}

const ANALYSIS_SYSTEM = `Sos un analista que ayuda al dueño de Pizzería Popular
(cadena de pizzerías argentinas en España) a entender qué le consultan los
visitantes a Pepe, el asistente virtual de la web.

Te paso la lista de consultas reales de los visitantes. Analizalas y devolvé
SOLO un objeto JSON válido (sin texto antes ni después, sin markdown) con esta forma:

{
  "resumen": "1-2 frases con la conclusión principal",
  "temas": [
    { "tema": "Nombre corto del tema", "cantidad": 12, "ejemplo": "una consulta tipo" }
  ],
  "recurrentes": ["pregunta que se repite mucho", "..."],
  "recomendaciones": [
    "Acción concreta y accionable para el negocio o la web, basada en los datos"
  ]
}

Reglas:
- "temas": ordenados de más a menos consultado, máximo 8. "cantidad" es tu estimación
  de cuántas consultas caen en ese tema.
- "recomendaciones": 3 a 6, concretas y útiles. Ej: "Muchos preguntan horarios →
  poné los horarios de cada local visibles en la web". Pensá en mejoras de la web,
  de la operación o de la info que falta.
- Todo en español rioplatense, claro y directo.
- Si hay pocas consultas, igual devolvé el JSON con lo que puedas.`;

// ---- Análisis IA — genera recomendaciones y lo guarda ----
async function analyze() {
  const { data: rows } = await supabaseAdmin
    .from('ppweb_chat_logs')
    .select('user_msg')
    .order('created_at', { ascending: false })
    .limit(400);
  const msgs = (rows || []).map((r) => r.user_msg).filter(Boolean);

  if (!msgs.length) {
    return { vacio: true };
  }

  const lista = msgs.map((m, i) => (i + 1) + '. ' + m).join('\n');
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2500,
    system: ANALYSIS_SYSTEM,
    messages: [{ role: 'user', content: 'Consultas de los visitantes:\n\n' + lista }],
  });

  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un análisis válido.');
  const insights = JSON.parse(m[0]);

  const { error } = await supabaseAdmin
    .from('ppweb_chat_insights').insert({ data: insights });
  if (error) console.error('[ChatStats] No se pudo guardar el análisis:', error.message);

  return { ...insights, generatedAt: new Date().toISOString() };
}

// ---- Último análisis guardado ----
async function getLatestInsight() {
  const { data } = await supabaseAdmin
    .from('ppweb_chat_insights')
    .select('data,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return Object.assign({}, data.data, { generatedAt: data.created_at });
}

module.exports = { logTurn, getStats, analyze, getLatestInsight };
