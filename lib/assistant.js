// ============================================================
// lib/assistant.js — Asistente de IA del panel (Claude API).
// Interpreta instrucciones en lenguaje natural sobre las
// promociones y propone un plan de acciones. NO ejecuta nada
// hasta que el usuario confirma (applyPlan).
// La IA solo puede usar las 4 herramientas de promos: no toca
// código ni otras tablas.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('./supabase');

const client = new Anthropic(); // ANTHROPIC_API_KEY desde el entorno

const SYSTEM = `Sos el asistente del panel de administración de la web de Pizzería Popular
(cadena argentina de pizzerías en España). Tu única función es ayudar a gestionar las
PROMOCIONES del sitio interpretando instrucciones en lenguaje natural.

Cada promoción tiene estos campos:
- titulo: nombre de la promo (ej. "2×1 en Pizzas").
- subtitulo: bajada corta (ej. "Todos los lunes").
- descripcion: texto explicativo.
- condiciones: la letra chica.
- badge: etiqueta corta sobre la card (ej. "Promo"). Vacío = sin badge.
- imagen_url: ruta o URL de la imagen de fondo.
- boton_texto: texto del botón.
- boton_accion: "reservar" (botón que abre el modal de reservas), "menus" (botón
  "Ver menús") o "ninguno" (sin botón).
- idioma: "es" (se ve en /promos/) o "en" (se ve en /en/promos/).
- activa: true = visible en la web, false = oculta.

Herramientas disponibles: crear_promo, editar_promo, borrar_promo, reordenar_promos.

Reglas:
- Si la instrucción es CLARA, llamá las herramientas necesarias para cumplirla.
- Si es AMBIGUA (ej. "borrá la promo" cuando hay varias), NO llames herramientas:
  respondé con texto pidiendo la aclaración puntual.
- Para crear: si no se especifica, usá boton_accion "reservar", boton_texto
  "Reservar mesa", activa true, idioma "es".
- Para editar o borrar necesitás el id exacto de la promo (te lo paso en el contexto).
- Nunca afirmes que ya hiciste un cambio: las herramientas son una PROPUESTA que el
  usuario va a confirmar después.
- Respondé siempre en español rioplatense, breve y claro. Acompañá las herramientas
  con una frase explicando qué entendiste.`;

const PROMO_TOOLS = [
  {
    name: 'crear_promo',
    description: 'Crea una promoción nueva.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        subtitulo: { type: 'string' },
        descripcion: { type: 'string' },
        condiciones: { type: 'string' },
        badge: { type: 'string' },
        imagen_url: { type: 'string' },
        boton_texto: { type: 'string' },
        boton_accion: { type: 'string', enum: ['reservar', 'menus', 'ninguno'] },
        idioma: { type: 'string', enum: ['es', 'en'] },
        activa: { type: 'boolean' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'editar_promo',
    description: 'Edita una promo existente. Solo cambian los campos provistos.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la promo a editar' },
        titulo: { type: 'string' },
        subtitulo: { type: 'string' },
        descripcion: { type: 'string' },
        condiciones: { type: 'string' },
        badge: { type: 'string' },
        imagen_url: { type: 'string' },
        boton_texto: { type: 'string' },
        boton_accion: { type: 'string', enum: ['reservar', 'menus', 'ninguno'] },
        idioma: { type: 'string', enum: ['es', 'en'] },
        activa: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'borrar_promo',
    description: 'Borra una promoción.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'ID de la promo a borrar' } },
      required: ['id'],
    },
  },
  {
    name: 'reordenar_promos',
    description: 'Reordena las promos. Recibe TODOS los ids en el orden deseado.',
    input_schema: {
      type: 'object',
      properties: {
        ids_ordenados: { type: 'array', items: { type: 'string' } },
      },
      required: ['ids_ordenados'],
    },
  },
];

// Interpreta el mensaje del usuario. Devuelve { reply, plan }.
// plan = lista de { accion, datos } — propuesta, sin ejecutar.
async function interpret(history, userMessage, promos) {
  const ctx = promos.length
    ? 'Promociones actuales:\n' + promos.map((p) =>
        `- id ${p.id} — "${p.titulo}" — subtítulo: ${p.subtitulo || '(vacío)'} — ` +
        `idioma ${p.idioma} — ${p.activa ? 'activa' : 'oculta'} — orden ${p.orden}`
      ).join('\n')
    : 'No hay promociones cargadas todavía.';

  const messages = [];
  for (const h of history || []) {
    if ((h.role === 'user' || h.role === 'assistant') && h.content) {
      messages.push({ role: h.role, content: String(h.content) });
    }
  }
  messages.push({ role: 'user', content: userMessage });

  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 6000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ctx },
    ],
    tools: PROMO_TOOLS,
    messages,
  });

  let reply = '';
  const plan = [];
  for (const block of resp.content) {
    if (block.type === 'text') reply += block.text;
    else if (block.type === 'tool_use') plan.push({ accion: block.name, datos: block.input });
  }
  return { reply: reply.trim(), plan };
}

// Campos que se pueden escribir — whitelist; nada fuera de esto llega a la base.
const PROMO_FIELDS = ['titulo', 'subtitulo', 'descripcion', 'condiciones', 'badge',
  'imagen_url', 'boton_texto', 'boton_accion', 'activa', 'idioma', 'orden'];
function cleanFields(obj) {
  const out = {};
  for (const f of PROMO_FIELDS) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

// Ejecuta el plan confirmado contra la base. Solo toca ppweb_promos.
async function applyPlan(plan) {
  const results = [];
  for (const item of plan) {
    const accion = item.accion;
    const datos = item.datos || {};
    if (accion === 'crear_promo') {
      const row = cleanFields(datos);
      if (!row.titulo) { results.push('✗ Falta el título de una promo nueva.'); continue; }
      const { error } = await supabaseAdmin.from('ppweb_promos').insert(row);
      results.push(error ? '✗ Error al crear: ' + error.message : '✓ Creada: ' + row.titulo);
    } else if (accion === 'editar_promo') {
      if (!datos.id) { results.push('✗ Falta el id para editar.'); continue; }
      const row = cleanFields(datos);
      const { error } = await supabaseAdmin.from('ppweb_promos').update(row).eq('id', datos.id);
      results.push(error ? '✗ Error al editar: ' + error.message : '✓ Editada');
    } else if (accion === 'borrar_promo') {
      if (!datos.id) { results.push('✗ Falta el id para borrar.'); continue; }
      const { error } = await supabaseAdmin.from('ppweb_promos').delete().eq('id', datos.id);
      results.push(error ? '✗ Error al borrar: ' + error.message : '✓ Borrada');
    } else if (accion === 'reordenar_promos') {
      const ids = Array.isArray(datos.ids_ordenados) ? datos.ids_ordenados : [];
      let ok = true;
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabaseAdmin.from('ppweb_promos')
          .update({ orden: i + 1 }).eq('id', ids[i]);
        if (error) ok = false;
      }
      results.push(ok ? '✓ Promos reordenadas' : '✗ Error al reordenar');
    } else {
      results.push('✗ Acción desconocida: ' + accion);
    }
  }
  return results;
}

module.exports = { interpret, applyPlan };
