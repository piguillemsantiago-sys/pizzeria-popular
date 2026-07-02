// TEMP: construye la carta de Luceros en HTML (fuentes embebidas) para captura con Chrome.
// Genera scripts/_carta.html. Borrar tras la sesión.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SLUG = process.argv[2] || 'luceros';
const LOC = {
  'luceros': 'Luceros · Alicante',
  'playa-san-juan': 'Playa San Juan · Alicante',
  'russafa': 'Russafa · Valencia',
  'santa-clara': 'Santa Clara · Valencia',
  'benidorm': 'Benidorm · Alicante',
  'boadilla': 'Boadilla · Madrid',
};
const LOC_LABEL = LOC[SLUG] || SLUG;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '_' + SLUG + '.json'), 'utf8'));

// ---- assets base64 ----
const b64 = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString('base64');
const FONT = {
  abril: b64('fonts/AbrilFatface-Regular.ttf'),
  monR: b64('fonts/Montserrat-Regular.ttf'),
  monB: b64('fonts/Montserrat-Bold.ttf'),
  abuget: b64('fonts/Abuget.ttf'),
};
const wordmark = b64('public/images/logos/wordmark-blanco.png');
const isoRojo = b64('public/images/logos/iso-rojo.png');

// ---- helpers de precio ----
const eur = (n) => Number(n).toFixed(2).replace('.', ',');
const ABBR = { 'Pequeña':'Peq','Chica':'Peq','Grande':'Gr','Mitad':'½','Copa':'Copa','Botella':'Bot',
  'Ternera':'Ter','Pollo':'Pollo','Caña':'Caña','Pinta':'Pinta','500ml':'½L','1L':'1L','Clásico':'','Premium':'Prem',
  'Para 2 personas':'2p','Para 4 personas':'4p','Para 6 personas':'6p','Solo':'','Napolitano':'Napol.','Calabaza y Champiñones':'Cal/Champ' };
const abbr = (v) => (v==null?'':(ABBR[v]!==undefined?ABBR[v]:v));
function fmtPrices(prices){
  if(!prices || !prices.length) return '';
  if(prices.length===1) return eur(prices[0].price);
  let ps = prices.filter(p => !/mitad/i.test(p.variant||''));
  if(!ps.length) ps = prices;
  // Si hay >3 variantes, o alguna etiqueta es larga (variantes descriptivas tipo
  // Provoleta), mostrar rango min–max: el inline con nombres largos desbordaba la columna.
  const longLabel = ps.some(p => { const a = abbr(p.variant); return a && a.length > 6; });
  if(ps.length>3 || longLabel){ const vals=ps.map(p=>p.price); return eur(Math.min(...vals))+'–'+eur(Math.max(...vals)); }
  return ps.map(p => { const a=abbr(p.variant); return (a?'<i>'+a+'</i> ':'')+eur(p.price); }).join('<span class="sep">·</span>');
}
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ---- selección de categorías ----
const cat = (n) => data.categories.find(c => c.name === n) || { items: [] };
function itemsHTML(items){
  return items.map(i => {
    const note = i.note ? ` <i>${esc(i.note)}</i>` : '';
    return `<div class="it"><span class="nm">${esc(i.name)}${note}</span><span class="dots"></span><span class="pr">${fmtPrices(i.prices)}</span></div>`;
  }).join('');
}
function block(title, items){
  return `<section class="cat"><h2>${esc(title)}</h2>${itemsHTML(items)}</section>`;
}

// Bebidas curadas (compactas) — precios REALES del local, buscados en sus datos.
function bev(name, sub){
  const beb = data.categories.find(c => c.name === 'Bebidas');
  const it = beb && beb.items.find(i => i.name === name && (!sub || i.sub === sub));
  return it ? it.prices : [];
}
// Cervezas: detectar por estructura, no por nombre (varía por local).
// barril = tiene variante de tirada (Caña/Doble/Pinta); botellín = un solo precio sin variante.
const cervezas = (() => { const b = data.categories.find(c => c.name === 'Bebidas'); return b ? b.items.filter(i => i.sub === 'Cervezas') : []; })();
const barril = cervezas.find(i => (i.prices||[]).some(p => ['Caña','Doble','Pinta'].includes(p.variant)));
const botellin = cervezas.find(i => (i.prices||[]).length === 1 && !i.prices[0].variant);

const bebidas = [
  { name:'Refrescos', note:'Coca-Cola, Fanta, Sprite, Aquarius, Nestea', prices: bev('Coca-Cola Original','Refrescos') },
  { name:'Zumos Minute Maid', prices: bev('Minute Maid Naranja','Zumos') },
  { name:'Agua', prices: bev('Agua','Aguas') },
  { name:'Cerveza de barril', note:'Águila', prices: barril ? barril.prices : [] },
  { name:'Cerveza botellín', note:'Heineken, Alcázar, s/gluten, 0,0', prices: botellin ? botellin.prices : [] },
  { name:'Aperol Spritz', prices: bev('Aperol Sprits','Tragos') },
  { name:'Gin Tonic', prices: bev('Gin Tonic','Tragos') },
  { name:'Fernet con Coca-Cola', prices: bev('Fernet Branca con Coca-Cola','Tragos') },
  { name:'Jarra de Sangría', prices: bev('Sangria','Jarras Populares') },
  { name:'Jarra de Tinto de Verano', prices: bev('Tinto de Verano','Jarras Populares') },
  { name:'Jarra de Limonada', prices: bev('Limonada','Jarras Populares') },
].filter(b => b.prices && b.prices.length);

const body = [
  block('Para empezar', cat('Para empezar').items),
  block('Wraps', cat('Wraps').items),
  block('Pizzas', cat('Pizzas').items),
  block('Milanesas', cat('Milanesas').items),
  block('Pastas', cat('Pastas').items),
  block('Ensaladas', cat('Ensaladas').items),
  block('Sándwiches', cat('Sandwiches').items),
  block('Para los niños', cat('Niños').items),
  block('Postres', cat('Postres').items),
  block('Vinos', cat('Vinos').items),
  block('Bebidas', bebidas),
].join('');

const totalItems = ['Para empezar','Wraps','Pizzas','Milanesas','Pastas','Ensaladas','Sandwiches','Niños','Postres','Vinos'].reduce((a,n)=>a+cat(n).items.length,0)+bebidas.length;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:'Abril';src:url(data:font/ttf;base64,${FONT.abril}) format('truetype');}
@font-face{font-family:'Mon';font-weight:400;src:url(data:font/ttf;base64,${FONT.monR}) format('truetype');}
@font-face{font-family:'Mon';font-weight:700;src:url(data:font/ttf;base64,${FONT.monB}) format('truetype');}
@font-face{font-family:'Abuget';src:url(data:font/ttf;base64,${FONT.abuget}) format('truetype');}
*{margin:0;padding:0;box-sizing:border-box;}
:root{--cream:#EDE8D9;--paper:#F4F0E4;--red:#C0392B;--dark:#2C2320;--mid:#9A8C84;--gold:#C49A5A;}
body{background:#555;font-family:'Mon',sans-serif;}
.page{width:1240px;height:1754px;background:var(--paper);position:relative;overflow:hidden;}
.a4line{position:absolute;left:0;right:0;top:1754px;border-top:3px dashed #C0392B;z-index:50;}
.a4line:after{content:'— límite A4 (lo de abajo NO entra) —';position:absolute;left:50%;transform:translateX(-50%);top:6px;background:#C0392B;color:#fff;font-size:13px;font-weight:700;padding:3px 12px;border-radius:4px;}
/* watermark */
.wm{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);width:760px;opacity:.04;z-index:0;}
/* header */
.head{background:var(--red);padding:40px 0 30px;text-align:center;position:relative;z-index:2;}
.head img{height:88px;}
.head .sub{margin-top:15px;color:rgba(255,255,255,.92);font-weight:700;letter-spacing:.42em;font-size:17px;text-transform:uppercase;padding-left:.42em;}
.subbar{text-align:center;padding:18px 0 8px;position:relative;z-index:2;}
.subbar .carta{font-family:'Abuget';font-size:76px;color:var(--red);line-height:.8;}
.subbar .loc{font-weight:700;letter-spacing:.3em;font-size:16px;color:var(--dark);text-transform:uppercase;margin-top:4px;padding-left:.3em;}
/* columns */
.cols{column-count:3;column-gap:36px;padding:18px 52px 18px;position:relative;z-index:2;}
.cat{break-inside:auto;margin-bottom:12px;}
.cat h2{font-family:'Abril';font-size:25px;color:var(--red);letter-spacing:.01em;padding-bottom:3px;margin-bottom:7px;border-bottom:2px solid var(--gold);break-after:avoid;}
.it{display:flex;align-items:baseline;font-size:16px;line-height:1.27;color:var(--dark);break-inside:avoid;padding:1px 0;}
.it .nm{font-weight:600;}
.it .nm i{font-style:italic;font-weight:400;color:var(--mid);}
.it .dots{flex:1 1 auto;border-bottom:1.5px dotted #c9bcaf;margin:0 6px;position:relative;top:-4px;min-width:10px;}
.it .pr{font-weight:700;white-space:nowrap;color:var(--dark);}
.it .pr i{font-style:normal;font-weight:600;color:var(--mid);font-size:13px;margin-right:1px;}
.it .pr .sep{color:var(--gold);margin:0 5px;}
/* footer */
.foot{text-align:center;font-size:13.5px;color:var(--mid);padding:0 54px 30px;position:relative;z-index:2;}
</style></head><body>
<div class="page">
  <img class="wm" src="data:image/png;base64,${isoRojo}">
  <div class="head"><img src="data:image/png;base64,${wordmark}"><div class="sub">Pizza argentina al horno de leña</div></div>
  <div class="subbar"><div class="carta">Carta</div><div class="loc">${esc(LOC_LABEL)}</div></div>
  <div class="cols">${body}</div>
  <div class="foot">Precios en euros · IVA incluido — Carta sujeta a disponibilidad · ${totalItems} platos y bebidas</div>
  ${process.env.FINAL==='1' ? '' : '<div class="a4line"></div>'}
</div>
</body></html>`;

fs.writeFileSync(path.join(__dirname, '_carta.html'), html);
console.log('OK _carta.html  | items totales=', totalItems);
