// ============================================================
// lib/informe-verificacion.js — Doble chequeo de los números del informe.
//
// El informe saca TODO de una sola función SQL (pp_informe_semanal). Si esa
// función tuviera un error de rango, de join o de redondeo, el PDF saldría
// prolijo y equivocado, y nadie se daría cuenta. Este módulo recalcula lo
// mismo por OTRO camino (consultas separadas, agregación en JavaScript) y
// compara campo por campo, más una batería de chequeos de coherencia.
//
// Se corre ANTES de enviar: si algo da ERROR, ese local no se manda.
// Los AVISOS no frenan el envío (son cosas para mirar, no defectos del dato).
// ============================================================
const { supabaseAdmin } = require('./supabase');

const BEBIDAS = ['Bebidas sin alcohol', 'Cervezas', 'Tragos', 'Vinos', 'Jarras', 'Cafe / Infusiones'];
const CENT = 0.01; // tolerancia: los euros se comparan al céntimo

const sumar = (filas, campo) => filas.reduce((a, r) => a + Number(r[campo] || 0), 0);
const dia = (d1, n) => {
  const d = new Date(d1 + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Trae TODAS las filas paginando: PostgREST corta en 1000 aunque pidas más
// (ya nos mordió antes en la analítica de visitas).
async function todas(tabla, columnas, filtrar) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtrar(
      supabaseAdmin.from(tabla).select(columnas).range(desde, desde + 999),
    );
    if (error) throw new Error(tabla + ': ' + error.message);
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

async function verificar(slug, wp, d1, rpc) {
  const d7 = dia(d1, 6);
  const errores = [];
  const avisos = [];
  const ok = [];
  const chequear = (cond, etiqueta, detalle, grave = true) => {
    if (cond) ok.push(etiqueta);
    else (grave ? errores : avisos).push(etiqueta + ': ' + detalle);
  };
  const igual = (a, b, tol = CENT) => Math.abs(Number(a) - Number(b)) <= tol;
  const num = (v) => Number(v || 0);

  // ---- 1. Días: recálculo independiente sobre las filas crudas ----
  const dias = await todas('agora_ventas_dias',
    'business_day,total_bruto,total_neto,facturas,comensales,costo_total,updated_at',
    (q) => q.eq('workplace_id', wp).gte('business_day', d1).lte('business_day', d7));

  const fechas = dias.map((r) => r.business_day).sort();
  chequear(dias.length === 7, 'Cobertura de la semana',
    'hay ' + dias.length + ' días cargados en vez de 7 (' + fechas.join(', ') + ')');
  chequear(new Set(fechas).size === fechas.length, 'Sin días duplicados',
    'el TPV tiene el mismo día cargado dos veces');
  chequear(fechas[0] === d1 && fechas[fechas.length - 1] === d7, 'Rango correcto',
    'va de ' + fechas[0] + ' a ' + fechas[fechas.length - 1] + ', se esperaba ' + d1 + ' a ' + d7);

  chequear(igual(sumar(dias, 'total_bruto'), rpc.sem.bruto), 'Facturación de la semana',
    'recalculada ' + sumar(dias, 'total_bruto').toFixed(2) + ' vs informe ' + num(rpc.sem.bruto).toFixed(2));
  chequear(igual(sumar(dias, 'comensales'), rpc.sem.comensales, 0), 'Comensales',
    'recalculados ' + sumar(dias, 'comensales') + ' vs informe ' + rpc.sem.comensales);
  chequear(igual(sumar(dias, 'facturas'), rpc.sem.facturas, 0), 'Facturas',
    'recalculadas ' + sumar(dias, 'facturas') + ' vs informe ' + rpc.sem.facturas);
  chequear(igual(sumar(dias, 'costo_total'), rpc.sem.costo), 'Costo de mercadería',
    'recalculado ' + sumar(dias, 'costo_total').toFixed(2) + ' vs informe ' + num(rpc.sem.costo).toFixed(2));
  chequear(igual(sumar(dias, 'total_neto'), rpc.sem.neto), 'Venta neta',
    'recalculada ' + sumar(dias, 'total_neto').toFixed(2) + ' vs informe ' + num(rpc.sem.neto).toFixed(2));

  // La tabla del PDF muestra un día por fila: tienen que coincidir uno a uno.
  const porFecha = Object.fromEntries(dias.map((r) => [r.business_day, r]));
  const diasMal = (rpc.dias || []).filter((r) => !porFecha[r.dia]
    || !igual(porFecha[r.dia].total_bruto, r.bruto)
    || Number(porFecha[r.dia].comensales) !== Number(r.comensales));
  chequear(diasMal.length === 0, 'Detalle día a día',
    diasMal.length + ' día(s) no coinciden con el TPV');

  // ---- 2. Divisiones peligrosas ----
  chequear(dias.every((r) => Number(r.comensales) > 0), 'Comensales por día',
    'algún día tiene 0 comensales y el € por comensal quedaría en infinito');
  chequear(num(rpc.sem.facturas) > 0 && num(rpc.sem.comensales) > 0, 'Divisores del resumen',
    'facturas o comensales en cero');
  chequear(num(rpc.sem.neto) > 0, 'Venta neta positiva', 'la venta neta es cero o negativa');

  // ---- 3. Costo y margen dentro de lo posible ----
  const costoPct = 100 * num(rpc.sem.costo) / num(rpc.sem.neto);
  chequear(costoPct > 0 && costoPct < 100, 'Costo entre 0% y 100%',
    'da ' + costoPct.toFixed(1) + '%, es imposible');
  chequear(costoPct >= 12 && costoPct <= 40, 'Costo en rango razonable',
    'da ' + costoPct.toFixed(1) + '%, fuera del 12-40% habitual: revisar escandallos', false);

  // ---- 4. Productos: recálculo independiente ----
  const prods = await todas('agora_ventas_productos',
    'business_day,product_name,family_name,cantidad,total_bruto,costo',
    (q) => q.eq('workplace_id', wp).gte('business_day', d1).lte('business_day', d7));

  const brutoProdReal = sumar(prods, 'total_bruto');
  const brutoProdRpc = sumar(rpc.familias || [], 'bruto');
  chequear(igual(brutoProdReal, brutoProdRpc, 0.05), 'Total por familias',
    'recalculado ' + brutoProdReal.toFixed(2) + ' vs informe ' + brutoProdRpc.toFixed(2));

  // Los % de participación se calculan sobre la venta de PRODUCTOS, pero el
  // titular del informe sale de la tabla de DÍAS: si difieren mucho, los
  // porcentajes no se leen sobre la misma torta que el número grande.
  const desvio = 100 * Math.abs(brutoProdReal - num(rpc.sem.bruto)) / num(rpc.sem.bruto);
  chequear(desvio <= 5, 'Productos vs total del día',
    'la venta por productos difiere ' + desvio.toFixed(1) + '% del total diario ('
    + brutoProdReal.toFixed(0) + ' vs ' + num(rpc.sem.bruto).toFixed(0) + ')', desvio > 15);

  // Participaciones: recalculadas a mano contra las del informe.
  const grupoReal = (f) => 100 * sumar(prods.filter(f), 'total_bruto') / brutoProdReal;
  const grupoRpc = (f) => 100 * sumar((rpc.familias || []).filter(f), 'bruto') / brutoProdRpc;
  const grupos = [
    ['Bebidas', (r) => BEBIDAS.includes(r.family_name)],
    ['Entrantes', (r) => r.family_name === 'Entrantes'],
    ['Postres', (r) => r.family_name === 'Postres'],
  ];
  for (const [nombre, filtro] of grupos) {
    chequear(igual(grupoReal(filtro), grupoRpc(filtro), 0.05), 'Participación de ' + nombre,
      'recalculada ' + grupoReal(filtro).toFixed(2) + '% vs informe ' + grupoRpc(filtro).toFixed(2) + '%');
  }

  // Top 10: que sea realmente el top y que los márgenes tengan sentido.
  const porProducto = {};
  for (const r of prods) {
    const k = r.product_name + '|' + r.family_name;
    porProducto[k] = porProducto[k] || { bruto: 0, uds: 0, costo: 0 };
    porProducto[k].bruto += num(r.total_bruto);
    porProducto[k].uds += num(r.cantidad);
    porProducto[k].costo += num(r.costo);
  }
  const topReal = Object.entries(porProducto)
    .filter(([k]) => ['Para Llevar', ''].indexOf(k.split('|')[1]) === -1)
    .sort((a, b) => b[1].bruto - a[1].bruto).slice(0, 10);
  const topMal = (rpc.top || []).filter((p, i) => {
    const esperado = topReal[i];
    return !esperado || esperado[0] !== p.product_name + '|' + p.family_name
      || !igual(esperado[1].bruto, p.bruto, 0.05);
  });
  chequear(topMal.length === 0, 'Top 10 de productos',
    topMal.length + ' fila(s) no coinciden con el recálculo');
  const margenRaro = (rpc.top || []).filter((p) => num(p.costo) > num(p.bruto));
  chequear(margenRaro.length === 0, 'Márgenes posibles',
    margenRaro.length + ' producto(s) con costo mayor que la venta: '
    + margenRaro.map((p) => p.product_name).join(', '), false);

  // ---- 5. Ideales ----
  if (rpc.ideales) {
    const vals = [rpc.ideales.beb, rpc.ideales.ent, rpc.ideales.pos].map(Number);
    chequear(vals.every((v) => Number.isNaN(v) || (v >= 0 && v <= 100)), 'Ideales en rango',
      'alguno cae fuera de 0-100: ' + vals.join(' / '));
    chequear(vals.every((v) => !Number.isNaN(v)), 'Ideales calculados',
      'faltan semanas completas en los últimos 12 meses para calcularlos', false);
  }

  // ---- 6. Comparativas ----
  const ant = await todas('agora_ventas_dias', 'business_day,total_bruto',
    (q) => q.eq('workplace_id', wp).gte('business_day', dia(d1, -7)).lte('business_day', dia(d1, -1)));
  chequear(igual(sumar(ant, 'total_bruto'), num(rpc.ant.bruto)), 'Semana anterior',
    'recalculada ' + sumar(ant, 'total_bruto').toFixed(2) + ' vs informe ' + num(rpc.ant.bruto).toFixed(2));
  chequear(ant.length === 7, 'Semana anterior completa',
    'tiene ' + ant.length + ' días: el "vs. semana anterior" compara contra una semana incompleta', false);

  const anio = await todas('agora_ventas_dias', 'business_day,total_bruto',
    (q) => q.eq('workplace_id', wp).gte('business_day', dia(d1, -364)).lte('business_day', dia(d1, -358)));
  chequear(igual(sumar(anio, 'total_bruto'), num(rpc.anio.bruto)), 'Misma semana del año pasado',
    'recalculada ' + sumar(anio, 'total_bruto').toFixed(2) + ' vs informe ' + num(rpc.anio.bruto).toFixed(2));
  if (anio.length) {
    const hoyDow = new Date(d1 + 'T12:00:00Z').getUTCDay();
    const anteDow = new Date(dia(d1, -364) + 'T12:00:00Z').getUTCDay();
    chequear(hoyDow === anteDow, 'Interanual alineado por día',
      'la semana del año pasado no arranca el mismo día de la semana');
  }

  // ---- 7. Reseñas ----
  const res = await todas('pp_resenas_google', 'fecha_resena,estrellas',
    (q) => q.eq('local_id', slug).gte('fecha_resena', d1).lt('fecha_resena', dia(d1, 7)));
  chequear(res.length === Number(rpc.resenas.n), 'Cantidad de reseñas',
    'recalculadas ' + res.length + ' vs informe ' + rpc.resenas.n);
  if (res.length) {
    const nota = res.reduce((a, r) => a + Number(r.estrellas), 0) / res.length;
    chequear(igual(nota, num(rpc.resenas.nota), 0.01), 'Nota media',
      'recalculada ' + nota.toFixed(2) + ' vs informe ' + num(rpc.resenas.nota).toFixed(2));
    chequear(res.every((r) => Number(r.estrellas) >= 1 && Number(r.estrellas) <= 5), 'Estrellas válidas',
      'hay reseñas con estrellas fuera de 1-5');
    const negativas = res.filter((r) => Number(r.estrellas) <= 3).length;
    chequear(negativas === Number(rpc.resenas.neg), 'Reseñas negativas',
      'recalculadas ' + negativas + ' vs informe ' + rpc.resenas.neg);
  }

  // ---- 8. Frescura: el TPV tiene que haber sincronizado DESPUÉS del cierre ----
  const ultimoSync = dias.map((r) => r.updated_at).sort().pop();
  chequear(!!ultimoSync && new Date(ultimoSync) > new Date(d7 + 'T00:00:00Z'), 'Datos sincronizados',
    'la última sincronización del TPV es del ' + ultimoSync + ', anterior al cierre de la semana');

  return { local: slug, semana: d1, ok: errores.length === 0, errores, avisos, pasados: ok.length };
}

module.exports = { verificar };
