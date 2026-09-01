// Manda el paquete mensual de cada local por mail, con los mismos destinatarios
// del informe semanal (lib/informe-semanal.js) y el dueño en copia.
// Uso: node scripts/enviar-informes-mensuales.js <YYYY-MM> [--prueba] [--simular] [--adjuntos=mensual,ventas,equipo,menciones] [--mensaje=...] [local ...]
//   --prueba   → TODO va solo a la copia (para ver cómo llega), nadie del local lo recibe.
//   --simular  → no manda nada: imprime destinatarios, asunto y adjuntos.
//   --adjuntos → cuáles de los 4 PDF van (por defecto los 4). Ej.: reenviar solo mensual+menciones.
//   --mensaje  → párrafo propio al principio del mail (ej. "Versión actualizada...").
//
// Adjuntos por local: informe mensual (ficha + reseñas + carta), informe de ventas
// (versión dueño), "El mes del equipo" (ventas sin euros, para colgar en cocina)
// y las menciones al equipo (para la comisión por reseña con nombre).
// Después manda un mail de cierre a la copia con el resumen de menciones de todos
// los locales, el informe de dirección, el de todos los locales y Boadilla (ventas).
//
// Sale por la API de Gmail con el OAuth del panel (igual que el informe semanal)
// y, si eso no está disponible (fuera del VPS no hay credenciales del cliente
// OAuth), cae al SMTP de siempre. Varios adjuntos en un solo mail, cosa que
// enviarMail() de informe-semanal no hace.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const { DESTINOS, COPIA } = require('../lib/informe-semanal');
const { getAccessToken, conectado } = require('../lib/google-oauth');

const args = process.argv.slice(2);
const periodo = args.find((a) => /^\d{4}-\d{2}$/.test(a));
const prueba = args.includes('--prueba');
const simular = args.includes('--simular');
const opt = (k) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const ADJUNTOS = (opt('adjuntos') || 'mensual,ventas,equipo,menciones').split(',').map((x) => x.trim()).filter(Boolean);
const MENSAJE = opt('mensaje');
const soloLocales = args.filter((a) => !/^\d{4}-\d{2}$/.test(a) && !a.startsWith('--'));
if (!periodo) { console.error('Uso: node scripts/enviar-informes-mensuales.js <YYYY-MM> [--prueba] [local...]'); process.exit(1); }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const [Y, M] = periodo.split('-').map(Number);
const MES = MESES[M - 1];
const Mes = MES.charAt(0).toUpperCase() + MES.slice(1);
const DIR = path.join(__dirname, '..', 'informes', periodo);
const VENTAS = `c:/Users/pigui/Documents/01-Clientes/Pizzeria-Popular/informes-${MES}-${Y}`;

const LOCALES = {
  'playa-san-juan': { nombre: 'Playa San Juan', ventas: 'psj' },
  'luceros': { nombre: 'Luceros', ventas: 'luceros' },
  'benidorm': { nombre: 'Benidorm', ventas: 'benidorm' },
  'russafa': { nombre: 'Russafa', ventas: 'russafa' },
};
const lista = soloLocales.length ? soloLocales : Object.keys(LOCALES);

let TEXTOS = {};
try { TEXTOS = require(`./textos-informe-${periodo}.js`); } catch (e) { /* sin destacado */ }

const REMITENTE_NOMBRE = 'Pizzería Popular · Informes';
const from = process.env.MAIL_FROM || process.env.SMTP_USER;
const cab = (t) => (/^[ -~]*$/.test(t) ? t : '=?UTF-8?B?' + Buffer.from(t, 'utf8').toString('base64') + '?=');
const b64 = (buf) => buf.toString('base64').replace(/(.{76})/g, '$1\r\n');

function adjunto(ruta, nombre) {
  if (!fs.existsSync(ruta)) throw new Error('Falta el adjunto: ' + ruta);
  return { nombre, contenido: fs.readFileSync(ruta) };
}

async function enviar(msg) {
  if (simular) {
    console.log('[simular] → ' + msg.to.join(', ') + (msg.cc && msg.cc.length ? ' cc ' + msg.cc.join(', ') : '')
      + '\n   asunto: ' + msg.subject + '\n   adjuntos: ' + msg.adjuntos.map((a) => a.nombre).join(' · '));
    return 'simulado';
  }
  if (!from) throw new Error('Falta MAIL_FROM (o SMTP_USER) para el remitente.');
  if (conectado() && process.env.MAIL_VIA !== 'smtp') {
    try { return await enviarGmail(msg); }
    catch (e) { console.warn('Gmail no disponible (' + e.message + '); sale por SMTP.'); }
  }
  return enviarSmtp(msg);
}

async function enviarSmtp({ to, cc, subject, html, adjuntos }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) throw new Error('Sin Gmail ni SMTP configurado.');
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const tr = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await tr.sendMail({
    from: `"${REMITENTE_NOMBRE}" <${from}>`,
    to: to.join(', '),
    cc: cc && cc.length ? cc.join(', ') : undefined,
    subject, html,
    attachments: adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: 'application/pdf' })),
  });
  return 'smtp:' + (info.messageId || 'ok');
}

async function enviarGmail({ to, cc, subject, html, adjuntos }) {
  const token = await getAccessToken();
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
    b64(Buffer.from(html, 'utf8')),
  ];
  for (const a of adjuntos) {
    partes.push(
      `--${bnd}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${a.nombre.replace(/"/g, '')}"`,
      '',
      b64(a.contenido),
    );
  }
  partes.push(`--${bnd}--`, '');
  const raw = Buffer.from(partes.join('\r\n'), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(120000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${txt.slice(0, 250)}`);
  return JSON.parse(txt).id;
}

const marco = (titulo, cuerpo) => `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
  <h2 style="color:#392E2C;border-bottom:3px solid #D8A460;padding-bottom:10px;">${titulo}</h2>
  ${cuerpo}
  <p style="font-size:12px;color:#999;margin-top:22px;">Grupo Ajax · informes mensuales. Los datos de la ficha vienen de la API de Google, las reseñas del sistema propio (sincroniza cada 15 minutos) y las ventas del TPV.</p>
</div>`;

(async () => {
  const enviados = [];
  for (const slug of lista) {
    const L = LOCALES[slug];
    if (!L) { console.error('Local desconocido: ' + slug); continue; }
    const t = TEXTOS[`${slug}|${periodo}`] || {};
    const TODOS = {
      mensual: () => adjunto(path.join(DIR, `informe-${slug}.pdf`), `Informe mensual ${L.nombre} - ${MES} ${Y}.pdf`),
      ventas: () => adjunto(path.join(VENTAS, `informe-${L.ventas}-${MES}-${Y}.pdf`), `Informe de ventas ${L.nombre} - ${MES} ${Y}.pdf`),
      equipo: () => adjunto(path.join(VENTAS, 'equipo', `informe-equipo-${L.ventas}-${MES}-${Y}.pdf`), `El mes del equipo ${L.nombre} - ${MES} ${Y}.pdf`),
      menciones: () => adjunto(path.join(DIR, 'menciones', `Menciones equipo - ${L.nombre} - ${Mes} de ${Y}.pdf`), `Menciones al equipo ${L.nombre} - ${MES} ${Y}.pdf`),
    };
    const adjuntos = ADJUNTOS.filter((k) => TODOS[k]).map((k) => TODOS[k]());
    const ITEMS = {
      mensual: `<li><strong>Informe mensual</strong>: ficha de Google, franjas del mes, reseñas una por una, equipo, carta digital, últimos 12 meses, qué pasó con las acciones del mes anterior y qué hacer en ${MESES[M % 12]}.</li>`,
      ventas: `<li><strong>Informe de ventas</strong> (para el encargado): facturación, producto, operación y recomendaciones.</li>`,
      equipo: `<li><strong>El mes del equipo</strong>: la misma hoja sin cifras de dinero, para compartir con el personal.</li>`,
      menciones: `<li><strong>Menciones al equipo</strong>: cuántas reseñas de Google nombran a cada persona, con las frases de los clientes. Es la base de la comisión: una reseña que nombra a una sola persona vale 1; si nombra a dos o más, 0,5 para cada una (columna “a pagar”).</li>`,
    };
    const to = prueba ? COPIA : DESTINOS[slug];
    const cc = prueba ? [] : COPIA;
    if (!to || !to.length) throw new Error('Sin destinatarios para ' + slug);
    const html = marco(`${L.nombre} — informe de ${MES} ${Y}`, `
      ${MENSAJE ? `<p style="font-size:14px;line-height:1.6;">${MENSAJE}</p>` : `<p style="font-size:14px;line-height:1.6;">Va el cierre de <strong>${MES}</strong> del local, en ${adjuntos.length === 1 ? 'un PDF' : adjuntos.length + ' PDF'}:</p>`}
      <ol style="font-size:14px;line-height:1.7;padding-left:20px;">
        ${ADJUNTOS.filter((k) => ITEMS[k]).map((k) => ITEMS[k]).join('\n        ')}
      </ol>
      ${t.destacado ? `<div style="background:#faf7f2;border-left:4px solid #D8A460;padding:10px 14px;font-size:14px;line-height:1.6;margin:14px 0;">📌 <strong>Lo más importante del mes:</strong> ${t.destacado}</div>` : ''}
      <p style="font-size:14px;line-height:1.6;">Al final del informe mensual hay una sección <strong>“Ahora te toca a vos”</strong>: 3 cosas que querés que reforcemos desde las redes en ${MESES[M % 12]}. Con eso armamos el plan del mes.</p>`);
    const id = await enviar({ to, cc, subject: `Informe mensual — ${L.nombre} · ${MES} ${Y}${prueba ? ' [PRUEBA]' : ''}`, html, adjuntos });
    console.log(`✓ ${L.nombre} → ${to.join(', ')}${cc.length ? ' cc ' + cc.join(', ') : ''} (${id})`);
    enviados.push({ local: slug, to, cc, id });
  }

  // Cierre para la copia: lo transversal + lo que no tiene local destinatario.
  if (!soloLocales.length) {
    const completo = !opt('adjuntos');
    const extras = [];
    if (ADJUNTOS.includes('menciones')) extras.push(adjunto(path.join(DIR, 'menciones', `resumen-menciones-${periodo}.pdf`), `Menciones al equipo - todos los locales - ${MES} ${Y}.pdf`));
    if (completo) extras.push(adjunto(path.join(DIR, `informe-direccion-${periodo}.pdf`), `Informe de direccion - ${MES} ${Y}.pdf`));
    if (ADJUNTOS.includes('mensual')) extras.push(adjunto(path.join(DIR, `informe-todos-los-locales-${periodo}.pdf`), `Informes mensuales - todos los locales - ${MES} ${Y}.pdf`));
    if (completo) for (const [f, n] of [[`informe-boadilla-${MES}-${Y}.pdf`, `Informe de ventas Boadilla - ${MES} ${Y}.pdf`], [`equipo/informe-equipo-boadilla-${MES}-${Y}.pdf`, `El mes del equipo Boadilla - ${MES} ${Y}.pdf`]]) {
      const p = path.join(VENTAS, f); if (fs.existsSync(p)) extras.push(adjunto(p, n));
    }
    const html = marco(`Cierre de ${MES} ${Y} — resumen`, `
      <p style="font-size:14px;line-height:1.6;">${MENSAJE ? MENSAJE + ' ' : ''}Ya salieron los informes de ${enviados.map((e) => LOCALES[e.local].nombre).join(', ')}. Acá va lo que no es de un local en particular:</p>
      <ul style="font-size:14px;line-height:1.7;padding-left:20px;">
        ${ADJUNTOS.includes('menciones') ? '<li><strong>Menciones al equipo, todos los locales</strong>: una tabla por local con reseñas que nombran a cada persona, cuántas son compartidas y los puntos a pagar (1 sola / 0,5 compartida).</li>' : ''}
        ${completo ? '<li><strong>Informe de dirección</strong>: lo que solo se ve mirando los locales juntos.</li>' : ''}
        ${ADJUNTOS.includes('mensual') ? '<li><strong>Todos los informes mensuales en un solo PDF</strong>.</li>' : ''}
        ${completo ? '<li><strong>Boadilla</strong>: ventas (dueño y equipo) — no tiene destinatario propio.</li>' : ''}
      </ul>`);
    const id = await enviar({ to: COPIA, cc: [], subject: `Cierre de ${MES} ${Y} — menciones de todos los locales y dirección${prueba ? ' [PRUEBA]' : ''}`, html, adjuntos: extras });
    console.log(`✓ Cierre → ${COPIA.join(', ')} (${id})`);
  }
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
