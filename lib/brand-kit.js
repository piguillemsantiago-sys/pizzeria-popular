// ============================================================
// lib/brand-kit.js — Brand Kit del Generador.
// La identidad de la marca EN PALABRAS, para que la IA de
// imágenes (Gemini) diseñe sabiendo de antemano paleta,
// tipografías, fotografía, tono y reglas duras. Se edita desde
// el panel y se persiste en Supabase (tabla ppweb_brand_kit,
// una sola fila). Si la tabla/fila no existe, rigen los
// defaults de acá — el Generador nunca queda sin marca.
// ============================================================
const { supabaseAdmin } = require('./supabase');

// Defaults: el manual de marca resumido para una IA generativa.
// Cada campo es texto libre editable desde el panel.
const BRAND_KIT_DEFAULT = {
  marca: 'Pizzería Popular: cadena argentina de pizza al horno de leña en España ' +
    '(Valencia, Alicante, Benidorm y Madrid). Cocina argentina, ambiente cálido de ' +
    'barrio, fuego a la vista.',
  colores: 'Dorado cálido #D8A460 para acentos y detalles · negro humo #171310 para ' +
    'fondos y zonas de texto · blanco cálido para el texto principal. Paleta ' +
    'fotográfica: ámbar, dorado, rojo profundo, marrones de madera, negro.',
  tipografias: 'Máximo 2 familias por placa. Títulos: serif editorial de MUY alto ' +
    'contraste, elegante, en mayúsculas (estilo Abril Fatface) o sans geométrica bold ' +
    'en mayúsculas espaciadas (estilo Montserrat). Remate emocional: caligrafía ' +
    'manuscrita fina e inclinada, trazo de pincel, SIEMPRE en dorado (estilo Abuget) ' +
    'y solo palabras (nunca números). Textos secundarios: la misma sans, chica.',
  fotografia: 'Fotos cálidas y fotorrealistas de pizzería de horno de leña: fuego, ' +
    'brasas, madera, masa, quesos fundidos, vapor. Luz cálida direccional (dorada, ' +
    'tipo hora dorada en interior), sombras profundas, fondos oscuros con clima. ' +
    'Nada frío, nada de estudio blanco, nada corporativo.',
  tono: 'Cálido, argentino (rioplatense), directo, con humor liviano; habla de "vos". ' +
    'Cero jerga corporativa. Español rioplatense estándar, sin lenguaje inclusivo.',
  reglas: 'PROHIBIDO: inventar promos, precios o servicios que no estén en el pedido ' +
    '(nunca "pantalla gigante"); deformar o inventar logos (el logo real se agrega ' +
    'después: dejá despejada la franja superior central); texto con faltas de ' +
    'ortografía o tildes mal puestas; caras humanas en primer plano.',
};

const CAMPOS = Object.keys(BRAND_KIT_DEFAULT);

// Cache en memoria: el kit se lee en cada prompt de imagen; con invalidación al
// guardar alcanza (una sola instancia de la app).
let _cache = null;

async function getBrandKit() {
  if (_cache) return _cache;
  let kit = { ...BRAND_KIT_DEFAULT };
  let esDefault = true;
  try {
    const { data, error } = await supabaseAdmin
      .from('ppweb_brand_kit').select('data').eq('id', 1).maybeSingle();
    if (!error && data && data.data && typeof data.data === 'object') {
      for (const k of CAMPOS) {
        if (typeof data.data[k] === 'string' && data.data[k].trim()) kit[k] = data.data[k].trim();
      }
      esDefault = false;
    }
  } catch (e) { /* tabla ausente o Supabase caído: defaults */ }
  _cache = { kit, esDefault };
  return _cache;
}

async function saveBrandKit(entrada) {
  const data = {};
  for (const k of CAMPOS) {
    const v = entrada && typeof entrada[k] === 'string' ? entrada[k].trim() : '';
    data[k] = v || BRAND_KIT_DEFAULT[k]; // campo vacío = volver al default
  }
  const { error } = await supabaseAdmin
    .from('ppweb_brand_kit')
    .upsert({ id: 1, data, updated_at: new Date().toISOString() });
  if (error) {
    throw new Error(/relation .* does not exist|schema cache/i.test(error.message)
      ? 'Falta crear la tabla: corré supabase-brand-kit.sql en el SQL Editor de Supabase.'
      : error.message);
  }
  _cache = null; // invalidar: la próxima lectura trae lo guardado
  return getBrandKit();
}

// El kit como BLOQUE DE TEXTO para inyectar en prompts (de imagen o de copy).
function brandKitTexto(kit) {
  return [
    'IDENTIDAD DE MARCA (respetala en todo):',
    '· Marca: ' + kit.marca,
    '· Colores: ' + kit.colores,
    '· Tipografías: ' + kit.tipografias,
    '· Fotografía: ' + kit.fotografia,
    '· Tono: ' + kit.tono,
    '· Reglas duras: ' + kit.reglas,
  ].join('\n');
}

module.exports = { getBrandKit, saveBrandKit, brandKitTexto, BRAND_KIT_DEFAULT, CAMPOS };
