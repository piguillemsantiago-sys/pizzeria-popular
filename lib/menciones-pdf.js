// ============================================================
// lib/menciones-pdf.js — PDF del informe de menciones del equipo.
// Dos formas del mismo informe:
//   · equipo   → portada con el ranking + una página por persona con sus frases
//   · personal → una sola persona, para imprimirlo y entregárselo
// Las dos salen del mismo objeto que devuelve lib/menciones.js.
// ============================================================
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const A4 = { w: 595.28, h: 841.89 };
const M = 42;
const CONTENT_W = A4.w - M * 2;
const BOTTOM = A4.h - 60;

const COLOR = {
  texto: '#1a1a1a',
  suave: '#6b6b76',
  linea: '#e2e2e9',
  banda: '#1c1c22',
  fondo: '#f6f6fa',
  dorado: '#c8a04a',
  verde: '#00a650',
  gris: '#9a9aa5',
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const FUENTES = path.join(__dirname, '..', 'fonts');
const F = { reg: 'Helvetica', bold: 'Helvetica-Bold', display: 'Helvetica-Bold' };

// Montserrat y Abril viven en fonts/. Si faltaran (deploy incompleto), el PDF
// sale igual con las tipografías internas de pdfkit en vez de romperse.
function registrarFuentes(doc) {
  const cargar = (nombre, archivo) => {
    const p = path.join(FUENTES, archivo);
    if (!fs.existsSync(p)) return null;
    try { doc.registerFont(nombre, p); return nombre; } catch (e) { return null; }
  };
  F.reg = cargar('pp-reg', 'Montserrat-Regular.ttf') || 'Helvetica';
  F.bold = cargar('pp-bold', 'Montserrat-Bold.ttf') || 'Helvetica-Bold';
  F.display = cargar('pp-display', 'AbrilFatface-Regular.ttf') || F.bold;
}

// Montserrat cubre latín básico y extendido-A. Emojis, cirílico o CJK saldrían
// como cuadraditos: se limpian antes de dibujar (las reseñas vienen llenas de
// emojis y alguna en eslovaco o búlgaro).
function limpiar(s) {
  return String(s || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^ -ſ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${y}`;
}

// "1 de julio de 2026 – 31 de julio de 2026" se lee mal en una portada:
// si el rango es un mes entero o cae dentro del mismo mes, se compacta.
function rangoTexto(desde, hasta) {
  if (!desde && !hasta) return 'Histórico completo';
  if (desde && !hasta) return 'Desde el ' + fechaLarga(desde);
  if (!desde && hasta) return 'Hasta el ' + fechaLarga(hasta);
  const [ay, am, ad] = desde.split('-').map(Number);
  const [by, bm, bd] = hasta.split('-').map(Number);
  if (ay === by && am === bm) {
    const ultimo = new Date(Date.UTC(by, bm, 0)).getUTCDate();
    if (ad === 1 && bd === ultimo) return MESES[am - 1].replace(/^./, (c) => c.toUpperCase()) + ' de ' + ay;
    return `${ad} – ${bd} de ${MESES[am - 1]} de ${ay}`;
  }
  return fechaLarga(desde) + ' – ' + fechaLarga(hasta);
}

function num(n) {
  return new Intl.NumberFormat('es-ES').format(Number(n) || 0);
}

// Estrella vectorial: ni Montserrat ni las fuentes internas traen el glifo ★.
function estrella(doc, cx, cy, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  doc.save().moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach((p) => doc.lineTo(p[0], p[1]));
  doc.closePath().fill(color).restore();
}

function estrellas(doc, x, y, n, r, color) {
  for (let i = 0; i < n; i++) estrella(doc, x + i * (r * 2.4), y, r, color);
  return x + n * (r * 2.4);
}

function saltoSiHaceFalta(doc, alto) {
  if (doc.y + alto > BOTTOM) doc.addPage();
}

function bandaTitulo(doc, subtitulo) {
  doc.rect(0, 0, A4.w, 74).fill(COLOR.banda);
  doc.fillColor('#ffffff').font(F.bold).fontSize(15).text('PIZZERÍA POPULAR', M, 22);
  doc.font(F.reg).fontSize(9).fillColor('#b9b9c4').text(limpiar(subtitulo), M, 45);
  doc.fillColor(COLOR.texto);
  doc.y = 104;
}

// 50 → "50", 50.5 → "50,5"
function puntosTxt(p) {
  if (p === null || p === undefined) return '';
  return (Number.isInteger(p) ? String(p) : p.toFixed(1)).replace('.', ',');
}

function kpi(doc, x, y, w, valor, etiqueta) {
  doc.roundedRect(x, y, w, 58, 8).fill(COLOR.fondo);
  doc.fillColor(COLOR.texto).font(F.bold).fontSize(19).text(valor, x, y + 11, { width: w, align: 'center' });
  doc.fillColor(COLOR.suave).font(F.reg).fontSize(8).text(limpiar(etiqueta), x, y + 37, { width: w, align: 'center' });
}

// ---- Ranking del equipo, con barra proporcional al primero ----
function ranking(doc, empleados) {
  const max = empleados.reduce((a, e) => Math.max(a, e.menciones), 0) || 1;
  // A la derecha de la barra: reseñas que la nombran y, si el informe trae la
  // regla de la comisión, los puntos a pagar (compartidas a 0,5).
  const conPuntos = empleados.some((e) => e.puntos !== undefined);
  const anchoBarra = CONTENT_W - (conPuntos ? 262 : 190);
  empleados.forEach((e, i) => {
    saltoSiHaceFalta(doc, 30);
    const y = doc.y;
    doc.fillColor(COLOR.gris).font(F.bold).fontSize(9).text(String(i + 1), M, y + 5, { width: 16 });
    doc.fillColor(COLOR.texto).font(F.bold).fontSize(11).text(limpiar(e.nombre), M + 20, y + 3, { width: 108, ellipsis: true });
    const x0 = M + 132;
    doc.roundedRect(x0, y + 5, anchoBarra, 13, 6).fill(COLOR.fondo);
    const w = Math.max(6, Math.round(anchoBarra * (e.menciones / max)));
    doc.roundedRect(x0, y + 5, w, 13, 6).fill(i === 0 ? COLOR.dorado : '#3d3d48');
    doc.fillColor(COLOR.texto).font(F.bold).fontSize(10.5)
      .text(num(e.menciones), x0 + anchoBarra + 10, y + 5, { width: 40, align: 'right' });
    if (conPuntos) {
      doc.fillColor(COLOR.suave).font(F.bold).fontSize(9)
        .text(limpiar(puntosTxt(e.puntos) + ' a pagar'), x0 + anchoBarra + 56, y + 6, { width: 70, align: 'right' });
    }
    doc.y = y + 26;
  });
}

// ---- Ficha de una persona: cabecera + sus frases ----
function fichaEmpleado(doc, e, informe, opts) {
  if (opts && opts.nuevaPagina) doc.addPage();

  // En el informe individual la portada ya dice de quién es: la tarjeta negra
  // repetiría el nombre, el local y el período tres líneas más abajo.
  if (!opts || opts.cabecera !== false) {
    const y0 = doc.y;
    doc.roundedRect(M, y0, CONTENT_W, 70, 10).fill(COLOR.banda);
    doc.fillColor('#ffffff').font(F.bold).fontSize(20).text(limpiar(e.nombre), M + 18, y0 + 15, { width: CONTENT_W - 150 });
    doc.font(F.reg).fontSize(9).fillColor('#b9b9c4')
      .text(limpiar(informe.local + ' · ' + rangoTexto(informe.desde, informe.hasta)), M + 18, y0 + 42, { width: CONTENT_W - 150 });
    doc.fillColor(COLOR.dorado).font(F.bold).fontSize(26)
      .text(num(e.menciones), M + CONTENT_W - 132, y0 + 12, { width: 114, align: 'right' });
    doc.fillColor('#b9b9c4').font(F.reg).fontSize(8)
      .text(e.menciones === 1 ? 'mención en reseñas' : 'menciones en reseñas', M + CONTENT_W - 132, y0 + 45, { width: 114, align: 'right' });
    if (e.puntos !== undefined) {
      doc.fillColor(COLOR.dorado).font(F.bold).fontSize(8)
        .text(limpiar(puntosTxt(e.puntos) + ' a pagar  ·  ' + e.solas + ' sola' + (e.solas === 1 ? '' : 's') + ' + ' + e.compartidas + ' compartida' + (e.compartidas === 1 ? '' : 's')),
          M + CONTENT_W - 262, y0 + 56, { width: 244, align: 'right' });
    }
    doc.y = y0 + 84;
  }

  // Promedio + reparto por estrellas.
  if (e.promedio) {
    const y = doc.y;
    doc.fillColor(COLOR.texto).font(F.bold).fontSize(11)
      .text(String(e.promedio).replace('.', ','), M, y, { continued: false, width: 30 });
    const xFin = estrellas(doc, M + 38, y + 6, Math.round(e.promedio), 5.5, COLOR.dorado);
    const reparto = [5, 4, 3, 2, 1].filter((s) => e.estrellas[s])
      .map((s) => e.estrellas[s] + ' de ' + s + (s === 1 ? ' estrella' : ' estrellas')).join('  ·  ');
    doc.fillColor(COLOR.suave).font(F.reg).fontSize(9).text(limpiar(reparto), xFin + 14, y + 1, { width: CONTENT_W - (xFin - M) - 14 });
    doc.y = y + 30;
  }

  if (!e.frases.length) return;
  doc.fillColor(COLOR.suave).font(F.bold).fontSize(9)
    .text(limpiar('LO QUE ESCRIBIERON LOS CLIENTES'), M, doc.y);
  doc.y += 12;

  e.frases.forEach((f) => {
    const texto = limpiar(f.texto);
    if (!texto) return;
    doc.font(F.reg).fontSize(9.5);
    const altoTexto = doc.heightOfString(texto, { width: CONTENT_W - 28 });
    saltoSiHaceFalta(doc, altoTexto + 34);
    const y = doc.y;
    doc.rect(M, y, 3, altoTexto + 20).fill(COLOR.dorado);
    doc.fillColor(COLOR.suave).font(F.bold).fontSize(8)
      .text(limpiar((f.autor || 'Cliente') + '  ·  ' + fechaLarga(f.fecha) +
        (informe.local_id ? '' : '  ·  ' + f.local) +
        (f.otros && f.otros.length ? '  ·  compartida con ' + f.otros.join(', ') + ' (vale 0,5)' : '')), M + 14, y + 1, { width: CONTENT_W - 90 });
    estrellas(doc, M + CONTENT_W - 62, y + 5, f.estrellas || 5, 4.2, COLOR.dorado);
    doc.fillColor(COLOR.texto).font(F.reg).fontSize(9.5)
      .text(texto, M + 14, y + 14, { width: CONTENT_W - 28 });
    doc.y = y + altoTexto + 26;
  });
}

function pies(doc, informe) {
  const rango = doc.bufferedPageRange();
  const hoy = fechaLarga(new Date().toISOString());
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // pdfkit agrega una hoja en blanco por cada pie si el margen inferior no se
    // anula antes de escribir tan abajo.
    doc.page.margins.bottom = 0;
    doc.moveTo(M, A4.h - 46).lineTo(A4.w - M, A4.h - 46).lineWidth(0.5).stroke(COLOR.linea);
    doc.fillColor(COLOR.gris).font(F.reg).fontSize(7.5)
      .text(limpiar('Pizzería Popular · ' + informe.local + ' · menciones en reseñas de Google · generado el ' + hoy),
        M, A4.h - 38, { width: CONTENT_W - 40 });
    doc.fillColor(COLOR.gris).font(F.reg).fontSize(7.5)
      .text(String(i + 1) + '/' + rango.count, A4.w - M - 40, A4.h - 38, { width: 40, align: 'right' });
  }
}

/**
 * @param {object} informe - salida de lib/menciones.js
 * @param {object} opts - { personal: bool }
 * @returns {Promise<Buffer>}
 */
function generar(informe, opts = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true });
    registrarFuentes(doc);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const personal = !!opts.personal && informe.empleados.length === 1;

    if (personal) {
      const e = informe.empleados[0];
      bandaTitulo(doc, 'Reseñas de Google · reconocimiento al equipo');
      doc.fillColor(COLOR.texto).font(F.display).fontSize(36)
        .text(limpiar(e.nombre), M, doc.y, { width: CONTENT_W });
      doc.moveDown(0.25);
      doc.font(F.bold).fontSize(13).fillColor(COLOR.texto)
        .text(limpiar('Te nombraron en ' + num(e.menciones) +
          (e.menciones === 1 ? ' reseña' : ' reseñas') + ' de Google'), { width: CONTENT_W });
      doc.moveDown(0.15);
      doc.font(F.reg).fontSize(11).fillColor(COLOR.suave)
        .text(limpiar(informe.local + ' · ' + rangoTexto(informe.desde, informe.hasta)), { width: CONTENT_W });
      doc.moveDown(1.1);
      fichaEmpleado(doc, e, informe, { nuevaPagina: false, cabecera: false });
      pies(doc, informe);
      doc.end();
      return;
    }

    // ---- Portada del equipo ----
    bandaTitulo(doc, 'Reseñas de Google · menciones al equipo');
    doc.fillColor(COLOR.texto).font(F.display).fontSize(30)
      .text(limpiar(informe.local), M, doc.y, { width: CONTENT_W });
    doc.moveDown(0.25);
    doc.font(F.reg).fontSize(12).fillColor(COLOR.suave)
      .text(limpiar(rangoTexto(informe.desde, informe.hasta)), { width: CONTENT_W });
    doc.moveDown(1.2);

    const t = informe.totales;
    const anchoKpi = (CONTENT_W - 20) / 3;
    const yk = doc.y;
    kpi(doc, M, yk, anchoKpi, num(t.resenas), 'reseñas del período');
    kpi(doc, M + anchoKpi + 10, yk, anchoKpi, num(t.conTexto), 'con texto escrito');
    kpi(doc, M + (anchoKpi + 10) * 2, yk, anchoKpi, num(t.conNombre), 'nombran a alguien del equipo');
    doc.y = yk + 78;

    if (!informe.empleados.length) {
      doc.fillColor(COLOR.suave).font(F.reg).fontSize(11)
        .text('En este período nadie del equipo aparece nombrado por su nombre en las reseñas.', M, doc.y, { width: CONTENT_W });
      pies(doc, informe);
      doc.end();
      return;
    }

    const conPuntos = t.puntos !== undefined;
    doc.fillColor(COLOR.texto).font(F.bold).fontSize(13)
      .text(limpiar('Ranking de menciones' + (conPuntos ? '  ·  ' + puntosTxt(t.puntos) + ' puntos a pagar en total' : '')), M, doc.y);
    doc.y += 14;
    ranking(doc, informe.empleados);

    doc.moveDown(0.8);
    saltoSiHaceFalta(doc, 58);
    doc.fillColor(COLOR.gris).font(F.reg).fontSize(8)
      .text(limpiar('Se cuenta una vez por reseña, aunque el nombre aparezca varias veces en el texto. Se unifican las formas en que ' +
        'la gente escribe cada nombre (con y sin K, con y sin H, apodo o nombre completo, letras repetidas). ' +
        (conPuntos ? 'Para la comisión: una reseña que nombra a una sola persona vale 1 punto; si nombra a dos o más, vale 0,5 para cada una ' +
        '(' + num(t.compartidas || 0) + ' reseñas compartidas en este período). ' : '') +
        'Las páginas siguientes traen, por persona, lo que escribieron los clientes.'), M, doc.y, { width: CONTENT_W });

    informe.empleados.forEach((e) => fichaEmpleado(doc, e, informe, { nuevaPagina: true }));
    pies(doc, informe);
    doc.end();
  });
}

// Nombre de archivo para el navegador: sin tildes ni caracteres raros.
function nombreArchivo(informe, personal) {
  const quien = personal && informe.empleados[0] ? informe.empleados[0].nombre : 'equipo';
  const base = 'Menciones ' + quien + ' - ' + informe.local + ' - ' + rangoTexto(informe.desde, informe.hasta);
  return base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s.-]/g, '').replace(/\s+/g, ' ').trim() + '.pdf';
}

module.exports = { generar, nombreArchivo, rangoTexto };
