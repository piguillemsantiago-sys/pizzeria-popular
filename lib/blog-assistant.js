// ============================================================
// lib/blog-assistant.js — Asistente de IA para el blog.
// Genera posts completos (ES + EN) con la plantilla .article-*,
// usando las fotos que sube el usuario. Propone un plan; no
// ejecuta nada hasta que el usuario confirma (applyBlogPlan).
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('./supabase');

const client = new Anthropic();

const SYSTEM = `Sos el redactor del blog de Pizzería Popular, una cadena argentina de
pizzerías al horno de leña en España (locales en Valencia, Alicante, Benidorm y Madrid).

Tu trabajo: a partir de un tema, redactar un blog post COMPLETO y publicable, en
ESPAÑOL e INGLÉS, optimizado para SEO. Generás los dos idiomas con el MISMO slug.

TONO DE MARCA: cálido, familiar, argentino. Hablás de "vos". Cercano, emotivo pero
concreto. Guiños como "¡Hola mi vida! 🔥". Nada corporativo ni acartonado.

El cuerpo del post (campo "contenido") es HTML con estas clases — usá SOLO estas:
- <p class="lead">…</p>  → primer párrafo (lleva capital destacada). Uno solo.
- <p>…</p>  → párrafos normales. <strong>…</strong> para destacar.
- <h2 id="slug-de-seccion"><span class="h2-num">01 — Etiqueta</span>Título de la sección</h2>
  → secciones. El id es obligatorio (lo usa el índice). Numerá 01, 02, 03…
- <div class="pull-quote"><p>Frase impactante.</p><cite>— Atribución</cite></div>
- <ul><li>…</li></ul>  → listas.
- <figure class="article-figure"><img src="URL" alt="…" loading="lazy" /><figcaption>Texto</figcaption></figure>
- <div class="article-feature"><img src="URL" alt="…" loading="lazy" /><div class="article-feature-text"><h3>Título</h3><p>Bajada</p></div></div>
  → bloque de foto a pantalla completa (photo-essay).
- Galería (si hay 3+ fotos sobrantes):
  <div class="article-gallery-wrap"><p class="article-gallery-label">Galería</p><h2 class="article-gallery-title">Título</h2><div class="article-gallery"><figure><img src="URL" alt="…" loading="lazy" /></figure>…</div></div>

FOTOS: te paso las fotos disponibles con su URL y te las muestro. Usalas así:
- hero_image = la mejor foto, apaisada si hay.
- El resto: repartilas en bloques .article-feature, .article-figure y la galería,
  DENTRO del contenido. Escribí captions y alt reales según lo que ves en cada foto.
- Si no hay fotos, hacé un post más centrado en texto (sin figuras ni galería).

Estructura recomendada del contenido: párrafo lead + 3 a 6 secciones h2 + 1 o 2
pull-quotes + las fotos repartidas. Largo: 600-1000 palabras por idioma.

Herramientas: redactar_post (llamala DOS veces: una idioma "es", otra "en", mismo
slug), editar_post, borrar_post.

REGLAS:
- Si el tema está claro, redactá y llamá redactar_post para ES y EN.
- Si es ambiguo, NO llames herramientas: pedí la aclaración en texto.
- El slug: kebab-case, sin acentos ni eñes, con la keyword.
- Nunca afirmes que ya publicaste algo: las herramientas son una PROPUESTA que el
  usuario confirma. Los posts nacen en estado "preparación" (borrador).
- Acompañá las herramientas con una frase breve en español explicando qué hiciste.

EDICIÓN DE POSTS EXISTENTES (retoques):
- En el contexto de abajo tenés el CONTENIDO ACTUAL (HTML) de cada post. Usalo.
- Cuando el usuario pida un retoque (quitar/cambiar una frase, sumar una sección,
  agregar fotos, cambiar título/subtítulo, etc.), identificá el/los post por título
  o slug y llamá editar_post con el id correcto.
- Para cambios en el cuerpo: PARTÍ del contenido actual y devolvé en "contenido" el
  HTML COMPLETO ya modificado, conservando TODO lo que no se pidió cambiar y
  respetando las clases .article-*. No reescribas el post entero salvo que lo pidan.
- Para agregar fotos: insertá las URLs que te paso en bloques .article-figure,
  .article-feature o galería, DENTRO del contenido actual, con captions y alt reales.
- Si el cambio es de contenido y existe la versión en el otro idioma (mismo slug),
  aplicá el mismo cambio en AMBOS: una llamada editar_post por idioma.
- Si no estás seguro de a qué post se refiere, preguntá antes de tocar nada.`;

const POST_TOOLS = [
  {
    name: 'redactar_post',
    description: 'Redacta un blog post completo para UN idioma. Llamala dos veces ' +
      '(es y en) con el mismo slug para publicar en ambos idiomas.',
    input_schema: {
      type: 'object',
      properties: {
        idioma: { type: 'string', enum: ['es', 'en'] },
        slug: { type: 'string', description: 'kebab-case, sin acentos. Igual en ES y EN.' },
        titulo: { type: 'string' },
        subtitulo: { type: 'string', description: 'Bajada del hero.' },
        eyebrow: { type: 'string', description: 'Etiqueta corta sobre el título.' },
        meta_desc: { type: 'string', description: 'Meta description SEO, máx 155 caracteres.' },
        keyword: { type: 'string', description: 'Keyword objetivo.' },
        hero_image: { type: 'string', description: 'URL de la foto del hero.' },
        local: { type: 'string', description: 'Local al que corresponde el post, si aplica.' },
        contenido: { type: 'string', description: 'HTML del cuerpo con las clases .article-*' },
      },
      required: ['idioma', 'slug', 'titulo', 'contenido'],
    },
  },
  {
    name: 'editar_post',
    description: 'Edita un post existente. Solo cambian los campos provistos.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        titulo: { type: 'string' }, subtitulo: { type: 'string' },
        eyebrow: { type: 'string' }, meta_desc: { type: 'string' },
        keyword: { type: 'string' }, hero_image: { type: 'string' },
        local: { type: 'string' }, contenido: { type: 'string' },
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        estado: { type: 'string', enum: ['preparacion', 'pendiente', 'publicado'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'borrar_post',
    description: 'Borra un post.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
];

// history: [{role,content}]; userMessage: string; photos: [{url}]; posts: filas actuales.
async function interpretBlog(history, userMessage, photos, posts) {
  const ctx = posts.length
    ? 'POSTS EXISTENTES (con su contenido actual, para que puedas editarlos):\n\n' +
      posts.map((p) => [
        `id: ${p.id}`,
        `idioma: ${p.idioma} · estado: ${p.estado} · slug: ${p.slug}`,
        `titulo: ${p.titulo}`,
        p.subtitulo ? `subtitulo: ${p.subtitulo}` : null,
        p.eyebrow ? `eyebrow: ${p.eyebrow}` : null,
        p.hero_image ? `hero_image: ${p.hero_image}` : null,
        p.meta_desc ? `meta_desc: ${p.meta_desc}` : null,
        p.keyword ? `keyword: ${p.keyword}` : null,
        `contenido (HTML actual):\n${p.contenido || '(vacío)'}`,
        '----------',
      ].filter(Boolean).join('\n')).join('\n\n')
    : 'No hay posts todavía.';

  // Mensaje del usuario + las fotos como bloques de imagen (Claude las ve).
  const content = [];
  let texto = userMessage;
  if (photos && photos.length) {
    texto += '\n\nFotos disponibles (usá estas URLs exactas en el HTML):\n' +
      photos.map((p, i) => `Foto ${i + 1}: ${p.url}`).join('\n');
  }
  content.push({ type: 'text', text: texto });
  for (const p of photos || []) {
    content.push({ type: 'image', source: { type: 'url', url: p.url } });
  }

  const messages = [];
  for (const h of history || []) {
    if ((h.role === 'user' || h.role === 'assistant') && h.content) {
      messages.push({ role: h.role, content: String(h.content) });
    }
  }
  messages.push({ role: 'user', content });

  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ctx },
    ],
    tools: POST_TOOLS,
    messages,
  });

  let reply = '';
  const plan = [];
  for (const block of resp.content) {
    if (block.type === 'text') reply += block.text;
    else if (block.type === 'tool_use') plan.push({ accion: block.name, datos: block.input });
  }
  if (resp.stop_reason === 'max_tokens') {
    reply += '\n\n⚠ El post quedó muy largo y se cortó. Probá pedir un post más breve.';
  }
  return { reply: reply.trim(), plan };
}

const POST_FIELDS = ['slug', 'idioma', 'titulo', 'subtitulo', 'eyebrow', 'fecha',
  'hero_image', 'meta_desc', 'keyword', 'contenido', 'estado', 'local'];
function cleanPost(obj) {
  const out = {};
  for (const f of POST_FIELDS) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

// Ejecuta el plan confirmado. Solo toca ppweb_posts.
async function applyBlogPlan(plan) {
  const results = [];
  for (const item of plan) {
    const accion = item.accion;
    const datos = item.datos || {};
    if (accion === 'redactar_post') {
      const row = cleanPost(datos);
      row.estado = 'preparacion'; // los posts nacen como borrador
      if (!row.titulo || !row.slug) { results.push('✗ Falta título o slug.'); continue; }
      const { error } = await supabaseAdmin.from('ppweb_posts').insert(row);
      results.push(error
        ? '✗ Error al crear (' + row.idioma + '): ' + error.message
        : '✓ Post creado: "' + row.titulo + '" (' + row.idioma + ')');
    } else if (accion === 'editar_post') {
      if (!datos.id) { results.push('✗ Falta el id para editar.'); continue; }
      const row = cleanPost(datos);
      const { error } = await supabaseAdmin.from('ppweb_posts').update(row).eq('id', datos.id);
      results.push(error ? '✗ Error al editar: ' + error.message : '✓ Post editado');
    } else if (accion === 'borrar_post') {
      if (!datos.id) { results.push('✗ Falta el id para borrar.'); continue; }
      const { error } = await supabaseAdmin.from('ppweb_posts').delete().eq('id', datos.id);
      results.push(error ? '✗ Error al borrar: ' + error.message : '✓ Post borrado');
    } else {
      results.push('✗ Acción desconocida: ' + accion);
    }
  }
  return results;
}

module.exports = { interpretBlog, applyBlogPlan };
