// ============================================================
// lib/referencia.js — Placas terminadas de referencia.
// El usuario sube a una carpeta de Drive sus piezas ya hechas
// que le gustan. De ahí sacamos:
//   · una GUÍA DE ESTILO (la IA describe paleta, fotografía,
//     encuadre, tono) para inyectar en copy y prompts;
//   · las IMÁGENES en sí, para pasárselas a Gemini como guía
//     visual y que genere "parecido".
// Se activa con GDRIVE_REFERENCIA_ID en el .env.
// ============================================================
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');
const { listFolder, downloadFile } = require('./drive');

const client = new Anthropic();

const ES_IMAGEN = (n) => /\.(jpe?g|png|webp)$/i.test(n || '');

function referenciaActiva() {
  return !!process.env.GDRIVE_REFERENCIA_ID;
}

// Lista las imágenes de la carpeta de referencia (sin recursión profunda).
async function listarReferencias() {
  if (!referenciaActiva()) return [];
  const { images } = await listFolder(process.env.GDRIVE_REFERENCIA_ID);
  return (images || []).filter((i) => ES_IMAGEN(i.name));
}

// ---- Guía de estilo (vision), cacheada en memoria ----
let _cache = { firma: '', guia: '' };

const GUIA_SYSTEM = `Sos director de arte. Te paso varias PLACAS terminadas de redes de
Pizzería Popular (cadena argentina de pizza al horno de leña en España) que son la
referencia de estilo a seguir. Mirá el CONJUNTO y devolvé SOLO un JSON válido (sin
markdown) con la guía de estilo común:

{ "fotografia": "qué tipo de foto usan (luz, color, cercanía, mood) en una frase",
  "paleta": "colores dominantes y acentos",
  "encuadre": "cómo componen (dónde va el sujeto, aire, etc.)",
  "tono_copy": "estilo de los textos (si se ven): tono, largo, actitud",
  "resumen": "una frase que capture el estilo para guiar una IA generativa" }

Sé concreto y breve. Si las placas son dispares, describí el común denominador.`;

async function guiaDeEstilo() {
  if (!referenciaActiva()) return '';
  const imgs = (await listarReferencias()).slice(0, 4);
  if (!imgs.length) return '';
  const firma = imgs.map((i) => i.id).sort().join(',');
  if (firma === _cache.firma && _cache.guia) return _cache.guia; // cache por contenido

  const content = [];
  for (const img of imgs) {
    try {
      const buf = await downloadFile(img.id);
      const thumb = await sharp(buf).rotate().resize(640, 640, { fit: 'inside' })
        .jpeg({ quality: 72 }).toBuffer();
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb.toString('base64') } });
    } catch (e) { /* sigue */ }
  }
  if (!content.length) return '';
  content.push({ type: 'text', text: 'Estas son las placas de referencia. Dame la guía de estilo común.' });

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    system: GUIA_SYSTEM,
    messages: [{ role: 'user', content }],
  });
  let text = '';
  for (const b of resp.content) if (b.type === 'text') text += b.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return '';
  let g;
  try { g = JSON.parse(m[0]); } catch (e) { return ''; }
  const guia = [
    g.fotografia && 'Fotografía: ' + g.fotografia,
    g.paleta && 'Paleta: ' + g.paleta,
    g.encuadre && 'Encuadre: ' + g.encuadre,
    g.tono_copy && 'Tono de copy: ' + g.tono_copy,
    g.resumen && 'En una frase: ' + g.resumen,
  ].filter(Boolean).join('\n');
  _cache = { firma, guia };
  return guia;
}

module.exports = { referenciaActiva, listarReferencias, guiaDeEstilo };
