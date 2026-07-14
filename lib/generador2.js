// ============================================================================
// GENERADOR DE HISTORIAS v2 — reconstruido desde cero con el dueño (14 jul 2026)
//
// Filosofía acordada: el dueño da la INFORMACIÓN (una idea, o textos literales);
// el sistema pone el DISEÑO y el CRITERIO de marca. Nada más que configurar.
//
// Pipeline (la receta que produjo las placas modelo de generador-nuevo-tipos/):
//   1. DIRECTOR (Claude Opus): reescribe el PROMPT CANON del tipo elegido con
//      los contenidos del pedido. El canon es ley: estructura validada a mano.
//   2. PINTOR (Gemini PRO): pinta la historia 9:16 completa.
//   3. CONTROL (Claude vision): textos letra por letra, nada inventado, franja
//      del logo despejada. Si falla → 1 reintento con el error como feedback.
//   4. LOGO REAL por código (sharp). La IA JAMÁS dibuja el logo.
//
// Retoques: edición quirúrgica — Gemini edita la imagen existente (solo el
// cambio pedido) y la franja del logo se trasplanta intacta de la versión
// anterior. Cambiar escena/foto = generación nueva, no retoque.
//
// Reglas de criterio del dueño (14/7):
//   - Partido ≠ Celebración: cada evento habla su lenguaje visual.
//   - Variedad: dos historias seguidas del mismo tipo no repiten escena/paleta.
//   - En modo "textual", sus textos salen EXACTOS, letra por letra.
// ============================================================================
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const path = require('path');
const { supabaseAdmin } = require('./supabase');

const { materializarFoto } = require('./generador');

const client = new Anthropic({ timeout: 120000, maxRetries: 1 });
const DIRECTOR_MODEL = () => process.env.CLAUDE_COPY_MODEL || 'claude-opus-4-8';
const PINTOR_MODEL = () => process.env.GEMINI_PLACA_MODEL || process.env.GEMINI_PORTADA_MODEL || 'gemini-3-pro-image-preview';
const LOGOS_DIR = path.join(__dirname, '..', 'public', 'images', 'logos');

// ---- Canon por tipo: los prompts EXACTOS que produjeron las placas modelo ----
// El director solo reemplaza contenidos (textos entre comillas, plato, escena,
// color de equipo). La estructura, jerarquía y reglas no se tocan.
const CANON = {
  informativo: 'Diseño de placa vertical para historia de Instagram de una pizzería argentina de horno de leña. Placa TIPOGRÁFICA elegante y sobria: el texto es el único protagonista. Fondo negro con textura sutil de madera oscura y un leve resplandor ámbar cálido que entra desde una esquina inferior, sin comida ni personas. Composición centrada con jerarquía editorial: kicker chico en mayúsculas doradas espaciadas "AVISO A NUESTROS CLIENTES"; debajo el título grande en serif editorial blanca en dos líneas "Problemas con Uber Eats"; debajo una línea fina dorada de separación; debajo en sans blanca, dos líneas de texto legible "El inconveniente es del servicio de Uber Eats y nos excede." y "Estamos encima para que se resuelva lo antes posible."; y cerrando abajo, en caligrafía manuscrita dorada inclinada, "gracias por la paciencia". Aire generoso, margen respirado, tono sereno.',
  producto: 'Fotografía cinematográfica vertical para historia de Instagram de una pizzería argentina de horno de leña. La FOTO es la protagonista absoluta: primer plano de una pizza napolitana ARGENTINA recién salida del horno de leña: muzzarella fundida cubierta con rodajas de tomate fresco, toques de ajo y perejil picado, borde inflado con leopardado, vapor subiendo, sobre plato de cerámica en mesa de madera oscura; luz cálida lateral dramática, fondo muy oscuro desenfocado con brasas anaranjadas del horno. En el tercio inferior, bloque de texto CHICO y elegante sobre un degradé oscuro sutil: en caligrafía manuscrita dorada inclinada grande "la más elegida", debajo en sans blanca chica y espaciada en mayúsculas "NAPOLITANA · LA FAVORITA DE NUESTROS CLIENTES", y un botón pill dorado chico con texto oscuro "Vení a probarla".',
  partido: 'Póster de HINCHA de fútbol, placa vertical para historia de Instagram. Estética de póster deportivo argentino: imagen en DUOTONO rojo profundo y crema de un grupo de hinchas de espaldas abrazados alentando en una tribuna (sin caras reconocibles, sin escudos ni logos en la ropa), textura de papel de afiche gastado, grano, papelitos y confeti cayendo. Debajo de la franja superior despejada: un sello rectangular con borde blanco gastado tipo stencil con "FRANCIA VS ESPAÑA" en tipografía condensada blanca en mayúsculas, y colgando debajo una etiqueta chica de papel clara con "HOY · 21:00 HS" en oscuro. En la mitad inferior, texto GIGANTE en condensada bold con textura de tinta gastada, en dos líneas, color crema: "QUE HABLE" / "LA CANCHA", con un subrayado irregular tipo pincelada; debajo en mayúsculas espaciadas claras "ALENTEMOS JUNTOS."; debajo en sans chica "Lo pasamos en vivo en todas las sucursales"; y abajo un botón rectangular crema con texto oscuro "RESERVÁ TU MESA". El QUINTO SUPERIOR del lienzo queda totalmente despejado: SOLO papel crema liso.',
  celebracion: 'Diseño de placa vertical para historia de Instagram de una pizzería argentina de horno de leña. Placa de CELEBRACIÓN elegante y festiva, paleta cálida dorada y ámbar sobre fondo oscuro. Escena fotorrealista: primer plano de copas alzadas brindando con luces doradas desenfocadas (bokeh) de fondo, guirnaldas de luces cálidas, destellos y un confeti dorado fino cayendo suave; abajo apenas se insinúa una mesa de madera con una pizza humeante. Clima íntimo y festivo, nada deportivo. Bloque de texto centrado en la mitad inferior con jerarquía elegante: en caligrafía manuscrita dorada inclinada grande "estamos de festejo"; debajo el título en serif editorial blanca en dos líneas "Aniversario" / "Playa San Juan"; debajo una línea fina dorada; debajo en sans blanca "Próximo 25 de julio · 20:00 hs"; y abajo un botón pill dorado con texto oscuro "Reservá tu lugar".',
};

// Sufijo obligatorio de TODO prompt (lo agrega el código: no depende del modelo).
const COMUN = ' El QUINTO SUPERIOR del lienzo queda libre de textos y elementos (ahí se monta después el logo real), pero el fondo y la escena CONTINÚAN ahí con total naturalidad: la misma textura, luz y color que el resto del lienzo, SIN ninguna franja, corte horizontal, borde recto ni cambio de tono que marque esa zona. Escribí cada texto EXACTAMENTE como está entre comillas, letra por letra, con sus tildes y eñes. No agregues NINGÚN otro texto, palabra, marca de agua, firma, logo ni letra P suelta. Sin caras humanas reconocibles en primer plano. Sin faltas de ortografía.';

// Tildes que la escritura rápida suele saltear: corrección determinista, sin IA.
const TILDES = {
  aca: 'acá', alla: 'allá', asi: 'así', aqui: 'aquí', ahi: 'ahí', despues: 'después',
  tambien: 'también', ademas: 'además', futbol: 'fútbol', miercoles: 'miércoles',
  sabado: 'sábado', menu: 'menú', jamon: 'jamón', limon: 'limón', proximo: 'próximo',
  proxima: 'próxima', pizzeria: 'pizzería', pizzerias: 'pizzerías',
};
function corregirTildes(s) {
  return String(s || '').replace(/\b[A-Za-z]+\b/g, (w) => {
    const fix = TILDES[w.toLowerCase()];
    if (!fix) return w;
    if (w === w.toUpperCase()) return fix.toUpperCase();
    return w[0] === w[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix;
  });
}

// Última escena usada por tipo (regla de variedad del dueño). Vive en memoria:
// alcanza para que dos corridas seguidas no salgan iguales.
const ultimaEscena = {};

function extraerJSON(texto) {
  const s = String(texto || '');
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('El director no devolvió un JSON.');
  return JSON.parse(s.slice(i, j + 1));
}

// Muestra de la caligrafía REAL de la marca (Abuget, resuelta por fontconfig en
// el VPS): el texto exacto del remate renderizado por código y pasado al pintor
// como referencia de formas de letra. Describirla con palabras no alcanzaba —
// el pintor derivaba a itálicas de imprenta (visto el 14/7 con "recién hecho").
async function muestraCursiva(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  try {
    const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="420">' +
      '<rect width="100%" height="100%" fill="white"/>' +
      '<text x="60" y="280" font-family="Abuget" font-size="190" fill="black">' + esc + '</text></svg>';
    const crudo = await sharp(Buffer.from(svg)).png().toBuffer();
    const rec = await sharp(crudo).trim({ threshold: 5 }).flatten({ background: 'white' }).jpeg({ quality: 90 }).toBuffer();
    return { inlineData: { mimeType: 'image/jpeg', data: rec.toString('base64') } };
  } catch (e) { return null; /* sin fuente (ej. local) la placa sale igual */ }
}

async function llamarGemini(parts) {
  const hacer = async () => {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + PINTOR_MODEL() + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { imageConfig: { aspectRatio: '9:16' } } }),
      }
    );
    if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    const img = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData && p.inlineData.data);
    if (!img) throw new Error('Gemini no devolvió una imagen.');
    return Buffer.from(img.inlineData.data, 'base64');
  };
  try { return await hacer(); } catch (e) { return hacer(); /* 1 reintento: fallas transitorias */ }
}

const DIRECTOR_SYSTEM = `Sos el director de arte de Pizzería Popular (pizza al horno de leña, cocina argentina en España: Valencia, Alicante, Benidorm y Madrid). Tono de la marca: cálido, argentino, de "vos", honesto — JAMÁS prometas algo que el pedido no diga (ni promos, ni precios, ni datos inventados). Los partidos se pasan "por TV" o "en vivo", nunca "pantalla gigante".

Preparás UNA historia de Instagram (9:16). Te paso el TIPO de diseño con su PROMPT CANON (estructura aprobada por el dueño: ES LEY), el PEDIDO del usuario y el MODO.

- modo "literal": los textos del pedido van EXACTOS, letra por letra, con sus tildes. No los reescribas, no los completes, no los "mejores". Lo que el usuario no dio, no existe en la placa.
- modo "idea": escribís vos los textos con la voz de la marca. Cortos y con garra. Voseo rioplatense (imperativo con tilde: "vení", "probá"; con pronombre SIN tilde: "venite", "probala", "sumate"). Mayúscula inicial en título y bajada. Sin faltas.

Devolvé SOLO un JSON válido, sin markdown:
{ "textos": ["cada texto EXACTO que va a aparecer en la placa, uno por elemento"], "cursiva": "el texto exacto del remate en caligrafía manuscrita (\"\" si esta placa no lleva)", "prompt": "el prompt canon reescrito con los contenidos nuevos", "logo": "blanco" | "oscuro" }

Reglas del prompt:
- Mantené la ESTRUCTURA del canon: misma escena base, misma jerarquía de elementos, mismas posiciones, mismo estilo. Cambiá SOLO los contenidos: los textos entre comillas y, si aplica, el plato (tipo producto), la escena o el color del equipo (tipo partido: duotono con el color de la selección más relevante del pedido — Argentina: celeste y blanco; España: rojo; si no es obvio: rojo profundo).
- Si el pedido trae menos elementos que el canon, quitá los que sobran (no rellenes). Si trae más, integralos con la misma jerarquía.
- La caligrafía del remate se describe SIEMPRE así en el prompt: "caligrafía MANUSCRITA dorada estilo pincel fino, escrita a mano, inclinada — NUNCA una itálica de imprenta ni una serif cursiva". No lo cambies.
- El remate en cursiva es una frase NATURAL del habla rioplatense, corta y con sentido ("la más elegida", "recién salidas del horno", "como en casa"). Nunca una variación forzada o rara por el solo hecho de variar.
- "logo": "oscuro" si la franja superior del diseño es CLARA (papel crema, tipo partido); "blanco" si es oscura.`;

async function dirigir({ tipo, modo, texto }) {
  const partes = [
    'TIPO: ' + tipo,
    'PROMPT CANON (estructura ley):\n' + CANON[tipo],
    'MODO: ' + (modo === 'literal' ? 'literal (textos exactos del usuario)' : 'idea (vos escribís los textos)'),
    'PEDIDO DEL USUARIO:\n' + texto,
    ultimaEscena[tipo] ? 'VARIEDAD (regla del dueño): la historia anterior de este tipo usó esta escena — variá la ESCENA, el encuadre o la paleta dentro del canon para que NO salgan iguales. La variedad es VISUAL: los textos se escriben con la mejor calidad posible, nunca se degradan para "variar":\n' + ultimaEscena[tipo] : '',
  ].filter(Boolean).join('\n\n');
  const resp = await client.messages.create({
    model: DIRECTOR_MODEL(),
    max_tokens: 1600,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: 'user', content: partes }],
  });
  let out = '';
  for (const b of resp.content) if (b.type === 'text') out += b.text;
  const plan = extraerJSON(out);
  if (!plan.prompt || !Array.isArray(plan.textos)) throw new Error('El director devolvió un plan incompleto.');
  // Saneo determinista de tildes: en los textos Y dentro del prompt (mismo string).
  plan.textos = plan.textos.map((t) => {
    const fix = corregirTildes(t);
    if (fix !== t) plan.prompt = plan.prompt.split(t).join(fix);
    return fix;
  });
  plan.logo = plan.logo === 'oscuro' ? 'oscuro' : 'blanco';
  return plan;
}

const CONTROL_SYSTEM = `Sos el control de calidad de historias de Instagram de Pizzería Popular. Te paso la imagen generada y la lista de TEXTOS que deben aparecer. Devolvé SOLO un JSON: {"ok": true/false, "errores": ["..."]}.

Errores GRAVES (obligan a regenerar): un texto esperado que falta o está mal escrito (compará LETRA POR LETRA, tildes incluidas); un texto duplicado (la misma frase dos veces); texto inventado que no está en la lista (palabras, números, carteles legibles); dos textos montados uno sobre otro al punto de no leerse; cualquier texto, cartel, pill o bandera metido en el QUINTO SUPERIOR de la imagen (esa franja es solo para el logo real); una FRANJA, corte horizontal o cambio brusco de tono que separe el quinto superior del resto del fondo (el fondo debe continuar natural hasta el borde de arriba); un logo, isotipo o letra P dibujados por la IA; el remate caligráfico renderizado como ITÁLICA DE IMPRENTA o serif cursiva en lugar de caligrafía MANUSCRITA estilo pincel (la marca usa letra escrita a mano, no itálica tipográfica — reportalo como "la cursiva salió de imprenta: tiene que ser manuscrita estilo pincel").
NO son error: mayúsculas/minúsculas, saltos de línea, el logo real de la marca arriba (texto "PIZZERÍA POPULAR" con la llama), y lo que la INSTRUCCIÓN DE RETOQUE (si te la paso) pidió cambiar o sacar.
Si te paso una SEGUNDA imagen (la foto REAL del plato): compará el plato generado contra esa foto — tipo de pan/base, ingredientes visibles, guarnición, forma de servirlo. Si difiere notoriamente (otro pan, ingredientes que no están, falta la guarnición), es error GRAVE: reportalo como "el plato no coincide con el real: ..." con el detalle concreto.`;

async function controlar(buf, textos, instruccionRetoque, refPlato) {
  const thumb = await sharp(buf).resize(768, 1366, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const contenido = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') } },
  ];
  if (refPlato) contenido.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refPlato.inlineData.data } });
  contenido.push({ type: 'text', text: 'TEXTOS ESPERADOS:\n' + (textos.map((t) => '"' + t + '"').join('\n') || '(ninguno)') + (refPlato ? '\n\nLa segunda imagen es la foto REAL del plato: el plato generado debe coincidir.' : '') + (instruccionRetoque ? '\n\nINSTRUCCIÓN DE RETOQUE (lo que pide NO es error):\n' + instruccionRetoque : '') });
  const resp = await client.messages.create({
    model: DIRECTOR_MODEL(),
    max_tokens: 700,
    system: CONTROL_SYSTEM,
    messages: [{ role: 'user', content: contenido }],
  });
  let out = '';
  for (const b of resp.content) if (b.type === 'text') out += b.text;
  try {
    const v = extraerJSON(out);
    return { ok: !!v.ok, errores: Array.isArray(v.errores) ? v.errores.map(String) : [] };
  } catch (e) {
    return { ok: true, errores: [], sinControl: true };
  }
}

async function ponerLogo(buf, variante) {
  const base = await sharp(buf).resize(1080, 1920, { fit: 'cover', position: 'centre' }).toBuffer();
  const archivo = variante === 'oscuro' ? 'wordmark-oscuro.png' : 'wordmark-blanco.png';
  const logo = await sharp(path.join(LOGOS_DIR, archivo)).resize({ width: 380 }).png().toBuffer();
  const meta = await sharp(logo).metadata();
  return sharp(base)
    .composite([{ input: logo, left: Math.round((1080 - meta.width) / 2), top: 100 }])
    .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

async function subir(buf, nombre) {
  const objectPath = 'social/gen2/' + Date.now() + '-' + nombre + '.jpg';
  const { error } = await supabaseAdmin.storage.from('ppweb-blog')
    .upload(objectPath, buf, { contentType: 'image/jpeg' });
  if (error) throw new Error('Storage: ' + error.message);
  return supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl;
}

// ---- Búsqueda de la foto REAL del plato (tipo producto) ----
// No usa elegirFotos() del banco: ese buscador mira solo 450 fotos ordenadas
// por menos-usadas (el 14/7 la foto correcta del sánguche quedó FUERA del
// catálogo por haberse usado una vez, y la placa salió con un plato inventado).
// Acá se mira el catálogo de comida COMPLETO, la IA propone hasta 5 candidatas
// y cada una se valida MIRANDO la foto antes de usarla.
async function buscarFotoPlato(pedido) {
  const fotos = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabaseAdmin
      .from('ppweb_banco_imagenes')
      .select('id,drive_id,descripcion,etiquetas')
      .eq('tipo', 'producto')
      .order('id')
      .range(desde, desde + 999);
    if (error) throw new Error('Banco: ' + error.message);
    fotos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  if (!fotos.length) throw new Error('El banco no está indexado: tocá «Sincronizar banco» primero.');

  const catalogo = fotos.map((f) => 'id ' + f.id + ': ' + f.descripcion +
    (f.etiquetas && f.etiquetas.length ? ' (' + f.etiquetas.join(', ') + ')' : '')).join('\n');
  const resp = await client.messages.create({
    model: DIRECTOR_MODEL(),
    max_tokens: 300,
    system: 'Sos el archivista fotográfico de una pizzería. Te doy un pedido y el catálogo de fotos REALES de nuestros platos. Respondé SOLO un JSON {"candidatos":[ids]} con hasta 5 ids ordenados de mejor a peor, únicamente fotos donde el plato principal ES el plato del pedido — misma variante: "sándwich de milanesa" no es "milanesa al plato" ni "sándwich de jamón". Si ninguna descripción muestra ese plato, respondé {"candidatos":[]}.',
    messages: [{ role: 'user', content: 'Pedido: ' + pedido + '\n\nCATÁLOGO:\n' + catalogo }],
  });
  let txt = '';
  for (const b of resp.content) if (b.type === 'text') txt += b.text;
  let candidatos = [];
  try { candidatos = (extraerJSON(txt).candidatos || []).map(Number); } catch (e) { candidatos = []; }
  console.log('[Gen2] candidatas del banco para el plato:', candidatos.join(', ') || 'ninguna');
  const byId = {};
  fotos.forEach((f) => { byId[f.id] = f; });

  for (const id of candidatos.slice(0, 4)) {
    const f = byId[id];
    if (!f || !f.drive_id) continue;
    let part;
    try {
      const r = await fetch(await materializarFoto(f.drive_id));
      if (!r.ok) continue;
      const small = await sharp(Buffer.from(await r.arrayBuffer()))
        .resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      part = { inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } };
    } catch (e) { continue; }
    // Doble chequeo: (a) es el plato pedido, (b) es una FOTO limpia y no una
    // placa/flyer con texto incrustado — el 14/7 una placa vieja del banco pasó
    // como referencia y Gemini copió sus títulos a la historia nueva.
    const check = await client.messages.create({
      model: DIRECTOR_MODEL(),
      max_tokens: 160,
      system: 'Mirá la imagen y respondé SOLO un JSON {"coincide": true/false, "es_placa": true/false}. "coincide": ¿la imagen muestra claramente el plato que te nombro (el plato principal ES ese)? Sé estricto: parecido no alcanza. "es_placa": ¿la imagen es una pieza gráfica diseñada (placa, flyer o menú con títulos, logos o textos sobreimpresos) en lugar de una foto limpia del plato?',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: part.inlineData.data } },
        { type: 'text', text: 'Plato pedido: ' + pedido },
      ] }],
    });
    let vtxt = '';
    for (const b of check.content) if (b.type === 'text') vtxt += b.text;
    let veredicto = { coincide: false, es_placa: true };
    try { veredicto = extraerJSON(vtxt); } catch (e) { /* sin veredicto = descartada */ }
    if (veredicto.coincide && !veredicto.es_placa) {
      console.log('[Gen2] foto del plato validada:', id);
      return part;
    }
    console.log('[Gen2] foto del banco descartada (' + (veredicto.es_placa ? 'es una placa con texto' : 'no es el plato') + '):', id);
  }
  return null;
}

// ---- Generar una historia nueva ----
async function generarHistoria({ tipo, modo, texto }) {
  if (!CANON[tipo]) throw new Error('Tipo de diseño desconocido: ' + tipo);
  if (!process.env.GEMINI_API_KEY) { const e = new Error('Falta GEMINI_API_KEY.'); e.code = 'NO_KEY'; throw e; }
  const plan = await dirigir({ tipo, modo, texto: String(texto).trim() });
  const avisos = [];
  // Tipo PRODUCTO (regla del dueño, 14/7): la comida se referencia con una foto
  // REAL del banco. Regla DURA: si no hay foto validada del plato, NO se genera
  // (el 14/7 salió un sánguche inventado porque la foto correcta no llegó al
  // buscador y la placa se pintó igual, sin referencia).
  let refProducto = null;
  if (tipo === 'producto') {
    refProducto = await buscarFotoPlato(String(texto).trim());
    if (!refProducto) {
      throw new Error('No encontré en el banco una foto validada de ese plato, y en Producto no invento comida que no es nuestra. Si el plato está fotografiado en el Drive tocá «Sincronizar banco» y probá de nuevo; si no, sacale una foto, subila al Drive y sincronizá.');
    }
  }
  // Rastro para diagnóstico: qué decidió el director y si viajó referencia real.
  console.log('[Gen2] tipo=' + tipo + ' ref=' + (refProducto ? 'SÍ' : 'no') + ' textos=' + JSON.stringify(plan.textos));
  // El plato real se describe en concreto (pan, ingredientes, guarnición) y esa
  // descripción viaja en el prompt: la referencia es un CONTRATO, no inspiración.
  let descPlato = '';
  if (refProducto) {
    try {
      const resp = await client.messages.create({
        model: DIRECTOR_MODEL(),
        max_tokens: 350,
        system: 'Describí el PLATO de la foto en detalle concreto y visual, para que un generador de imágenes lo reproduzca IDÉNTICO: tipo de pan o base, ingredientes visibles (todos), cómo está cortado y servido, guarnición y salsa si las hay, vajilla. Solo la descripción, directa, sin florituras.',
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: refProducto.inlineData.data } },
            { type: 'text', text: 'Describí el plato.' },
          ],
        }],
      });
      for (const b of resp.content) if (b.type === 'text') descPlato += b.text;
      descPlato = descPlato.trim();
    } catch (e) { descPlato = ''; /* sin descripción sigue valiendo la foto */ }
  }
  const muestra = await muestraCursiva(plan.cursiva);
  let mejor = null;
  let feedback = '';
  for (let intento = 1; intento <= 2; intento++) {
    const parts = [];
    const notas = [];
    if (refProducto) {
      parts.push(refProducto);
      notas.push('La imagen ' + parts.length + ' es una foto REAL de NUESTRO producto: el plato de la historia debe verse como ESE — ' +
        (descPlato ? 'EXACTAMENTE así, sin cambiar ningún ingrediente ni la forma de servirlo: ' + descPlato : 'mismo plato, misma preparación, mismos toppings.') +
        ' Podés cambiar encuadre, fondo e iluminación según el diseño, pero el producto es ese. No copies el fondo de esa foto ni ningún texto que aparezca en ella.');
    }
    if (muestra) {
      parts.push(muestra);
      notas.push('La imagen ' + parts.length + ' es una MUESTRA de la caligrafía manuscrita de la marca con el texto EXACTO del remate: copiá esas formas de letra TAL CUAL (pintadas en dorado cálido) para el remate en cursiva de la placa. No uses ninguna itálica de imprenta.');
    }
    parts.push({ text: (notas.length ? notas.join('\n') + '\n\n' : '') + plan.prompt + COMUN + (feedback ? ' ERRORES DEL INTENTO ANTERIOR (corregilos sí o sí): ' + feedback : '') });
    const crudo = await llamarGemini(parts);
    const verif = await controlar(crudo, plan.textos, null, refProducto);
    if (verif.sinControl) avisos.push('No pude verificar los textos: revisala a ojo.');
    if (!mejor || verif.errores.length < mejor.verif.errores.length) mejor = { crudo, verif };
    if (verif.ok || verif.sinControl) { mejor = { crudo, verif }; break; }
    feedback = verif.errores.join(' · ');
    console.error('[Gen2] intento ' + intento + ' con errores:', feedback);
  }
  if (!mejor.verif.ok && !mejor.verif.sinControl) {
    mejor.verif.errores.forEach((e) => avisos.push('⚠️ ' + e + ' — tocá «Generar historia» de nuevo para otra tirada.'));
  }
  const final = await ponerLogo(mejor.crudo, plan.logo);
  const url = await subir(final, tipo);
  ultimaEscena[tipo] = plan.prompt.slice(0, 400);
  return { url, textos: plan.textos, logo: plan.logo, avisos };
}

// ---- Retoque quirúrgico sobre la historia existente ----
async function retocarHistoria({ url, instruccion, textos, logo }) {
  if (!process.env.GEMINI_API_KEY) { const e = new Error('Falta GEMINI_API_KEY.'); e.code = 'NO_KEY'; throw e; }
  const r = await fetch(url);
  if (!r.ok) throw new Error('No pude bajar la historia actual (' + r.status + ').');
  const base = await sharp(Buffer.from(await r.arrayBuffer())).resize(1080, 1920, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  // La franja del logo se preserva SIEMPRE por trasplante (la IA no la toca).
  const franja = await sharp(base).extract({ left: 0, top: 0, width: 1080, height: 212 }).toBuffer();
  const esperados = Array.isArray(textos) ? textos.map(String) : [];
  const avisos = [];
  let mejor = null;
  let feedback = '';
  for (let intento = 1; intento <= 2; intento++) {
    const instr = 'Editá la imagen adjunta (una historia de Instagram ya diseñada). Aplicá SOLO este cambio pedido por el usuario: "' + String(instruccion).trim() +
      '". TODO lo demás queda EXACTAMENTE igual: misma escena de fondo, mismo encuadre, mismos colores y tipografías, y los demás textos quedan donde están, letra por letra. ' +
      'Si el cambio pide sacar un texto o elemento, rellená esa zona con el fondo de la escena, sin dejar marca. Si pide reemplazar un texto, escribí el nuevo EXACTO, con sus tildes, en el mismo estilo del que reemplaza. ' +
      'No toques la franja superior ni el logo. No agregues elementos, textos ni logos nuevos. Sin faltas de ortografía.' +
      (feedback ? ' ERRORES DEL INTENTO ANTERIOR (corregilos sí o sí): ' + feedback : '');
    let editada = await llamarGemini([
      { inlineData: { mimeType: 'image/jpeg', data: base.toString('base64') } },
      { text: instr },
    ]);
    editada = await sharp(await sharp(editada).resize(1080, 1920, { fit: 'cover' }).toBuffer())
      .composite([{ input: franja, left: 0, top: 0 }])
      .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const verif = await controlar(editada, esperados, String(instruccion));
    if (verif.sinControl) avisos.push('No pude verificar el retoque: revisalo a ojo.');
    if (!mejor || verif.errores.length < mejor.verif.errores.length) mejor = { editada, verif };
    if (verif.ok || verif.sinControl) { mejor = { editada, verif }; break; }
    feedback = verif.errores.join(' · ');
    console.error('[Gen2 retoque] intento ' + intento + ' con errores:', feedback);
  }
  if (!mejor.verif.ok && !mejor.verif.sinControl) {
    mejor.verif.errores.forEach((e) => avisos.push('⚠️ ' + e + ' — probá el retoque de nuevo.'));
  }
  const urlNueva = await subir(mejor.editada, 'retoque');
  return { url: urlNueva, textos: esperados, avisos };
}

module.exports = { generarHistoria, retocarHistoria };
