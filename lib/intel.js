// ============================================================
// lib/intel.js — Inteligencia de marketing.
// Junta los datos que el sistema ya recolecta (reseñas Google,
// chat de Pepe, blog, promos), arma el informe semanal con IA
// y lo manda por mail. Cada informe se guarda en ppweb_informes
// con sus métricas crudas, para comparar semana a semana.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const { supabaseAdmin } = require('./supabase');
const { loadRatings } = require('../google-places');
const { getStats, getLatestInsight } = require('./chat-stats');

const client = new Anthropic();
const MAIL_TO = 'pizzeriapopular@grupoajax.es';

// ---- Último informe guardado ----
async function getUltimoInforme() {
  const { data } = await supabaseAdmin
    .from('ppweb_informes')
    .select('id,data,enviado,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ---- Historial de informes ----
async function getInformes(limit = 12) {
  const { data, error } = await supabaseAdmin
    .from('ppweb_informes')
    .select('id,data,enviado,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

// ---- Datos en vivo para el tablero (sin IA) ----
async function getOverview() {
  const ratings = loadRatings();
  let pepe = null;
  let insight = null;
  try { pepe = await getStats(); } catch (e) { /* sin tabla todavía */ }
  try { insight = await getLatestInsight(); } catch (e) { /* idem */ }

  const { data: posts } = await supabaseAdmin
    .from('ppweb_posts')
    .select('titulo,idioma,estado,fecha,slug')
    .order('fecha', { ascending: false });
  const { data: promos } = await supabaseAdmin
    .from('ppweb_promos')
    .select('titulo,activa,idioma')
    .eq('idioma', 'es')
    .order('orden', { ascending: true });

  const blog = { publicados: 0, pendientes: 0, preparacion: 0, proximos: [] };
  (posts || []).forEach((p) => {
    if (p.estado === 'publicado') blog.publicados++;
    else if (p.estado === 'pendiente') { blog.pendientes++; blog.proximos.push(p); }
    else blog.preparacion++;
  });
  blog.proximos = blog.proximos.slice(0, 5);

  return {
    ratings: ratings ? {
      updatedAt: ratings.updatedAt,
      promedio: ratings.averageRating,
      total: ratings.totalReviews,
      locales: (ratings.locals || []).map((l) => ({
        slug: l.slug, name: l.name, city: l.city,
        rating: l.rating, reviews: l.reviews,
      })),
    } : null,
    pepe: pepe ? {
      personas: pepe.personas, personasHoy: pepe.personasHoy,
      personas7: pepe.personas7, mensajes: pepe.total,
    } : null,
    insight: insight ? { resumen: insight.resumen, generatedAt: insight.generatedAt } : null,
    blog,
    promosActivas: (promos || []).filter((p) => p.activa).map((p) => p.titulo),
    ultimoInforme: await getUltimoInforme(),
  };
}

const INFORME_SYSTEM = `Sos el analista de marketing de Pizzería Popular (cadena
argentina de pizza al horno de leña en España, 6 locales en Valencia, Alicante,
Madrid y Benidorm). Cada semana recibís los datos reales del negocio digital y
escribís el informe semanal para el dueño y el equipo de marketing de Grupo Ajax.

Devolvé SOLO un objeto JSON válido (sin texto antes ni después, sin markdown):

{
  "resumen": "2-3 frases con la foto de la semana, lo más importante primero",
  "reputacion": ["bullet sobre reseñas de Google: nivel, variaciones, locales a mirar"],
  "audiencia": ["bullet sobre Pepe: cuánta gente, qué preguntan, qué falta responder"],
  "contenido": ["bullet sobre blog y promos: qué hay activo, qué falta, qué publicar"],
  "acciones": ["3 a 6 acciones concretas y priorizadas para esta semana"]
}

Reglas:
- Usá SOLO los datos que te paso. Si un dato falta, no lo inventes.
- Las variaciones contra el informe anterior son lo más valioso: destacalas.
- Si no hay informe anterior, decilo: este informe es la línea base.
- Acciones concretas y chicas ("publicar el post X", "mirar las reseñas de Y"),
  nada genérico tipo "mejorar el SEO".
- Español rioplatense, directo, sin humo. Bullets de 1-2 líneas. Máximo 4 bullets
  por sección.`;

// Arma el bloque de texto con los datos reales que ve la IA.
function buildContext(ov, stats, insight, prevM, deltas) {
  const L = [];

  if (ov.ratings) {
    L.push('RESEÑAS GOOGLE (actualizado ' + ov.ratings.updatedAt + '):');
    L.push('- Promedio cadena: ' + ov.ratings.promedio + '★ · Total reseñas: ' + ov.ratings.total +
      (deltas && deltas.reviews != null ? ' (' + (deltas.reviews >= 0 ? '+' : '') + deltas.reviews + ' desde el informe anterior)' : ''));
    ov.ratings.locales.forEach((l) => {
      const d = deltas && deltas.porLocal && deltas.porLocal[l.slug] != null
        ? ' (' + (deltas.porLocal[l.slug] >= 0 ? '+' : '') + deltas.porLocal[l.slug] + ')' : '';
      L.push('- ' + l.name + ' (' + l.city + '): ' + l.rating + '★, ' + l.reviews + ' reseñas' + d);
    });
  } else {
    L.push('RESEÑAS GOOGLE: sin datos.');
  }

  L.push('');
  if (stats) {
    L.push('PEPE (chatbot de la web):');
    L.push('- Personas únicas: ' + stats.personas + ' total · ' + stats.personas7 + ' últimos 7 días · ' + stats.personasHoy + ' hoy');
    L.push('- Mensajes respondidos: ' + stats.total +
      (deltas && deltas.personas7 != null ? ' · Personas 7d en el informe anterior: ' + prevM.personas7 : ''));
    if (stats.recurrentes && stats.recurrentes.length) {
      L.push('- Lo que más preguntan: ' + stats.recurrentes.slice(0, 8)
        .map((r) => '«' + r.texto + '» ×' + r.count).join(' · '));
    }
  } else {
    L.push('PEPE: sin datos todavía.');
  }
  if (insight) {
    L.push('- Último análisis IA del chat (' + (insight.generatedAt || '') + '): ' + (insight.resumen || ''));
    if (insight.recomendaciones_web && insight.recomendaciones_web.length) {
      L.push('  Recos web pendientes: ' + insight.recomendaciones_web.join(' / '));
    }
    if (insight.recomendaciones_pepe && insight.recomendaciones_pepe.length) {
      L.push('  Recos para enseñar a Pepe: ' + insight.recomendaciones_pepe.join(' / '));
    }
  }

  L.push('');
  L.push('BLOG: ' + ov.blog.publicados + ' publicados · ' + ov.blog.pendientes +
    ' pendientes de publicar · ' + ov.blog.preparacion + ' en preparación');
  ov.blog.proximos.forEach((p) => {
    L.push('- Pendiente: «' + p.titulo + '» (' + p.idioma + (p.fecha ? ', sale ' + p.fecha : '') + ')');
  });

  L.push('');
  L.push('PROMOS ACTIVAS (es): ' + (ov.promosActivas.length ? ov.promosActivas.join(' · ') : 'ninguna'));

  if (ov.ultimoInforme && ov.ultimoInforme.data && ov.ultimoInforme.data.informe) {
    L.push('');
    L.push('RESUMEN DEL INFORME ANTERIOR (' + ov.ultimoInforme.created_at + '): ' +
      (ov.ultimoInforme.data.informe.resumen || ''));
  } else {
    L.push('');
    L.push('No hay informe anterior: este es el primero (línea base).');
  }

  return L.join('\n');
}

// ---- Genera el informe con IA y lo guarda ----
async function generarInforme() {
  const ov = await getOverview();
  let stats = null;
  let insight = null;
  try { stats = await getStats(); } catch (e) { /* sin datos */ }
  try { insight = await getLatestInsight(); } catch (e) { /* sin datos */ }

  // Métricas crudas de hoy (quedan guardadas para el delta de la próxima).
  const metricas = {
    promedio: ov.ratings ? ov.ratings.promedio : null,
    total: ov.ratings ? ov.ratings.total : null,
    reviewsPorLocal: {},
    personas7: stats ? stats.personas7 : null,
    mensajes: stats ? stats.total : null,
  };
  if (ov.ratings) ov.ratings.locales.forEach((l) => { metricas.reviewsPorLocal[l.slug] = l.reviews; });

  // Variaciones contra el informe anterior.
  const prevM = ov.ultimoInforme && ov.ultimoInforme.data ? ov.ultimoInforme.data.metricas : null;
  let deltas = null;
  if (prevM) {
    deltas = { reviews: null, personas7: null, porLocal: {} };
    if (metricas.total != null && prevM.total != null) deltas.reviews = metricas.total - prevM.total;
    if (metricas.personas7 != null && prevM.personas7 != null) deltas.personas7 = metricas.personas7 - prevM.personas7;
    Object.keys(metricas.reviewsPorLocal).forEach((slug) => {
      if (prevM.reviewsPorLocal && prevM.reviewsPorLocal[slug] != null) {
        deltas.porLocal[slug] = metricas.reviewsPorLocal[slug] - prevM.reviewsPorLocal[slug];
      }
    });
  }

  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 3000,
    system: INFORME_SYSTEM,
    messages: [{ role: 'user', content: 'Datos de la semana:\n\n' + buildContext(ov, stats, insight, prevM, deltas) }],
  });

  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un informe válido.');
  const informe = JSON.parse(m[0]);

  const { data, error } = await supabaseAdmin
    .from('ppweb_informes')
    .insert({ data: { informe, metricas, deltas } })
    .select('id,data,enviado,created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- Manda un informe por mail (y lo marca enviado) ----
async function emailInforme(row) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('[Intel] SMTP no configurado: informe generado pero sin enviar.');
    return false;
  }
  const inf = (row.data && row.data.informe) || {};
  const fecha = new Date(row.created_at).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'long', year: 'numeric' });

  const seccion = (titulo, arr) => (arr && arr.length)
    ? `<h3 style="color:#392E2C;margin:20px 0 8px;font-family:Arial,sans-serif;">${titulo}</h3>` +
      `<ul style="padding-left:20px;margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;">` +
      arr.map((x) => `<li style="margin-bottom:6px;">${escHtml(x)}</li>`).join('') + `</ul>`
    : '';

  const html = `
    <div style="max-width:640px;margin:0 auto;font-family:Arial,sans-serif;">
      <h2 style="color:#392E2C;border-bottom:3px solid #D8A460;padding-bottom:10px;">
        Informe semanal de Marketing — Pizzería Popular</h2>
      <p style="color:#777;font-size:13px;">Semana del ${escHtml(fecha)} · generado automáticamente por el panel de Inteligencia.</p>
      <p style="font-size:15px;line-height:1.6;color:#333;"><strong>${escHtml(inf.resumen || '')}</strong></p>
      ${seccion('⭐ Reputación', inf.reputacion)}
      ${seccion('💬 Audiencia (Pepe)', inf.audiencia)}
      ${seccion('📝 Contenido', inf.contenido)}
      ${seccion('✅ Acciones para esta semana', inf.acciones)}
      <p style="margin-top:24px;font-size:12px;color:#999;">
        Ver el panel completo: <a href="https://grupoajax.es/admin/" style="color:#D8A460;">grupoajax.es/admin</a></p>
    </div>`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Pizzería Popular · Inteligencia" <${process.env.SMTP_USER}>`,
    to: MAIL_TO,
    subject: `Informe semanal de Marketing — ${fecha}`,
    html,
  });
  await supabaseAdmin.from('ppweb_informes').update({ enviado: true }).eq('id', row.id);
  row.enviado = true;
  return true;
}

module.exports = { getOverview, getInformes, generarInforme, emailInforme };
