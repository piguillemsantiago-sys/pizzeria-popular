// ============================================================
// lib/informe-semanal.js — Informe semanal por local, en PDF por mail.
//
// Cada lunes (cron en index.js, 9:00 hora de España) genera un PDF de 2
// páginas por local con la semana lunes-domingo que acaba de cerrar:
// facturación (vs semana anterior y vs misma semana del año pasado), ticket
// por comensal, costo de mercadería, día a día, participación de bebidas/
// entrantes/postres con su IDEAL (percentil 75 de las semanas de los últimos
// 12 meses del propio local), top 10 con margen teórico, menos vendidos y
// reseñas de la semana (solo citas en español).
//
// Los números los calcula la función pp_informe_semanal en Supabase (una
// sola llamada, sin tope de 1000 filas). El PDF lo arma Chrome headless en
// el VPS. El mail sale por el mismo SMTP del informe de Inteligencia.
// Sin IA: todo determinístico, costo cero por envío.
// ============================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const dns = require('dns');
const nodemailer = require('nodemailer');
const { supabaseAdmin } = require('./supabase');

// El VPS no tiene salida IPv6: si el SMTP resuelve AAAA el connect da
// ENETUNREACH. Preferir IPv4 en todo el proceso (también ayuda a intel.js).
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// ---- A quién le llega el informe de cada local (definido por el dueño 19/8) ----
const DESTINOS = {
  'playa-san-juan': ['rrhh@grupoajax.es'],
  'benidorm': ['carloshugobarroso@gmail.com', 'administracion@grupoajax.es'],
  'luceros': ['rrhh@grupoajax.es'],
  // Valencia todavia no tiene encargado asignado: van al dueño hasta que lo
  // defina, para que el informe igual se genere y llegue todas las semanas.
  'russafa': ['piguillemsantiago@gmail.com'],
  'santa-clara': ['piguillemsantiago@gmail.com'],
};
const COPIA = ['piguillemsantiago@gmail.com']; // el dueño va en copia de todos

const LOCALES = {
  'playa-san-juan': { wp: 1, nombre: 'Playa San Juan' },
  'luceros': { wp: 3, nombre: 'Luceros' },
  'benidorm': { wp: 6, nombre: 'Benidorm' },
  'santa-clara': { wp: 5, nombre: 'Santa Clara' },
  // La cuenta perdió el acceso a la ficha de Google de Russafa (la API
  // devuelve 404): sus reseñas no sincronizan desde el 14/8/2026. El informe
  // sale igual con los números del TPV, avisando que esa sección no es real.
  'russafa': { wp: 2, nombre: 'Russafa',
    avisoResenas: 'Sin datos de reseñas: la cuenta perdió el acceso a la ficha de Google de este local y la sincronización está caída. Los números de venta de este informe no están afectados.' },
};

const CHROME = process.env.CHROME_BIN || 'google-chrome';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ---- helpers de formato ----
const eur = (n) => Math.round(+n).toLocaleString('es-ES') + ' €';
const eur2 = (n) => (+n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pct = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%';
const pct0 = (n) => (+n).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + '%';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Las reseñas vienen a veces con la traducción de Google pegada al final.
const limpiarCita = (t) => String(t).split(/\(Translated by Google\)/i)[0].replace(/\s+/g, ' ').trim();
// El campo idioma_detectado viene casi siempre vacío: el español se detecta por el texto.
const esEspanol = (t) => /[áéíóúñ¿¡]/i.test(t) ||
  (t.match(/\b(el|la|los|las|que|muy|con|una|un|para|nos|es|de|y|todo|buena|bueno)\b/gi) || []).length >= 3;
const recortar = (t, max) => (t.length > max ? t.slice(0, t.lastIndexOf(' ', max - 3) > 40 ? t.lastIndexOf(' ', max - 3) : max - 3) + '…' : t);

// Última semana lunes-domingo COMPLETA respecto de la fecha de España.
function semanaPasada() {
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) + 'T12:00:00Z');
  const dow = hoy.getUTCDay(); // 0=domingo
  const domingo = new Date(hoy);
  domingo.setUTCDate(hoy.getUTCDate() - (dow === 0 ? 7 : dow)); // último domingo cerrado
  const lunes = new Date(domingo);
  lunes.setUTCDate(domingo.getUTCDate() - 6);
  return lunes.toISOString().slice(0, 10);
}

function periodoHumano(d1) {
  const a = new Date(d1 + 'T12:00:00Z');
  const b = new Date(a); b.setUTCDate(a.getUTCDate() + 6);
  const mesA = MESES[a.getUTCMonth()], mesB = MESES[b.getUTCMonth()];
  const dias = (x) => x.getUTCDate();
  return mesA === mesB
    ? `lunes ${dias(a)} al domingo ${dias(b)} de ${mesB} de ${b.getUTCFullYear()}`
    : `lunes ${dias(a)} de ${mesA} al domingo ${dias(b)} de ${mesB} de ${b.getUTCFullYear()}`;
}

// ---- el HTML del informe (mismo diseño validado en los ejemplos del 19/8) ----
function renderHtml(loc, d1, j) {
  const nombre = loc.nombre;
  const sem = j.sem, ant = j.ant, anio = j.anio;
  const hayAnio = anio && +anio.bruto > 0 && +anio.dias >= 7;
  const vsAnt = ant && +ant.bruto > 0 ? 100 * (sem.bruto / ant.bruto - 1) : null;
  const vsAnio = hayAnio ? 100 * (sem.bruto / anio.bruto - 1) : null;
  const ticketCom = sem.bruto / sem.comensales;
  const costoPct = 100 * sem.costo / sem.neto;
  const margenLocal = 100 * (sem.bruto - sem.costo) / sem.bruto;
  const BEBIDAS = ['Bebidas sin alcohol', 'Cervezas', 'Tragos', 'Vinos', 'Jarras', 'Cafe / Infusiones'];

  const brutoProd = j.familias.reduce((a, r) => a + +r.bruto, 0);
  const grupo = (f) => j.familias.filter(f).reduce((a, r) => a + +r.bruto, 0);
  const gBebidas = grupo((r) => BEBIDAS.includes(r.family_name));
  const gEntrantes = grupo((r) => r.family_name === 'Entrantes');
  const gPostres = grupo((r) => r.family_name === 'Postres');

  const filasDias = j.dias.map((d, i) => {
    const antDia = j.dias_ant[i];
    const delta = antDia && +antDia.bruto > 0 ? 100 * (d.bruto / antDia.bruto - 1) : null;
    const clase = delta == null ? '' : (delta >= 0 ? 'sube' : 'baja');
    return `<tr><td>${DIAS_SEMANA[i] || ''} ${Number(d.dia.slice(8))}/${Number(d.dia.slice(5, 7))}</td>
      <td>${eur(d.bruto)}</td><td>${d.comensales}</td><td>${eur2(d.bruto / d.comensales)}</td>
      <td class="${clase}">${delta == null ? '—' : pct(delta)}</td></tr>`;
  }).join('\n');

  const filasTop = j.top.map((p) => {
    const margen = +p.costo > 0 ? 100 * (+p.bruto - +p.costo) / +p.bruto : null;
    const flojo = margen != null && margen < margenLocal - 8;
    const mTxt = margen == null ? '<span class="neutro">sin escandallo</span>'
      : `<span class="${flojo ? 'baja' : 'sube'}">${pct0(margen)}${flojo ? ' ⚠' : ''}</span>`;
    return `<tr><td>${esc(p.product_name)} <span class="fam">${esc(p.family_name)}</span></td>
      <td>${Math.round(p.uds)}</td><td>${eur(p.bruto)}</td><td>${mTxt}</td></tr>`;
  }).join('\n');

  const filasMenos = j.menos.map((p) =>
    `<tr><td>${esc(p.product_name)} <span class="fam">${esc(p.family_name)}</span></td>
     <td>${Math.round(p.uds)}</td><td>${eur(p.bruto)}</td></tr>`).join('\n');

  const partFila = (etq, val, ideal) => {
    const p = 100 * val / brutoProd;
    const logrado = ideal != null && p >= ideal;
    const F = 2.8;
    const barW = p * F;
    const idealPos = ideal != null ? Math.min(ideal * F, 96) : null;
    const dentro = barW >= 11;
    const labelLeft = Math.max(barW, idealPos || 0) + 1.2;
    return `<div class="fila-barra"><div class="etq">${etq}</div>
      <div class="pista">
        <div class="barra" style="width:${barW}%">${dentro ? `<span class="val">${pct0(p)}</span>` : ''}</div>
        ${dentro ? '' : `<span class="val-fuera" style="left:${labelLeft}%">${pct0(p)}</span>`}
        ${idealPos != null ? `<div class="meta" style="left:${idealPos}%"></div>` : ''}
      </div>
      <div class="fuera">${eur(val)}<br>${ideal != null ? `<span class="${logrado ? 'sube' : 'ideal-txt'}">ideal ${pct0(ideal)}${logrado ? ' ✓' : ''}</span>` : ''}</div></div>`;
  };

  const citas5 = j.citas5.map((r) => ({ ...r, texto: limpiarCita(r.texto_original) }))
    .filter((r) => r.texto.length >= 40 && esEspanol(r.texto)).slice(0, 2);
  const citasNeg = j.citas_neg.map((r) => ({ ...r, texto: limpiarCita(r.texto_original) }))
    .filter((r) => r.texto.length >= 20 && esEspanol(r.texto)).slice(0, 2);
  const citaHtml = (r, neg) => `<div class="cita${neg ? ' neg' : ''}">“${esc(recortar(r.texto, 150))}”
    <span class="autor">— ${esc(r.cliente_nombre || 'Cliente')}${neg ? ` (${r.estrellas}★)` : ''}</span></div>`;

  const res = j.resenas, resAnt = j.resenas_ant;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Informe semanal — ${esc(nombre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 13mm 0; }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  :root { --marron:#392E2C; --dorado:#D8A460; --dorado-fuerte:#C9913F; --crema:#F3E3C6; --fondo:#FCFAF6;
    --tinta:#2B2220; --tinta-2:#6E5F58; --linea:#E5DCCE; --verde:#2E7D46; --rojo:#B3402A; }
  body { font-family:'Montserrat',Arial,sans-serif; color:var(--tinta); background:#fff; font-size:10pt; line-height:1.45; }
  .pagina { padding:0 16mm; }
  .p2 { break-before:page; padding-top:3mm; }
  .masthead { background:var(--marron); color:#fff; margin:0 -16mm 5mm; padding:6mm 16mm 5mm; }
  .masthead .marca { font-size:8.5pt; letter-spacing:3px; text-transform:uppercase; color:var(--dorado); font-weight:700; }
  .masthead h1 { font-family:'Abril Fatface',Georgia,serif; font-weight:400; font-size:21pt; margin:1.5mm 0 1mm; }
  .masthead .sub { font-size:9pt; color:#D9CFC7; } .masthead .sub strong { color:#fff; }
  h2 { font-family:'Abril Fatface',Georgia,serif; font-weight:400; font-size:13.5pt; color:var(--marron); margin:3.5mm 0 1.8mm; }
  h2 small { font-family:Montserrat,Arial,sans-serif; font-size:8.5pt; color:var(--tinta-2); font-weight:600; }
  .hero { display:flex; gap:3.5mm; margin-bottom:2mm; }
  .hero .tile { flex:1; background:var(--fondo); border:1px solid var(--linea); border-radius:8px; padding:3mm 4mm; }
  .hero .tile .v { font-size:14pt; font-weight:800; color:var(--marron); white-space:nowrap; }
  .hero .tile .k { font-size:7.5pt; text-transform:uppercase; letter-spacing:1px; color:var(--tinta-2); font-weight:600; margin-top:1mm; }
  .hero .tile.destacado { background:var(--marron); border-color:var(--marron); }
  .hero .tile.destacado .v { color:var(--dorado); } .hero .tile.destacado .k { color:#D9CFC7; }
  .comparado { font-size:9pt; color:var(--tinta-2); margin:1mm 0 0; }
  table { width:100%; border-collapse:collapse; margin-top:1mm; }
  th { font-size:7.5pt; text-transform:uppercase; letter-spacing:1px; color:var(--tinta-2); text-align:left; padding:1.3mm 2.5mm; border-bottom:2px solid var(--marron); }
  td { padding:0.95mm 2.5mm; font-size:8.8pt; border-bottom:1px solid var(--linea); }
  th:not(:first-child), td:not(:first-child) { text-align:right; }
  td .fam { color:var(--tinta-2); font-size:7.5pt; }
  .sube { color:var(--verde); font-weight:700; } .baja { color:var(--rojo); font-weight:700; } .neutro { color:var(--tinta-2); }
  .fila-barra { display:flex; align-items:center; gap:3mm; margin-bottom:2mm; }
  .fila-barra .etq { width:26mm; font-size:9pt; font-weight:700; text-align:right; }
  .fila-barra .pista { flex:1; position:relative; height:7mm; background:#F2ECE1; border-radius:0 4px 4px 0; }
  .fila-barra .fuera { width:26mm; font-size:8.5pt; font-weight:600; color:var(--tinta-2); line-height:1.3; }
  .fila-barra .meta { position:absolute; top:-1mm; bottom:-1mm; width:0.7mm; background:var(--marron); border-radius:1mm; }
  .fila-barra .val-fuera { position:absolute; top:50%; transform:translateY(-50%); font-size:9pt; font-weight:700; color:var(--tinta); }
  .ideal-txt { color:var(--dorado-fuerte); font-weight:700; }
  .fila-barra .barra { height:7mm; background:var(--dorado-fuerte); border-radius:0 4px 4px 0; display:flex; align-items:center; justify-content:flex-end; padding-right:2.5mm; overflow:hidden; }
  .fila-barra .barra .val { color:#fff; font-weight:700; font-size:9pt; }
  .cita { border-left:3px solid var(--dorado); padding:1mm 0 1mm 4mm; margin-bottom:1.5mm; font-size:8.6pt; break-inside:avoid; }
  .cita.neg { border-left-color:var(--rojo); }
  .cita .autor { color:var(--tinta-2); font-size:8pt; font-weight:600; }
  .avisos { margin-top:3mm; background:var(--fondo); border:1px solid var(--linea); border-radius:8px; padding:2.5mm 5mm; break-inside:avoid; }
  .avisos .t { font-size:8pt; text-transform:uppercase; letter-spacing:1px; font-weight:700; color:var(--tinta-2); margin-bottom:1mm; }
  .aviso-caido { background:#FBF2E6; border-left:3px solid var(--dorado-fuerte); padding:2mm 4mm; font-size:8.8pt; color:var(--tinta-2); margin-bottom:2mm; }
  .avisos li { font-size:8pt; color:var(--tinta-2); margin-left:4mm; padding:0.3mm 0; }
</style></head><body>

<div class="pagina">
  <div class="masthead">
    <div class="marca">Pizzería Popular · Informe semanal del local</div>
    <h1>${esc(nombre)}</h1>
    <div class="sub">Semana del <strong>${periodoHumano(d1)}</strong> · Fuente: TPV Ágora y reseñas de Google · Comparado con la semana anterior y la misma semana del año pasado</div>
  </div>

  <div class="hero">
    <div class="tile destacado"><div class="v">${eur(sem.bruto)}</div><div class="k">Facturación de la semana</div></div>
    <div class="tile"><div class="v" style="color:${vsAnt >= 0 ? 'var(--verde)' : 'var(--rojo)'}">${vsAnt == null ? '—' : pct(vsAnt)}</div><div class="k">vs. semana anterior</div></div>
    <div class="tile"><div class="v">${(+sem.comensales).toLocaleString('es-ES')}</div><div class="k">Comensales</div></div>
    <div class="tile"><div class="v">${eur2(ticketCom)}</div><div class="k">Ticket por comensal</div></div>
    <div class="tile"><div class="v">${pct0(costoPct)}</div><div class="k">Costo mercadería</div></div>
  </div>
  <div class="comparado">${hayAnio
    ? `Contra la misma semana del año pasado: <strong class="${vsAnio >= 0 ? 'sube' : 'baja'}">${pct(vsAnio)}</strong> en facturación (${eur(anio.bruto)} → ${eur(sem.bruto)}).`
    : 'Sin comparación con el año pasado: el local no tiene esa semana en el sistema.'}</div>

  <h2>Día a día <small>(la referencia es el mismo día de la semana anterior)</small></h2>
  <table>
    <tr><th>Día</th><th>Facturación</th><th>Comensales</th><th>€ por comensal</th><th>vs. sem. ant.</th></tr>
    ${filasDias}
  </table>

  <h2>Qué parte de la venta pone cada grupo <small>(sobre ${eur(brutoProd)} de productos, a precio de carta)</small></h2>
  ${partFila('Bebidas', gBebidas, j.ideales ? +j.ideales.beb : null)}
  ${partFila('Entrantes', gEntrantes, j.ideales ? +j.ideales.ent : null)}
  ${partFila('Postres', gPostres, j.ideales ? +j.ideales.pos : null)}
  <div class="comparado">El resto (${pct0(100 - 100 * (gBebidas + gEntrantes + gPostres) / brutoProd)}) es plato principal: pizzas, milanesas, pastas, ensaladas, etc. Bebidas incluye cervezas, tragos, vinos, jarras y café. Este total no coincide con el titular de arriba (${eur(sem.bruto)}): aquel es lo efectivamente cobrado y este la suma de la carta — la diferencia son descuentos, promos e invitaciones. La marca │ es el <strong>ideal</strong>: el mejor cuarto de los últimos 12 meses de este local — un objetivo que el propio local ya alcanzó.</div>
</div>

<div class="pagina p2">
  <h2>Los 10 que más facturaron <small>(⚠ = margen por debajo del promedio del local)</small></h2>
  <table>
    <tr><th>Producto</th><th>Uds</th><th>Facturación</th><th>Margen teórico</th></tr>
    ${filasTop}
  </table>

  <h2>Los que menos se vendieron <small>(candidatos a revisar o empujar)</small></h2>
  <table>
    <tr><th>Producto</th><th>Uds</th><th>Facturación</th></tr>
    ${filasMenos}
  </table>

  <h2>Reseñas de la semana</h2>
  ${loc.avisoResenas ? `<div class="aviso-caido">${esc(loc.avisoResenas)}</div>` : ''}
  <div class="comparado" style="margin-bottom:2mm; display:${loc.avisoResenas ? 'none' : 'block'}">
    <strong>${res.n} reseñas nuevas</strong> (semana anterior: ${resAnt.n})${+res.n > 0 ? ` · nota media <strong>★ ${(+res.nota).toLocaleString('es-ES')}</strong> · de 3★ o menos: <strong>${res.neg}</strong>${+res.neg > 0 ? ` (${pct0(100 * res.neg / res.n)})` : ''}` : ''}
  </div>
  ${loc.avisoResenas ? '' : citas5.map((r) => citaHtml(r, false)).join('\n')}
  ${!loc.avisoResenas && citasNeg.length ? '<div class="comparado" style="margin:2mm 0 1.5mm"><strong>Lo que hay que leer con atención:</strong></div>' + citasNeg.map((r) => citaHtml(r, true)).join('\n') : ''}

  <div class="avisos">
    <div class="t">Cómo leer este informe</div>
    <ul>
      <li>Facturación = venta bruta del TPV. Costo de mercadería = teórico por escandallos, sobre venta neta.</li>
      <li>El margen teórico de cada producto sale del escandallo cargado en el TPV; "sin escandallo" = falta cargarlo.</li>
      <li>Las comparaciones diarias son contra el mismo día de la semana anterior (lunes contra lunes).</li>
      <li>El "ideal" de cada grupo es el mejor cuarto (percentil 75) de las semanas de los últimos 12 meses del propio local: no es teoría, ya se logró acá. Se recalcula solo cada semana.</li>
      <li>Las reseñas citadas son textuales de Google, de esta semana y de este local.</li>
    </ul>
  </div>
</div>

</body></html>`;
}

// ============================================================
// Transporte del mail.
// DigitalOcean bloquea los puertos SMTP salientes del VPS (25, 465 y 587 dan
// timeout; verificado el 19/8/2026), así que el camino bueno es la API HTTPS
// del proveedor, que sale por el 443 como cualquier otra llamada.
// El proveedor se deduce de la forma de la clave, para no tener que tocar
// código si algún día se cambia de uno a otro:
//   MAIL_API_KEY=xkeysib-...  → Brevo
//   MAIL_API_KEY=re_...       → Resend
// Sin MAIL_API_KEY cae al SMTP de siempre (sirve fuera del VPS).
// MAIL_FROM define el remitente; tiene que ser una dirección VERIFICADA en el
// proveedor o el envío se rechaza.
// ============================================================
const REMITENTE_NOMBRE = 'Pizzería Popular · Informes';
const mailFrom = () => process.env.MAIL_FROM || process.env.SMTP_USER;

async function apiPost(url, headers, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${txt.slice(0, 300)}`);
  return txt;
}

// Cabecera con acentos: RFC 2047 (=?UTF-8?B?...?=), si no Gmail la rompe.
const cab = (t) => (/^[ -~]*$/.test(t) ? t
  : '=?UTF-8?B?' + Buffer.from(t, 'utf8').toString('base64') + '?=');

// Envía por la API de Gmail con el OAuth que ya usa el panel para las fichas.
// Sale por HTTPS, así que esquiva el bloqueo de puertos SMTP del VPS, y el
// mail va desde la cuenta real del dueño (mejor entrega que un relay externo).
async function enviarGmail({ to, cc, subject, html, adjunto, from }) {
  const googleOAuth = require('./google-oauth');
  if (!googleOAuth.conectado()) throw new Error('Google no conectado: autorizar desde el panel.');
  const token = await googleOAuth.getAccessToken();
  const bnd = 'pp' + Date.now().toString(36);
  const partes = [
    `From: ${cab(REMITENTE_NOMBRE)} <${from}>`,
    `To: ${to.join(', ')}`,
    ...(cc && cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${cab(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${bnd}"`,
    '',
    `--${bnd}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ];
  if (adjunto) {
    partes.push(
      `--${bnd}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${adjunto.nombre.replace(/"/g, '')}"`,
      '',
      fs.readFileSync(adjunto.path).toString('base64').replace(/(.{76})/g, '$1\r\n'),
    );
  }
  partes.push(`--${bnd}--`, '');
  const raw = Buffer.from(partes.join('\r\n'), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text();
  if (!r.ok) {
    if (r.status === 403 && /insufficient|scope/i.test(txt)) {
      throw new Error('Falta el permiso de envío: reconectar Google desde el panel (el token viejo no incluye gmail.send).');
    }
    throw new Error(`Gmail ${r.status}: ${txt.slice(0, 250)}`);
  }
  return 'gmail';
}

async function enviarMail({ to, cc, subject, html, adjunto }) {
  const key = process.env.MAIL_API_KEY;
  const from = mailFrom();
  if (!from) throw new Error('Falta MAIL_FROM (o SMTP_USER) para el remitente.');
  const b64 = adjunto ? fs.readFileSync(adjunto.path).toString('base64') : null;
  const listaCc = (cc || []).filter(Boolean);

  // Orden: Gmail del dueño (si está conectado y no se forzó otra vía) → API
  // del proveedor → SMTP. MAIL_VIA permite forzar: gmail | api | smtp.
  const via = process.env.MAIL_VIA;
  if (via !== 'api' && via !== 'smtp') {
    try {
      if (require('./google-oauth').conectado()) {
        return await enviarGmail({ to, cc: listaCc, subject, html, adjunto, from });
      }
    } catch (e) {
      if (via === 'gmail' || !key) throw e;
      console.warn('[InformeSemanal] Gmail falló (' + e.message + '), pruebo con la API del proveedor.');
    }
  }

  if (key && key.startsWith('re_')) {
    await apiPost('https://api.resend.com/emails', { authorization: `Bearer ${key}` }, {
      from: `${REMITENTE_NOMBRE} <${from}>`,
      to, cc: listaCc.length ? listaCc : undefined, subject, html,
      attachments: adjunto ? [{ filename: adjunto.nombre, content: b64 }] : undefined,
    });
    return 'resend';
  }

  if (key) {
    await apiPost('https://api.brevo.com/v3/smtp/email', { 'api-key': key }, {
      sender: { email: from, name: REMITENTE_NOMBRE },
      to: to.map((email) => ({ email })),
      cc: listaCc.length ? listaCc.map((email) => ({ email })) : undefined,
      subject, htmlContent: html,
      attachment: adjunto ? [{ name: adjunto.nombre, content: b64 }] : undefined,
    });
    return 'brevo';
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error('Sin MAIL_API_KEY ni SMTP configurado.');
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"${REMITENTE_NOMBRE}" <${from}>`,
    to: to.join(', '),
    cc: listaCc.length ? listaCc.join(', ') : undefined,
    subject, html,
    attachments: adjunto ? [{ filename: adjunto.nombre, path: adjunto.path }] : undefined,
  });
  return 'smtp';
}

function chromePdf(htmlPath, pdfPath) {
  return new Promise((resolve, reject) => {
    execFile(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, htmlPath],
    { timeout: 120000 }, (err) => {
      if (err) return reject(new Error('Chrome: ' + err.message));
      if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 5000) {
        return reject(new Error('Chrome no escribió el PDF.'));
      }
      resolve(pdfPath);
    });
  });
}

// Genera el PDF de un local. Devuelve { pdfPath, d1, nombre, filename }.
async function generar(slug, d1) {
  const loc = LOCALES[slug];
  if (!loc) throw new Error('Local desconocido: ' + slug);
  d1 = d1 || semanaPasada();
  const { data, error } = await supabaseAdmin.rpc('pp_informe_semanal',
    { p_wp: loc.wp, p_slug: slug, p_d1: d1 });
  if (error) throw new Error('RPC: ' + error.message);
  if (!data || !data.sem || !+data.sem.dias) throw new Error(`Sin datos de TPV para ${slug} en la semana ${d1}.`);

  // Doble chequeo: recalcula los mismos números por otro camino y compara.
  // Si algo no cuadra, el informe se genera igual (para poder mirarlo) pero
  // enviar() se planta: preferimos no mandar nada antes que mandar un dato malo.
  const verificacion = await require('./informe-verificacion').verificar(slug, loc.wp, d1, data);
  if (!verificacion.ok) {
    console.error('[InformeSemanal] ' + slug + ' NO pasó la verificación:');
    verificacion.errores.forEach((e) => console.error('   - ' + e));
  }
  verificacion.avisos.forEach((a) => console.warn('[InformeSemanal] ' + slug + ' aviso: ' + a));
  if (+data.sem.dias < 7) console.warn(`[InformeSemanal] ${slug}: solo ${data.sem.dias} días con venta en la semana ${d1}.`);

  const html = renderHtml(loc, d1, data);
  const base = path.join(os.tmpdir(), `informe-semanal-${slug}-${d1}`);
  fs.writeFileSync(base + '.html', html);
  await chromePdf(base + '.html', base + '.pdf');
  fs.unlinkSync(base + '.html');
  return { pdfPath: base + '.pdf', d1, nombre: loc.nombre, verificacion,
    filename: `Informe semanal ${loc.nombre} - semana del ${d1}.pdf` };
}

// Manda el informe de UN local. opts: { destinos, cc, d1 } para pruebas.
async function enviar(slug, opts = {}) {
  if (!process.env.MAIL_API_KEY && !process.env.SMTP_HOST
      && !require('./google-oauth').conectado()) {
    throw new Error('Sin vía de envío: falta Google conectado, MAIL_API_KEY o SMTP.');
  }
  const g = await generar(slug, opts.d1);
  if (!g.verificacion.ok && !opts.forzar) {
    fs.unlinkSync(g.pdfPath);
    const err = new Error('No pasó la verificación de datos, no se envía: '
      + g.verificacion.errores.join(' | '));
    err.verificacion = g.verificacion; // para decidir si se puede reparar
    throw err;
  }
  const destinos = opts.destinos || DESTINOS[slug];
  if (!destinos || !destinos.length) throw new Error('Sin destinatarios para ' + slug);
  const cc = opts.cc !== undefined ? opts.cc : COPIA;

  await enviarMail({
    to: destinos,
    cc,
    subject: `Informe semanal — ${g.nombre} · ${periodoHumano(g.d1)}`,
    html: `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;">
      <h2 style="color:#392E2C;border-bottom:3px solid #D8A460;padding-bottom:10px;">${esc(g.nombre)} — informe semanal</h2>
      <p style="font-size:14px;line-height:1.6;color:#333;">Va adjunto el informe de la semana del <strong>${periodoHumano(g.d1)}</strong>: facturación, día a día, participación por grupo con ideales, productos y reseñas.</p>
      <p style="font-size:12px;color:#999;">Se genera automáticamente cada lunes con los datos del TPV y de Google al momento del envío.</p>
    </div>`,
    adjunto: { nombre: g.filename, path: g.pdfPath },
  });
  fs.unlinkSync(g.pdfPath);
  console.log(`[InformeSemanal] ${g.nombre} (${g.d1}) enviado a ${destinos.join(', ')}${cc.length ? ' cc ' + cc.join(', ') : ''}`);
  return { local: slug, semana: g.d1, destinos };
}

// ============================================================
// Procesar la semana: intentar, REPARAR y reintentar hasta que salga.
//
// Que la verificación falle casi siempre significa que faltan datos (el TPV
// no sincronizó todavía), no que estén mal. Eso se arregla solo: se
// resincroniza y se vuelve a intentar. Si después de eso sigue sin cuadrar,
// se deja pendiente y el reintento por hora lo vuelve a probar.
//
// La bitácora en pp_informes_envios permite que cada pasada agarre SOLO lo
// que falta: si un local ya salió, no se manda dos veces.
// ============================================================
const INTENTOS_POR_PASADA = 2;

async function procesarLocal(slug, d1) {
  const rep = require('./informe-reparacion');
  if (await rep.yaEnviado(slug, d1)) return { local: slug, estado: 'ya_enviado' };

  let reparaciones = [];
  let ultimoError = null;

  for (let intento = 1; intento <= INTENTOS_POR_PASADA; intento += 1) {
    try {
      const r = await enviar(slug, { d1 });
      await rep.registrar(slug, d1, {
        estado: 'enviado',
        enviado_el: new Date().toISOString(),
        destinos: r.destinos,
        intentos: (await rep.intentosPrevios(slug, d1)) + intento,
        ultimo_error: null,
        reparaciones: reparaciones.length ? reparaciones : null,
      });
      return { local: slug, estado: 'enviado', reparado: reparaciones.length > 0, reparaciones };
    } catch (e) {
      ultimoError = e.message;
      const errores = (e.verificacion && e.verificacion.errores) || [];
      // Si los números no cuadran entre sí, reintentar no arregla nada:
      // es un problema de código y hay que avisar en el momento.
      if (errores.length && !rep.esReparable(errores)) break;
      if (intento < INTENTOS_POR_PASADA) {
        reparaciones = reparaciones.concat(await rep.reparar(d1, errores.length ? errores : ['Datos sincronizados']));
      }
    }
  }

  await rep.registrar(slug, d1, {
    estado: 'pendiente',
    intentos: (await rep.intentosPrevios(slug, d1)) + INTENTOS_POR_PASADA,
    ultimo_error: ultimoError,
    reparaciones: reparaciones.length ? reparaciones : null,
  });
  return { local: slug, estado: 'pendiente', error: ultimoError, reparaciones };
}

// `ultimaPasada` = ya no habrá más reintentos hoy: recién ahí se avisa.
async function procesarSemana(d1, { ultimaPasada = false } = {}) {
  const semana = d1 || semanaPasada();
  const resultados = [];
  for (const slug of Object.keys(DESTINOS)) {
    try {
      resultados.push(await procesarLocal(slug, semana));
    } catch (e) {
      console.error(`[InformeSemanal] ${slug}: ${e.message}`);
      resultados.push({ local: slug, estado: 'pendiente', error: e.message });
    }
  }

  const pendientes = resultados.filter((r) => r.estado === 'pendiente');
  const reparados = resultados.filter((r) => r.estado === 'enviado' && r.reparado);
  // Si no se intentó ninguna reparación es porque el problema no era de datos
  // faltantes (los números no cuadran entre sí, o falló el envío): reintentar
  // no lo va a arreglar, así que se avisa en el momento.
  const noReparables = pendientes.filter((r) => !r.reparaciones || r.reparaciones.length === 0);

  // Se avisa cuando ya no hay más reintentos por delante, o cuando el problema
  // no es de datos faltantes (ahí reintentar no sirve y conviene saberlo ya).
  if (pendientes.length && (ultimaPasada || noReparables.length)) {
    try {
      await enviarMail({
        to: COPIA,
        cc: [],
        subject: `⚠️ Informe semanal: ${pendientes.length} local(es) sin enviar`,
        html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
          + '<h2 style="color:#B3402A;">Estos informes no salieron</h2>'
          + '<p style="font-size:14px;color:#333;">El sistema ya intentó repararlo solo '
          + '(resincronizar el TPV y las reseñas) y volvió a probar. Sigue sin cuadrar:</p><ul>'
          + pendientes.map((f) => `<li style="margin-bottom:8px;"><b>${esc(f.local)}</b><br>`
            + `<span style="color:#B3402A;">${esc(f.error || 'sin detalle')}</span>`
            + (f.reparaciones && f.reparaciones.length
              ? `<br><small style="color:#777;">Se intentó: ${esc(f.reparaciones.join(' · '))}</small>` : '')
            + '</li>').join('')
          + '</ul><p style="font-size:12px;color:#999;">Los demás locales salieron normal. '
          + 'Este aviso lo manda el chequeo de datos previo al envío.</p></div>',
      });
    } catch (e) {
      console.error('[InformeSemanal] no se pudo avisar del fallo:', e.message);
    }
  }

  console.log(`[InformeSemanal] ${resultados.filter((r) => r.estado === 'enviado').length} enviados, `
    + `${resultados.filter((r) => r.estado === 'ya_enviado').length} ya estaban, ${pendientes.length} pendientes`
    + (reparados.length ? ` (${reparados.length} salieron tras reparar)` : ''));
  return resultados;
}

// Compatibilidad: enviarTodos() sigue existiendo y ahora repara y reintenta.
const enviarTodos = () => procesarSemana();

module.exports = { generar, enviar, enviarTodos, procesarSemana, procesarLocal, semanaPasada, renderHtml, enviarMail };
