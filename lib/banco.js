// ============================================================
// lib/banco.js — Banco de imágenes indexado.
// Recorre el Google Drive conectado, hace que la IA (vision)
// describa cada foto y guarda el catálogo en ppweb_banco_imagenes.
// Después, elegirFotos() selecciona del catálogo la foto más
// acorde a lo que se le pide — con criterio, sin que el usuario
// la elija a mano.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const { supabaseAdmin } = require('./supabase');
const { listFolder, downloadFile } = require('./drive');
const { guiaDeEstilo } = require('./referencia');

const client = new Anthropic();

// Carpeta raíz del banco (Fotos Sucurales). Si se quiere indexar TODO
// el Drive, cambiar a undefined (usa FOLDER_ROOT de drive.js).
const BANCO_ROOT = '1VxwlWeOmexM6YvfiIbqLRWeVy3uTTC3q';

const ES_IMAGEN = (n) => /\.(jpe?g|png|webp)$/i.test(n || '');

// Recorre recursivamente las carpetas del banco y junta todas las imágenes.
async function listarBancoRecursivo(folderId, ruta, acc, prof) {
  if (prof > 3) return acc;
  const { folders, images } = await listFolder(folderId);
  for (const img of images) {
    if (ES_IMAGEN(img.name)) acc.push({ id: img.id, name: img.name, carpeta: ruta });
  }
  for (const f of folders) {
    await listarBancoRecursivo(f.id, ruta ? ruta + ' / ' + f.name : f.name, acc, prof + 1);
  }
  return acc;
}

const VISION_SYSTEM = `Describís fotos para el banco de imágenes de Pizzería Popular
(cadena argentina de pizza al horno de leña en España). Te paso UNA foto y devolvés
SOLO un JSON válido (sin markdown):

{ "descripcion": "qué se ve, en una frase corta y concreta (español)",
  "tipo": "producto" | "personas" | "local" | "ambiente" | "otro",
  "etiquetas": ["3 a 7 palabras clave: platos, lugar, clima, colores, acciones"] }

Reglas:
- "producto": comida en primer plano (pizza, milanesa, postre, bebida).
- "personas": gente (equipo, clientes, sonrisas, manos trabajando).
- "local": fachada, salón, horno, cartel, vista del lugar.
- "ambiente": mesa servida, detalles, clima general sin protagonista claro.
- Si la foto está borrosa, oscura o no sirve para redes, agregá "descartable" a etiquetas.`;

// Pool de concurrencia simple.
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); }
      catch (e) { out[idx] = { error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function describirImagen(buf) {
  const thumb = await sharp(buf).rotate().resize(512, 512, { fit: 'inside' })
    .jpeg({ quality: 70 }).toBuffer();
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    system: VISION_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') } },
        { type: 'text', text: 'Describí esta foto para el banco.' },
      ],
    }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('vision sin JSON');
  const d = JSON.parse(m[0]);
  return {
    descripcion: String(d.descripcion || '').slice(0, 300),
    tipo: ['producto', 'personas', 'local', 'ambiente', 'otro'].includes(d.tipo) ? d.tipo : 'otro',
    etiquetas: Array.isArray(d.etiquetas) ? d.etiquetas.slice(0, 8) : [],
  };
}

// ---- Sincroniza el banco: indexa las fotos nuevas (que no estén ya en la tabla) ----
async function sincronizar(opts) {
  opts = opts || {};
  const todas = await listarBancoRecursivo(BANCO_ROOT, '', [], 0);
  const { data: yaIndex } = await supabaseAdmin
    .from('ppweb_banco_imagenes').select('drive_id');
  const known = new Set((yaIndex || []).map((r) => r.drive_id));
  let nuevas = todas.filter((f) => !known.has(f.id));
  if (opts.limit) nuevas = nuevas.slice(0, opts.limit);

  let ok = 0, fail = 0;
  await pool(nuevas, 4, async (f) => {
    try {
      const buf = await downloadFile(f.id);
      const d = await describirImagen(buf);
      const { error } = await supabaseAdmin.from('ppweb_banco_imagenes').insert({
        drive_id: f.id, carpeta: f.carpeta, nombre: f.name,
        descripcion: d.descripcion, tipo: d.tipo, etiquetas: d.etiquetas,
      });
      if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
      ok++;
    } catch (e) { fail++; if (opts.log) console.error('[Banco]', f.name, e.message); }
  });
  return { total: todas.length, indexadas: known.size + ok, nuevas: ok, fallidas: fail };
}

async function estado() {
  const { count } = await supabaseAdmin
    .from('ppweb_banco_imagenes').select('*', { count: 'exact', head: true });
  return { indexadas: count || 0 };
}

const ELECCION_SYSTEM = `Sos el editor de fotografía de Pizzería Popular. Elegís, de un
catálogo, la mejor foto para cada placa de una pieza de redes.

Te paso: la instrucción de la campaña, las placas (con su texto) y el catálogo de
fotos disponibles (id + descripción + tipo). Devolvé SOLO un JSON válido:

{ "elecciones": [ { "placa": 1, "id": 123, "motivo": "por qué encaja, breve" } ] }

Reglas:
- Una foto por placa. NO repitas la misma foto en placas distintas.
- Elegí por contenido: si la placa habla de una pizza, foto de esa pizza; si habla
  del equipo o de trabajar acá, foto de personas; si invita a visitar, foto del local.
- DISTINGUÍ STAFF de CLIENTES. En la descripción/etiquetas vas a ver si son
  "equipo", "staff", "mozo", "mesero", "camarero", "cocinero", "uniforme",
  "delantal" (= PERSONAL) o "cliente", "pareja", "comensales" (= CLIENTES).
  · Para empleo / "sumate al equipo" / "trabajá con nosotros" / cultura interna →
    SÍ O SÍ una foto de PERSONAL (equipo, uniforme, delantal, cocina, atendiendo).
    NUNCA una foto de clientes comiendo o brindando para hablar del equipo.
  · Para experiencia / ambiente / "vení a disfrutar" → ahí sí van clientes.
- Para la placa-gancho (la primera de un carrusel) y para historias, preferí fotos
  potentes: producto apetitoso o personas con energía.
- Evitá fotos donde el sujeto principal quede pegado a un borde (se cortan mal en
  vertical); preferí encuadres con el sujeto más centrado.
- Nunca elijas fotos con la etiqueta "descartable", borrosas u oscuras.
- Si ninguna encaja perfecto, elegí la más cercana igual (no dejes placas sin foto).`;

// ---- Elige del catálogo la mejor foto para cada placa ----
// placas: [{ titulo, bajada, cta }]. excluir: [bancoId] a NO considerar.
// Devuelve [{ driveId, bancoId, motivo }] por placa.
async function elegirFotos(instruccion, formato, placas, excluir) {
  const evita = new Set((excluir || []).map(Number));
  let { data: fotos } = await supabaseAdmin
    .from('ppweb_banco_imagenes')
    .select('id,drive_id,descripcion,tipo,etiquetas,usos')
    .order('usos', { ascending: true })
    .limit(450);
  fotos = (fotos || []).filter((f) => !evita.has(f.id));
  if (!fotos.length) {
    const e = new Error('El banco todavía no está indexado. Tocá «Sincronizar banco» primero.');
    e.code = 'BANCO_VACIO';
    throw e;
  }

  const catalogo = fotos.map((f) =>
    'id ' + f.id + ' [' + f.tipo + ']: ' + f.descripcion +
    (f.etiquetas && f.etiquetas.length ? ' (' + f.etiquetas.join(', ') + ')' : '')
  ).join('\n');
  const placasTxt = placas.map((p, i) =>
    (i + 1) + '. Título: "' + p.titulo + '"' +
    (p.bajada ? ' · Bajada: "' + p.bajada + '"' : '') +
    (p.cta ? ' · CTA: "' + p.cta + '"' : '')).join('\n');

  let estilo = '';
  try { estilo = await guiaDeEstilo(); } catch (e) { /* referencia opcional */ }

  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1200,
    system: ELECCION_SYSTEM + (estilo
      ? '\n\nESTÉTICA DE REFERENCIA (preferí fotos que encajen con este estilo):\n' + estilo
      : ''),
    messages: [{
      role: 'user',
      content: 'Campaña (' + formato + '): ' + instruccion +
        '\n\nPLACAS:\n' + placasTxt + '\n\nCATÁLOGO DE FOTOS:\n' + catalogo,
    }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no pudo elegir fotos.');
  const elecciones = (JSON.parse(m[0]).elecciones || []);

  const byId = {};
  fotos.forEach((f) => { byId[f.id] = f; });
  const result = placas.map((_, i) => {
    const el = elecciones.find((e) => e.placa === i + 1) || elecciones[i];
    const foto = el && byId[el.id];
    return foto ? { driveId: foto.drive_id, bancoId: foto.id, motivo: el.motivo || '' } : null;
  });

  // Suma uso a las elegidas (para rotar y no repetir siempre las mismas).
  const usados = result.filter(Boolean).map((r) => r.bancoId);
  if (usados.length) {
    for (const id of usados) {
      const f = byId[id];
      if (f) supabaseAdmin.from('ppweb_banco_imagenes')
        .update({ usos: (f.usos || 0) + 1 }).eq('id', id).then(() => {}, () => {});
    }
  }
  return result;
}

module.exports = { sincronizar, estado, elegirFotos };
