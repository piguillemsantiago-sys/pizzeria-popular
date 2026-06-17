// Exploratorio: 3 opciones de impacto para la placa tipo "sandwich".
// Render directo (no toca el sistema). Sube a storage y muestra URLs.
require('dotenv').config();
const path = require('path');
const sharp = require('sharp');
const { downloadFile } = require('./lib/drive');
const { supabaseAdmin } = require('./lib/supabase');

const W = 1080, H = 1920, cx = W / 2;
const GOLD = '#D8A460', DARK = '#171310';
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
const M = (size, ls, w) => 'font-family="Montserrat"' + (w === false ? '' : ' font-weight="bold"') + ' font-size="' + size + '" letter-spacing="' + ls + '" text-anchor="middle"';
const AB = (size) => 'font-family="Abuget" font-size="' + size + '" text-anchor="middle"';

const bgDefs =
  '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#000" stop-opacity="0.74"/>' +
  '<stop offset="0.4" stop-color="#000" stop-opacity="0.22"/>' +
  '<stop offset="0.72" stop-color="#000" stop-opacity="0"/>' +
  '<stop offset="1" stop-color="#000" stop-opacity="0.1"/></linearGradient>';

function wrapSvg(inner) {
  return Buffer.from('<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg"><defs>' + bgDefs +
    '</defs><rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' + inner + '</svg>');
}

// ---- Opción A: cursiva gigante (2 líneas) protagonista ----
function opcionA() {
  let s = '';
  s += sh(cx, 250, M(46, 8), 'VENÍ A', '#fff');
  s += halo(cx, 470, AB(200), 'Playa San', GOLD, 5);
  s += halo(cx, 640, AB(200), 'Juan', GOLD, 5);
  s += sh(cx, 745, M(40, 4), 'A VIVIR UN SÁBADO POPULAR', '#fff');
  s += sh(cx, 800, M(30, 2), '•  AV. NIZA 9, ALICANTE', GOLD);
  return wrapSvg(s);
}

// ---- Opción B: nombre del lugar en MAYÚSCULAS XL ----
function opcionB() {
  let s = '';
  s += sh(cx, 250, M(42, 10), 'VENÍ A', GOLD);
  s += sh(cx, 400, M(132, 2), 'PLAYA SAN', '#fff');
  s += sh(cx, 540, M(132, 2), 'JUAN', '#fff');
  s += halo(cx, 660, AB(96), 'a vivir un sábado popular', GOLD, 4);
  s += sh(cx, 740, M(30, 2), '•  AV. NIZA 9, ALICANTE', '#fff');
  return wrapSvg(s);
}

// ---- Opción C: cursiva + dirección en cápsula dorada + reglas ----
function opcionC() {
  let s = '';
  // "VENÍ A" con reglas doradas a los costados
  s += sh(cx, 240, M(44, 8), 'VENÍ A', '#fff');
  const tw = 250, gap = 40, lineLen = 150;
  s += '<rect x="' + (cx - tw / 2 - gap - lineLen) + '" y="228" width="' + lineLen + '" height="3" fill="' + GOLD + '"/>';
  s += '<rect x="' + (cx + tw / 2 + gap) + '" y="228" width="' + lineLen + '" height="3" fill="' + GOLD + '"/>';
  s += halo(cx, 440, AB(176), 'Playa San Juan', GOLD, 5);
  s += sh(cx, 560, M(42, 4), 'A VIVIR UN SÁBADO POPULAR', '#fff');
  // dirección en cápsula dorada sólida
  const pillTxt = 'AV. NIZA 9, ALICANTE', pw = 520, ph = 76, py = 610;
  s += '<rect x="' + (cx - pw / 2) + '" y="' + py + '" rx="38" width="' + pw + '" height="' + ph + '" fill="' + GOLD + '"/>';
  s += '<text x="' + cx + '" y="' + (py + ph / 2 + 12) + '" ' + M(32, 2) + ' fill="' + DARK + '">' + esc(pillTxt) + '</text>';
  return wrapSvg(s);
}

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
  const raw = await downloadFile(PHOTO);
  const foto = await sharp(raw).rotate().resize(W, H, { fit: 'cover', position: sharp.strategy.attention }).toBuffer();
  const lc = await logoCapas();
  const opts = { A: opcionA(), B: opcionB(), C: opcionC() };
  for (const k of Object.keys(opts)) {
    const pieza = await sharp(foto).composite([{ input: opts[k], left: 0, top: 0 }, ...lc]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    const p = 'social/disenos/opc-sandwich-' + k + '.jpg';
    await supabaseAdmin.storage.from('ppweb-blog').upload(p, pieza, { contentType: 'image/jpeg', upsert: true });
    require('fs').writeFileSync('/tmp/opc_' + k + '.jpg', pieza);
    console.log(k, supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(p).data.publicUrl);
  }
})();
