/*  Snapshot de datos de marketing para el repo de marca
 *  ────────────────────────────────────────────────────────────────────────
 *  Lo corre SANTI, acá. Escribe JSON en pizzeria-popular-brand/datos/ para que
 *  el Claude del equipo pueda usar datos REALES en las piezas sin tener acceso
 *  a la base.
 *
 *      node scripts/snapshot-marca.js
 *
 *  REGLA DURA: de acá no sale ni un euro. Nada de total_bruto, total_neto,
 *  costo, costo_total, propinas, facturas ni pagos. Solo unidades, personas,
 *  horarios y texto de reseñas — todo publicable.
 *
 *  Credenciales: DATABASE_URL de habit-tracker (pooler). Nunca viajan al repo.
 */
const path = require('path');
const fs = require('fs');
// pg vive en habit-tracker (es el que habla con la base de AJAX), no acá.
const { Client } = require('C:/Dev/habit-tracker/node_modules/pg');

require('dotenv').config({ path: 'C:/Dev/habit-tracker/.env' });

const DESTINO = 'C:/Users/pigui/Documents/01-Clientes/pizzeria-popular-brand/datos';

// Ágora nombra los locales distinto que la marca. "Popular Valencia" es Russafa.
// Boadilla queda FUERA: no es uno de los cinco que comunicamos.
const LOCALES = {
  '1': 'playa-san-juan',
  '2': 'russafa',
  '3': 'luceros',
  '5': 'santa-clara',
  '6': 'benidorm',
};
const NOMBRE = {
  'luceros': 'Luceros', 'playa-san-juan': 'Playa San Juan',
  'russafa': 'Russafa', 'santa-clara': 'Santa Clara', 'benidorm': 'Benidorm',
};

const conexion = () => {
  const u = process.env.DATABASE_URL
    .replace(/db\.([a-z]+)\.supabase\.co/, 'aws-1-eu-west-1.pooler.supabase.com')
    .replace('postgres:', 'postgres.zaoaxkewnratzenklyth:');
  return new Client({ connectionString: u, ssl: { rejectUnauthorized: false } });
};

/* Google pega su traducción al final del texto original, y a veces la pone
 * primero. Si esto no se limpia, termina impreso "(Translated by Google)" en
 * una placa. Nos quedamos con el tramo en el idioma original. */
const limpiar = t => {
  if (!t) return '';
  let s = t.split(/\(Translated by Google\)/i)[0];
  s = s.replace(/\(Original\)/i, '').replace(/\s+/g, ' ').trim();
  return s;
};

/* La marca firma las reseñas como "Tomás A.", no con el nombre completo. */
const firmar = n => {
  if (!n) return null;
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0] : `${p[0]} ${p[1][0].toUpperCase()}.`;
};

const mes = d => d.toISOString().slice(0, 7);

(async () => {
  const c = conexion();
  await c.connect();
  fs.mkdirSync(DESTINO, { recursive: true });
  const ids = Object.keys(LOCALES);
  const hoy = new Date().toISOString().slice(0, 10);

  // ── 1. Productos: SOLO unidades ─────────────────────────────────────────
  const prod = await c.query(`
    select workplace_id, to_char(business_day,'YYYY-MM') mes,
           product_name, family_name, sum(cantidad)::int unidades
      from agora_ventas_productos
     where workplace_id = any($1)
       and business_day >= (current_date - interval '13 months')
     group by 1,2,3,4
     having sum(cantidad) >= 5
     order by 1,2,5 desc`, [ids]);

  const productos = {};
  for (const r of prod.rows) {
    const l = LOCALES[r.workplace_id];
    ((productos[l] ??= {})[r.mes] ??= []).push({
      producto: r.product_name, familia: r.family_name, unidades: r.unidades,
    });
  }
  for (const l in productos)
    for (const m in productos[l]) productos[l][m] = productos[l][m].slice(0, 40);

  // ── 2. Volumen por familia y por mes (los números grandes de las placas) ──
  const fam = await c.query(`
    select workplace_id, to_char(business_day,'YYYY-MM') mes,
           family_name, sum(cantidad)::int unidades
      from agora_ventas_productos
     where workplace_id = any($1)
       and business_day >= (current_date - interval '13 months')
     group by 1,2,3 order by 1,2`, [ids]);

  const familias = {};
  for (const r of fam.rows)
    ((familias[LOCALES[r.workplace_id]] ??= {})[r.mes] ??= {})[r.family_name] = r.unidades;

  // ── 3. Comensales: personas atendidas. NADA de facturación ───────────────
  const com = await c.query(`
    select workplace_id, to_char(business_day,'YYYY-MM') mes,
           sum(comensales)::int comensales, count(*)::int dias_abierto
      from agora_ventas_dias
     where workplace_id = any($1)
       and business_day >= (current_date - interval '13 months')
     group by 1,2 order by 1,2`, [ids]);

  const comensales = {};
  for (const r of com.rows)
    (comensales[LOCALES[r.workplace_id]] ??= {})[r.mes] =
      { comensales: r.comensales, dias_abierto: r.dias_abierto };

  // ── 4. Franjas: cuándo come la gente (sirve para saber cuándo publicar) ──
  // Ojo: en esta tabla `hora` ya es un entero y workplace_id es bigint (en las
  // otras es texto). La métrica publicable es `tickets`, no total_bruto.
  const fr = await c.query(`
    select workplace_id, hora, sum(tickets)::int tickets
      from agora_ventas_horas
     where workplace_id = any($1)
       and business_day >= (current_date - interval '3 months')
     group by 1,2 order by 1,2`, [ids.map(Number)]);

  const franjas = {};
  for (const r of fr.rows)
    (franjas[LOCALES[String(r.workplace_id)]] ??= {})[r.hora] = r.tickets;

  // ── 5. Reseñas citables ──────────────────────────────────────────────────
  const res = await c.query(`
    select local_id, cliente_nombre, estrellas, texto_original, fecha_resena
      from pp_resenas_google
     where estrellas = 5
       and texto_original is not null
       and fecha_resena >= (current_date - interval '6 months')
       and local_id = any($1)
     order by fecha_resena desc`, [Object.values(LOCALES)]);

  const resenas = {};
  for (const r of res.rows) {
    const t = limpiar(r.texto_original);
    // En una placa entran cómodas entre 60 y 220 caracteres.
    if (t.length < 60 || t.length > 220) continue;
    const l = (resenas[r.local_id] ??= []);
    if (l.length >= 25) continue;
    l.push({
      texto: t,
      firma: firmar(r.cliente_nombre),
      local: NOMBRE[r.local_id],
      fecha: r.fecha_resena.toISOString().slice(0, 10),
      mes: r.fecha_resena.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    });
  }

  const escribir = (f, o) =>
    fs.writeFileSync(path.join(DESTINO, f), JSON.stringify(o, null, 1), 'utf8');

  const cabecera = { generado: hoy, fuente: 'Ágora (TPV) vía Supabase, solo lectura' };

  escribir('productos.json', { ...cabecera,
    nota: 'Unidades vendidas. Top 40 productos por local y mes, mínimo 5 unidades.', productos });
  escribir('familias.json', { ...cabecera,
    nota: 'Unidades por categoría de carta y mes. De acá salen los números grandes.', familias });
  escribir('comensales.json', { ...cabecera,
    nota: 'Personas atendidas y días abierto por mes.', comensales });
  escribir('franjas.json', { ...cabecera,
    nota: 'Tickets por hora de cobro, últimos 3 meses. ⚠️ Es la hora del COBRO, no la de llegada: una mesa que llegó 21h y pagó 23h cuenta a las 23h.', franjas });
  escribir('resenas.json', { ...cabecera,
    nota: 'Reseñas 5★ de los últimos 6 meses, listas para citar. Texto ya limpio de la traducción de Google y firma en formato de marca.', resenas });

  console.log('Snapshot escrito en', DESTINO);
  for (const [f, n] of [
    ['productos', Object.keys(productos).length], ['familias', Object.keys(familias).length],
    ['comensales', Object.keys(comensales).length], ['franjas', Object.keys(franjas).length],
    ['resenas', Object.values(resenas).reduce((a, b) => a + b.length, 0)],
  ]) console.log(`  ${f}: ${n}`);

  await c.end();
})();
