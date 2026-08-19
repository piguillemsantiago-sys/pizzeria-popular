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
};
const COPIA = ['piguillemsantiago@gmail.com']; // el dueño va en copia de todos

const LOCALES = {
  'playa-san-juan': { wp: 1, nombre: 'Playa San Juan' },
  'luceros': { wp: 3, nombre: 'Luceros' },
  'benidorm': { wp: 6, nombre: 'Benidorm' },
  // Valencia queda afuera hasta que el dueño asigne destinatarios
  // (y ojo: las reseñas de Russafa no sincronizan — ficha sin acceso).
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
function renderHtml(nombre, d1, j) {
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
  const citaHtml = (r, neg) => `<div class="cita${neg ? ' neg' : ''}">“${esc(recortar(r.texto, 170))}”
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
  h2 { font-family:'Abril Fatface',Georgia,serif; font-weight:400; font-size:13.5pt; color:var(--marron); margin:4mm 0 2mm; }
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
  td { padding:1.2mm 2.5mm; font-size:9pt; border-bottom:1px solid var(--linea); }
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
  .cita { border-left:3px solid var(--dorado); padding:1.2mm 0 1.2mm 4mm; margin-bottom:2mm; font-size:8.8pt; break-inside:avoid; }
  .cita.neg { border-left-color:var(--rojo); }
  .cita .autor { color:var(--tinta-2); font-size:8pt; font-weight:600; }
  .avisos { margin-top:4mm; background:var(--fondo); border:1px solid var(--linea); border-radius:8px; padding:3mm 5mm; break-inside:avoid; }
  .avisos .t { font-size:8pt; text-transform:uppercase; letter-spacing:1px; font-weight:700; color:var(--tinta-2); margin-bottom:1mm; }
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

  <h2>Qué parte de la facturación pone cada grupo</h2>
  ${partFila('Bebidas', gBebidas, j.ideales ? +j.ideales.beb : null)}
  ${partFila('Entrantes', gEntrantes, j.ideales ? +j.ideales.ent : null)}
  ${partFila('Postres', gPostres, j.ideales ? +j.ideales.pos : null)}
  <div class="comparado">El resto (${pct0(100 - 100 * (gBebidas + gEntrantes + gPostres) / brutoProd)}) es plato principal: pizzas, milanesas, pastas, ensaladas, etc. Bebidas incluye cervezas, tragos, vinos, jarras y café. La marca │ es el <strong>ideal</strong>: el mejor cuarto de los últimos 12 meses de este local — un objetivo que el propio local ya alcanzó.</div>
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
  <div class="comparado" style="margin-bottom:2mm">
    <strong>${res.n} reseñas nuevas</strong> (semana anterior: ${resAnt.n})${+res.n > 0 ? ` · nota media <strong>★ ${(+res.nota).toLocaleString('es-ES')}</strong> · de 3★ o menos: <strong>${res.neg}</strong>${+res.neg > 0 ? ` (${pct0(100 * res.neg / res.n)})` : ''}` : ''}
  </div>
  ${citas5.map((r) => citaHtml(r, false)).join('\n')}
  ${citasNeg.length ? '<div class="comparado" style="margin:2mm 0 1.5mm"><strong>Lo que hay que leer con atención:</strong></div>' + citasNeg.map((r) => citaHtml(r, true)).join('\n') : ''}

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
  if (+data.sem.dias < 7) console.warn(`[InformeSemanal] ${slug}: solo ${data.sem.dias} días con venta en la semana ${d1}.`);

  const html = renderHtml(loc.nombre, d1, data);
  const base = path.join(os.tmpdir(), `informe-semanal-${slug}-${d1}`);
  fs.writeFileSync(base + '.html', html);
  await chromePdf(base + '.html', base + '.pdf');
  fs.unlinkSync(base + '.html');
  return { pdfPath: base + '.pdf', d1, nombre: loc.nombre, filename: `Informe semanal ${loc.nombre} - semana del ${d1}.pdf` };
}

// Manda el informe de UN local. opts: { destinos, cc, d1 } para pruebas.
async function enviar(slug, opts = {}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error('SMTP no configurado.');
  }
  const g = await generar(slug, opts.d1);
  const destinos = opts.destinos || DESTINOS[slug];
  if (!destinos || !destinos.length) throw new Error('Sin destinatarios para ' + slug);
  const cc = opts.cc !== undefined ? opts.cc : COPIA;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Pizzería Popular · Informes" <${process.env.SMTP_USER}>`,
    to: destinos.join(', '),
    cc: cc.length ? cc.join(', ') : undefined,
    subject: `Informe semanal — ${g.nombre} · ${periodoHumano(g.d1)}`,
    html: `<div style="max-width:560px;margin:0 auto;font-family:Arial,sans-serif;">
      <h2 style="color:#392E2C;border-bottom:3px solid #D8A460;padding-bottom:10px;">${esc(g.nombre)} — informe semanal</h2>
      <p style="font-size:14px;line-height:1.6;color:#333;">Va adjunto el informe de la semana del <strong>${periodoHumano(g.d1)}</strong>: facturación, día a día, participación por grupo con ideales, productos y reseñas.</p>
      <p style="font-size:12px;color:#999;">Se genera automáticamente cada lunes con los datos del TPV y de Google al momento del envío.</p>
    </div>`,
    attachments: [{ filename: g.filename, path: g.pdfPath }],
  });
  fs.unlinkSync(g.pdfPath);
  console.log(`[InformeSemanal] ${g.nombre} (${g.d1}) enviado a ${destinos.join(', ')}${cc.length ? ' cc ' + cc.join(', ') : ''}`);
  return { local: slug, semana: g.d1, destinos };
}

// Manda todos los locales configurados. Un fallo en uno no frena a los demás.
async function enviarTodos() {
  const resultados = [];
  for (const slug of Object.keys(DESTINOS)) {
    try {
      resultados.push(await enviar(slug));
    } catch (e) {
      console.error(`[InformeSemanal] ${slug}: ${e.message}`);
      resultados.push({ local: slug, error: e.message });
    }
  }
  return resultados;
}

module.exports = { generar, enviar, enviarTodos, semanaPasada };
