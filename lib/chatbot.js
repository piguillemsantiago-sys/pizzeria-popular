// ============================================================
// lib/chatbot.js — Asistente público de la web (Claude API).
// Responde consultas de los visitantes sobre Pizzería Popular.
// Solo Q&A: no ejecuta acciones. Con rate limiting por IP.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const { loadRatings } = require('../google-places');
const { supabaseAdmin } = require('./supabase');
const { getAjaxRestaurantId, getEffectiveMenu } = require('./menu-effective');

const client = new Anthropic();

const SYSTEM = `Te llamás Pepe y sos el asistente virtual de la web de Pizzería Popular,
una cadena argentina de pizzerías al horno de leña en España. Atendés a los visitantes
del sitio. Si te preguntan cómo te llamás o quién sos, decí que sos Pepe.

TONO: cálido, argentino y cercano, como alguien del local que te atiende con
ganas. Hablás de "vos", con naturalidad y calidez genuina — nada robótico ni
acartonado. Mostrá entusiasmo real por la comida y el lugar. Un saludo
("¡Hola! 🔥" o "¡Hola, qué bueno verte por acá!") va SOLO en tu primer mensaje
del chat, nunca en cada respuesta. Sos Pepe, el asistente de la web: si te
preguntan, sé honesto, pero atendé con tanta calidez que se sienta una charla
con una persona del local, no un formulario.

EMOJIS: usá emojis en TODAS las respuestas para que sean visuales y claras,
sin abusar (1 o 2 por respuesta, los justos). Guía: 📍 direcciones, 📞 teléfonos,
🕒 horarios, 🍕 carta/comida, 🛵 delivery, 🎉 eventos, 👉 antes de un link.
NUNCA uses emojis de banderas (🇦🇷, 🇪🇸, etc.): en Windows se ven como letras
sueltas y quedan rotos. Para lo argentino o los partidos usá ⚽ o 🔥.

LOS 6 LOCALES (con teléfono y WhatsApp clicable):
- Russafa — C/ de Russafa 34, Valencia · 📞 +34 696 150 393 · WhatsApp: https://wa.me/34696150393
- Playa San Juan — Av. de Niza 9, Alicante · 📞 +34 680 445 901 · WhatsApp: https://wa.me/34680445901
- Luceros — Plaza de los Luceros 16, Alicante · 📞 +34 659 625 152 · WhatsApp: https://wa.me/34659625152
- Boadilla — Infante Don Luis, Boadilla del Monte (Madrid) · 📞 +34 696 366 068 · WhatsApp: https://wa.me/34696366068
- Benidorm — C. del Condestable Zaragoza 42, Benidorm (Alicante) · 📞 +34 680 223 458 · abierto de 9:00 a 23:00 · WhatsApp: https://wa.me/34680223458

Todos abren los 7 días. Más abajo, en la sección HORARIOS, tenés el horario real
de cada local (tomado de Google) — usalo para responder directo. Si un local no
aparece en esa sección, recién ahí derivá al teléfono. NUNCA inventes horarios.

LA CARTA: pizzas al horno de leña con masa de fermentación lenta, pastas frescas,
milanesas argentinas (la napolitana es la bandera), empanadas, wraps, ensaladas,
sándwiches y postres caseros (tiramisú, tarta de queso).
Más abajo, en la sección CARTA GENERAL, tenés los platos reales con ingredientes,
tamaños y precios — usala para responder directo qué hay, qué lleva un plato y
cuánto sale. IMPORTANTE: la carta puede variar un poco según el local; aclaralo
cuando des precios ("orientativo, lo exacto en la carta del local"). Si preguntan
si un plato puntual está en un local específico, decí que lo confirmen con ese
local. NUNCA inventes platos ni precios que no estén en la CARTA GENERAL.

DELIVERY: por Glovo y Uber Eats. Sugerí buscar "Pizzería Popular" + la ciudad en
esas apps, o usar el botón "Delivery" del sitio.

RESERVAS: se reservan desde la sección "Restaurantes" de la web, o llamando al
teléfono del local.

CONTACTO: pizzeriapopular@grupoajax.es · Instagram @pizzeriapopular.es

PROMOCIONES: si más abajo aparece una sección "PROMOCIONES VIGENTES", usala para
contarle al visitante la promo concreta que aplica a lo que pregunta (qué día,
qué incluye, condiciones), no solo el link. Cerrá igual con 👉 [Promociones](/promos/).
Si no hay promos listadas ahí, mandá solo el link. Las promos están en español:
traducí los detalles si el visitante escribe en inglés. NUNCA inventes una promo
que no esté listada.

LINKS DE LA WEB (dalos para resolver rápido, en formato [texto](ruta)):
- Reservar / ver locales: /restaurantes/   · EN: /en/restaurants/
- Carta / menú: /carta/                    · EN: /en/menu/
- Menú del día: /menu-diario/
- Promociones: /promos/                    · EN: /en/promos/
- Blog: /blog/                             · EN: /en/blog/
- Nosotros: /nosotros/                     · EN: /en/about-us/
- Franquicias: /franquicias/               · EN: /en/franchises/
- Contacto: /contacto/                     · EN: /en/contact/
- Inicio: /                                · EN: /en/home/

CÓMO USAR LOS LINKS:
- Siempre que un link resuelva la consulta, dalo. Es la forma más rápida de ayudar.
- Elegí el link en español o inglés según el idioma del visitante.
- Escribilo SIEMPRE en formato [texto corto](ruta), nunca pegues la URL cruda.
- Delivery no tiene link propio: nombrá Glovo y Uber Eats.

CÓMO RESPONDER SOBRE LOS LOCALES:
- Mostrá cada local así, corto y con emojis (el nombre en **negrita**):
  📍 **Nombre del local** — dirección
  📞 teléfono · 👉 [WhatsApp](https://wa.me/NUMERO)
- El WhatsApp va SIEMPRE clicable, en formato [WhatsApp](https://wa.me/NUMERO).
- Después de mostrar uno o más locales, ofrecé la sección de reservas:
  👉 [Restaurantes](/restaurantes/)
- Listar locales es la única excepción al límite de largo: podés usar una o dos
  líneas por local. Si hay varios posibles, listalos y preguntá cuál le sirve.

REGLAS — NATURAL, CÁLIDO Y AL GRANO:
- Sé conciso pero humano. Por defecto, de 1 a 3 frases. Podés estirarte un
  poco (hasta ~5 frases) cuando la consulta lo amerite o para sonar cálido,
  pero nunca te vayas por las ramas ni sueltes un texto largo.
- Respondé lo que preguntaron y, si suma, agregá UN detalle útil o simpático.
  No enumeres los 6 locales salvo que el visitante lo pida expresamente.
- Una idea principal por respuesta. Si hace falta más, ofrecé seguir
  ("¿te cuento más?").
- Variá tus arranques y tus cierres; no suenes a respuesta enlatada.
- IDIOMA — REGLA DURA: mirá el idioma del ÚLTIMO mensaje del visitante y
  respondé COMPLETO en ese idioma. Si escribe en inglés, respondés en inglés
  (aunque todo tu material esté en español: traducilo). Links en su idioma.
- Arrancá con la respuesta concreta. Cuando aplique, cerrá con UNA acción:
  un teléfono, un botón del sitio o una app de delivery.
- Si no tenés un dato (precio, alérgeno, disponibilidad de mesa), decilo con
  naturalidad y pasá el teléfono o email del local. NUNCA inventes datos.
- Si preguntan algo ajeno a Pizzería Popular, redirigí con amabilidad en una frase.

EJEMPLOS DE ESTILO (imitá el espíritu: claros, cálidos, con emoji y link — podés ser un toque más natural que estos):
P: "¿Tienen local en Madrid?"
R: "Sí 📍 Boadilla del Monte. Reservá acá 👉 [Restaurantes](/restaurantes/)"
P: "¿Qué tienen para comer?"
R: "🍕 Pizza al horno de leña, pastas, milanesas y más. Mirá la carta 👉 [Ver carta](/carta/)"
P: "¿Hay promos?"
R: "Sí 🔥 Mirá las promos vigentes 👉 [Promociones](/promos/)"
P: "Quiero festejar un cumpleaños"
R: "¡Buenísimo! 🎉 ¿En qué ciudad? Mientras, mirá los locales 👉 [Restaurantes](/restaurantes/)"
P: "¿Qué locales tienen en Alicante?"
R: "📍 **Playa San Juan** — Av. de Niza 9
📞 +34 680 445 901 · 👉 [WhatsApp](https://wa.me/34680445901)
📍 **Luceros** — Plaza de los Luceros 16
📞 +34 659 625 152 · 👉 [WhatsApp](https://wa.me/34659625152)
También está Benidorm. Reservá acá 👉 [Restaurantes](/restaurantes/)"`;

// Fecha actual en España, para que Pepe pueda razonar "hoy", "mañana",
// "este miércoles" y saber si una nota fechada del conocimiento sigue vigente.
function fechaBlock() {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Madrid',
  });
  const DIA = 24 * 60 * 60 * 1000;
  const hoy = fmt.format(new Date());
  const manana = fmt.format(new Date(Date.now() + DIA));
  const pasado = fmt.format(new Date(Date.now() + 2 * DIA));
  return '\n\nCALENDARIO (hora de España):\n- HOY es ' + hoy + '.\n- MAÑANA es ' +
    manana + '.\n- PASADO MAÑANA es ' + pasado + '.\n' +
    'Usá estas fechas para todo lo relativo al calendario y para saber si una ' +
    'excepción o nota con fecha sigue vigente o ya pasó. Para llamar "hoy", ' +
    '"mañana" o "pasado mañana" a una fecha, tiene que coincidir EXACTO con ' +
    'esta lista; si no coincide, nombrala por su día y número, sin palabra relativa.';
}

// ---- Rate limiting por IP (en memoria) ----
const rateMap = new Map();
const RATE_LIMIT = 30;                 // mensajes por ventana
const RATE_WINDOW = 15 * 60 * 1000;    // 15 minutos

function rateOk(ip) {
  const now = Date.now();
  if (rateMap.size > 5000) rateMap.clear(); // limpieza simple
  let r = rateMap.get(ip);
  if (!r || now > r.resetAt) {
    r = { count: 0, resetAt: now + RATE_WINDOW };
    rateMap.set(ip, r);
  }
  r.count += 1;
  return r.count <= RATE_LIMIT;
}

// Horarios reales de cada local, tomados de Google Places (cache 10 min).
let _horariosCache = { text: '', at: 0 };
function horariosBlock() {
  const now = Date.now();
  if (_horariosCache.text && now - _horariosCache.at < 10 * 60 * 1000) {
    return _horariosCache.text;
  }
  let text = '';
  try {
    const data = loadRatings();
    if (data && Array.isArray(data.locals)) {
      const blocks = [];
      for (const l of data.locals) {
        if (l.hours && l.hours.length) {
          blocks.push(l.name + ':\n  ' + l.hours.join('\n  '));
        }
      }
      if (blocks.length) {
        text = '\n\nHORARIOS DE CADA LOCAL (datos reales de Google, dáselos directo ' +
               'al visitante):\n' + blocks.join('\n');
      }
    }
  } catch (e) { /* sin datos: Pepe deriva al teléfono */ }
  _horariosCache = { text: text, at: now };
  return text;
}

// Base de conocimiento editable desde el panel ("Cerebro de Pepe").
// Datos y autorizaciones que el dueño carga para que Pepe los use. Cache 60 s.
let _kbCache = { text: '', at: 0 };
async function knowledgeBlock() {
  const now = Date.now();
  if (_kbCache.at && now - _kbCache.at < 60 * 1000) return _kbCache.text;
  let text = '';
  try {
    const { data } = await supabaseAdmin
      .from('ppweb_pepe_conocimiento')
      .select('contenido')
      .eq('activo', true)
      .order('created_at', { ascending: true })
      .limit(200);
    if (data && data.length) {
      text = '\n\nCONOCIMIENTO Y AUTORIZACIONES (lo cargó el dueño desde el panel: ' +
        'es info oficial, vigente y aprobada — podés usarla y afirmarla con ' +
        'seguridad. Si algo de acá precisa una indicación general anterior, ' +
        'prevalece esto):\n' + data.map((r) => '- ' + r.contenido).join('\n');
    }
  } catch (e) { /* sin base: Pepe usa solo lo de siempre */ }
  _kbCache = { text: text, at: now };
  return text;
}
// Invalida el cache para que un cambio del panel se refleje al toque.
function reloadKnowledge() { _kbCache = { text: '', at: 0 }; }

// Promociones vigentes, leídas de la misma base que la web (/promos/). Cache 60 s.
let _promosCache = { text: '', at: 0 };
async function promosBlock() {
  const now = Date.now();
  if (_promosCache.at && now - _promosCache.at < 60 * 1000) return _promosCache.text;
  let text = '';
  try {
    const { data } = await supabaseAdmin
      .from('ppweb_promos')
      .select('titulo,subtitulo,descripcion,condiciones,orden')
      .eq('activa', true)
      .eq('idioma', 'es')
      .order('orden', { ascending: true })
      .limit(30);
    if (data && data.length) {
      const lines = data.map((p) => {
        let s = '- ' + String(p.titulo || '').trim();
        if (p.subtitulo) s += ' (' + String(p.subtitulo).trim() + ')';
        if (p.descripcion) s += ': ' + String(p.descripcion).trim();
        if (p.condiciones) s += ' [Condiciones: ' + String(p.condiciones).trim() + ']';
        return s;
      });
      text = '\n\nPROMOCIONES VIGENTES (son las mismas publicadas en /promos/, están ' +
        'al día — contáselas directo al visitante cuando apliquen):\n' + lines.join('\n');
    }
  } catch (e) { /* sin promos: Pepe deriva a /promos/ */ }
  _promosCache = { text: text, at: now };
  return text;
}

// Carta general (menú maestro del sistema de menú digital). Es la referencia
// que Pepe usa para responder sabores, tamaños y precios orientativos.
// Cache 10 min: la carta cambia poco y es la fuente más pesada del prompt.
const euro = (n) => String(Number(n).toFixed(2)).replace('.', ',') + '€';
function txt(v) { // name/description/variant vienen como JSON multi-idioma o string
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  return String(v.es || v.en || Object.values(v)[0] || '').trim();
}
let _cartaCache = { text: '', at: 0 };
async function cartaBlock() {
  const now = Date.now();
  if (_cartaCache.at && now - _cartaCache.at < 10 * 60 * 1000) return _cartaCache.text;
  let text = '';
  try {
    const ajaxId = await getAjaxRestaurantId();
    if (ajaxId) {
      const menu = await getEffectiveMenu(ajaxId);
      const bloques = [];
      for (const cat of menu.categories || []) {
        const nombreCat = txt(cat.name).toUpperCase();
        const esBebida = /BEBIDA|VINO/i.test(nombreCat);
        const lineas = [];
        for (const sub of cat.subcategories || []) {
          for (const it of sub.items || []) {
            let s = txt(it.name);
            const desc = esBebida ? '' : txt(it.description).slice(0, 90);
            if (desc) s += ' (' + desc + ')';
            const precios = (it.prices || [])
              .map((p) => {
                const v = txt(p.variant_name);
                return v ? v + ' ' + euro(p.price) : euro(p.price);
              })
              .filter(Boolean);
            if (precios.length) s += ': ' + precios.join(' / ');
            lineas.push(s);
          }
        }
        if (lineas.length) bloques.push(nombreCat + ':\n' + lineas.join(' · '));
      }
      if (bloques.length) {
        text = '\n\nCARTA GENERAL (los platos y precios de referencia de nuestra carta ' +
          'digital — usala para responder qué platos hay, qué llevan, tamaños y precios. ' +
          'Aclarando siempre que los precios son orientativos y que la carta puede variar ' +
          'un poco según el local; lo exacto está en 👉 [Ver carta](/carta/) o en la carta ' +
          'digital del local):\n' + bloques.join('\n');
      }
    }
  } catch (e) { /* sin carta: Pepe usa la descripción general y deriva a /carta/ */ }
  _cartaCache = { text: text, at: now };
  return text;
}

// Quita etiquetas HTML para sacar un extracto legible del cuerpo del post.
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Posts publicados del blog (los mismos de /blog/). Cache 60 s. Solo estado
// 'publicado': Pepe nunca ve borradores. Le da título, link por idioma y un
// extracto, para que recomiende la nota y responda lo básico con el link.
let _blogCache = { text: '', at: 0 };
async function blogBlock() {
  const now = Date.now();
  if (_blogCache.at && now - _blogCache.at < 60 * 1000) return _blogCache.text;
  let text = '';
  try {
    const { data } = await supabaseAdmin
      .from('ppweb_posts')
      .select('titulo,idioma,slug,subtitulo,meta_desc,contenido,fecha')
      .eq('estado', 'publicado')
      .order('fecha', { ascending: false })
      .limit(20);
    if (data && data.length) {
      const lines = data.map((p) => {
        const url = p.idioma === 'en' ? '/en/blog/' + p.slug + '/' : '/blog/' + p.slug + '/';
        const resumen = String(p.subtitulo || p.meta_desc || '').trim();
        const cuerpo = stripHtml(p.contenido).slice(0, 400);
        let s = '- [' + p.idioma + '] «' + String(p.titulo).trim() + '» — link: ' + url;
        if (resumen) s += ' — ' + resumen;
        if (cuerpo) s += ' — Extracto: ' + cuerpo + '…';
        return s;
      });
      text = '\n\nBLOG (notas publicadas en /blog/ · EN /en/blog/). SÍ podés hablar del ' +
        'blog y recomendar un post: contá brevemente de qué trata y pasá el link del ' +
        'post en el idioma del visitante con 👉 [Título](link). Si te preguntan algo ' +
        'que una nota cubre, respondé con lo del extracto y ofrecé el link para leerla ' +
        'completa. Si no hay nota sobre el tema, decilo y ofrecé 👉 [Blog](/blog/). ' +
        'NUNCA inventes una nota que no esté en esta lista:\n' + lines.join('\n');
    }
  } catch (e) { /* sin posts: Pepe usa solo el link general /blog/ */ }
  _blogCache = { text: text, at: now };
  return text;
}

// Responde una consulta del visitante.
async function chat(message, history) {
  const messages = [];
  for (const h of (history || []).slice(-10)) {
    if ((h.role === 'user' || h.role === 'assistant') && h.content) {
      messages.push({ role: h.role, content: String(h.content).slice(0, 800) });
    }
  }
  messages.push({ role: 'user', content: String(message).slice(0, 500) });

  const kb = await knowledgeBlock();
  const promos = await promosBlock();
  const carta = await cartaBlock();
  const blog = await blogBlock();
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 480,
    system: [{ type: 'text', text: SYSTEM + fechaBlock() + kb + promos + carta + blog + horariosBlock(), cache_control: { type: 'ephemeral' } }],
    messages,
  });

  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  // Red de seguridad: sacar emojis de bandera (en Windows se ven como letras sueltas).
  text = text.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/ +([.,;!?)])/g, '$1').replace(/  +/g, ' ');
  return text.trim() || 'Perdoná, no pude responder eso. Probá de otra forma.';
}

module.exports = { chat, rateOk, reloadKnowledge };
