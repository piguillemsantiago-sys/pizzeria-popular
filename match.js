// Reproduce el diseño que aprobó el cliente: nombre en SERIF (Abril) title-case
// blanco + cursiva (Abuget) dorada debajo. Mínimo, 2 líneas, arriba.
require('dotenv').config();
const path = require('path');
const sharp = require('sharp');
const { downloadFile } = require('./lib/drive');
const { supabaseAdmin } = require('./lib/supabase');

const W = 1080, H = 1920, cx = W / 2;
const GOLD = '#D8A460';
const PHOTO = '1v-3LJQfVoVOCe3teZ72i-zOCvaOSfSM9';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function sh(x, y, attrs, txt, fill) {
  return '<text x="' + x + '" y="' + (y + 3) + '" ' + attrs + ' fill="#000" opacity="0.5">' + esc(txt) + '</text>' +
    '<text x="' + x + '" y="' + y + '" ' + attrs + ' fill="' + fill + '">' + esc(txt) + '</text>';
}
function halo(x, y, attrs, txt, fill, off) {
  let s = '';
  for (const d of [[-off, 0], [off, 0], [0, -off], [0, off], [off, off + 2]]) {
    s += '<text x="' + (x + d[0]) + '" y="' + (y + d[1]) + '" ' + attrs + ' fill="#000" opacity="0.4">' + esc(txt) + '</text>';
  }
  s += '<text x="' + x + '" y="' + y + '" ' + attrs + ' fill="' + fill + '">' + esc(txt) + '</text>';
  return s;
}
// Texto con CONTORNO negro nítido: una copia negra con stroke grueso debajo + el
// relleno arriba. Da un borde limpio (no un halo difuso).
function outline(x, y, attrs, txt, fill, sw) {
  return '<text x="' + x + '" y="' + y + '" ' + attrs + ' fill="#000" stroke="#000" stroke-width="' + sw + '" stroke-linejoin="round">' + esc(txt) + '</text>' +
    '<text x="' + x + '" y="' + y + '" ' + attrs + ' fill="' + fill + '">' + esc(txt) + '</text>';
}

const bgDefs =
  '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#000" stop-opacity="0.72"/>' +
  '<stop offset="0.4" stop-color="#000" stop-opacity="0.22"/>' +
  '<stop offset="0.7" stop-color="#000" stop-opacity="0"/>' +
  '<stop offset="1" stop-color="#000" stop-opacity="0.1"/></linearGradient>';

async function logoCapas() {
  const file = path.join(__dirname, 'public', 'images', 'logos', 'iso-blanco.png');
  const logo = await sharp(file).resize({ height: 190 }).png().toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((W - meta.width) / 2), top = H - meta.height - 86;
  const alpha = await sharp(logo).extractChannel('alpha').toBuffer();
  const sil = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).joinChannel(alpha).png().toBuffer();
  const sombra = await sharp(sil).extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } }).blur(10).png().toBuffer();
  return [{ input: sombra, left: left - 16, top: top - 13 }, { input: logo, left, top }];
}

(async () => {
  const titulo = 'Playa San Juan', acento = 'te esperamos';
  // Tamaños EXACTOS de Canva (lienzo 1080×1920): Abril 88,5 / Abuget 201.
  const tSize = 88.5, aSize = 201;
  let s = '';
  s += sh(cx, 290, 'font-family="Abril Fatface" font-size="' + tSize + '" letter-spacing="0" text-anchor="middle"', titulo, '#fff');
  // cursiva grande con contorno negro sutil
  s += outline(cx, 460, 'font-family="Abuget" font-size="' + aSize + '" letter-spacing="0" text-anchor="middle"', acento, GOLD, 4);
  const overlay = Buffer.from('<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg"><defs>' + bgDefs + '</defs><rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' + s + '</svg>');

  const raw = await downloadFile(PHOTO);
  const foto = await sharp(raw).rotate().resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
  const lc = await logoCapas();
  const pieza = await sharp(foto).composite([{ input: overlay, left: 0, top: 0 }, ...lc]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  require('fs').writeFileSync('/tmp/match.jpg', pieza);
  await supabaseAdmin.storage.from('ppweb-blog').upload('social/disenos/match-serif.jpg', pieza, { contentType: 'image/jpeg', upsert: true });
  console.log(supabaseAdmin.storage.from('ppweb-blog').getPublicUrl('social/disenos/match-serif.jpg').data.publicUrl);
})();
