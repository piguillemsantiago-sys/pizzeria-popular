// Informe de Dirección: lo que solo se ve mirando los cinco locales juntos.
// Uso: node scripts/build-informe-direccion.js <YYYY-MM>
//
// No repite lo que ya dice el informe de cada local. Responde tres preguntas de
// marca: qué pide la gente y no encuentra, qué nos reconocen, y qué problemas no
// puede resolver un local solo.
//
// Fuentes: los datos-<local>.json del mes + reseñas, consultas a Pepe y búsquedas
// de la carta digital (Supabase). Un "tema" solo se reporta si supera un piso:
// aparecer en 3+ locales o 8+ veces. Dos menciones sueltas no son un tema.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../lib/supabase');
const { textoOriginal } = require('../lib/menciones');
const { CSS } = require('./informe-css');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LOCALES = {
  'playa-san-juan': 'Playa San Juan', 'luceros': 'Luceros', 'benidorm': 'Benidorm',
  'russafa': 'Russafa', 'santa-clara': 'Santa Clara',
};
const ACCIONES = ['llamadas', 'clicks_web', 'como_llegar', 'reservas', 'clicks_menu', 'chats', 'pedidos_comida'];

const fmt = (n) => (n === null || n === undefined || Number.isNaN(Number(n))) ? '—'
  : String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const coma = (n) => String(n).replace('.', ',');

// ---------------- diccionarios ----------------
// tipo: 'reconocimiento' = el cliente lo nombra como algo bueno.
//       'vigilar'        = cuando aparece, es una molestia — aunque la reseña
//                          tenga buena nota (pasa: se ponen 5★ y igual se quejan).
const TEMAS_RESENA = {
  'La milanesa': { tipo: 'reconocimiento', claves: ['milanesa', 'milanga'] },
  'Las porciones / la cantidad': { tipo: 'reconocimiento', claves: ['porcion', 'porción', 'porciones', 'cantidad', 'abundante', 'generosa', 'raciones'] },
  'La terraza': { tipo: 'reconocimiento', claves: ['terraza', 'terrace'] },
  'Las empanadas': { tipo: 'reconocimiento', claves: ['empanada'] },
  'El calor / el aire': { tipo: 'vigilar', claves: ['calor', 'sofocante', 'bochorno', 'aire acondicionado', 'climatiza', 'too hot', 'air conditioning'] },
  'El precio': { tipo: 'vigilar', claves: ['caro', 'carísimo', 'sobreprecio', 'estafa', 'expensive', 'overpriced'] },
  'La espera': { tipo: 'vigilar', claves: ['esperamos', 'esperando', 'tardaron', 'demora', 'lentos', 'muy lenta', 'long wait', 'waited'] },
};
const TEMAS_PEPE = {
  'Promociones del día': ['promo', 'oferta', 'descuento', '2x1', 'menu del dia', 'menú del día'],
  'La carta y los precios': ['carta', 'menu', 'menú', 'precio', 'cuanto sale', 'cuanto cuesta', 'price', 'tamaño', 'centimetro', 'centímetro'],
  'Reservar mesa': ['reserv', 'mesa para', 'book', 'table for'],
  'Sin gluten': ['gluten', 'celiac', 'celíac'],
  'Delivery / a domicilio': ['domicilio', 'delivery', 'llevar', 'take away', 'reparto', 'entrega'],
  'Grupos y eventos': ['grupo', 'cumpleaños', 'evento', 'celebrac', 'despedida'],
};
const FAMILIAS_BUSQUEDA = {
  'Sin gluten': ['gluten', 'celiac'],
  'Milanesa': ['milanesa', 'milanga'],
  'Promos / menú del día': ['promo', 'menu', 'menú', 'oferta'],
  'Carne': ['carne', 'pollo', 'lomo'],
  'Faina': ['faina', 'fayna'],
  'Empanadas': ['empanada'],
};
const RUIDO = /ignore all previous|select |script>|http/i;

// ---------------- datos ----------------
const periodo = process.argv[2] || '2026-07';
const [Y, M] = periodo.split('-').map(Number);
const MES = MESES[M - 1], ANIO = String(Y);
const MES_SIG = MESES[M % 12];
const ini = `${periodo}-01`;
const fin = new Date(Date.UTC(Y, M, 1)).toISOString().slice(0, 10);
const DIR = path.join(__dirname, '..', 'informes', periodo);
// Solo entran los locales con datos del mes (un local cerrado no tiene informe).
Object.keys(LOCALES).forEach((slug) => {
  if (!fs.existsSync(path.join(DIR, `datos-${slug}.json`))) delete LOCALES[slug];
});

function cargarLocales() {
  const out = {};
  for (const slug of Object.keys(LOCALES)) {
    const f = path.join(DIR, `datos-${slug}.json`);
    if (fs.existsSync(f)) out[slug] = JSON.parse((function (s) { s = String(s); if (s.trimStart().startsWith('{')) return s.trimStart(); const i = s.indexOf('\n{'); return i >= 0 ? s.slice(i + 1) : s; })(fs.readFileSync(f, 'utf8')));
  }
  return out;
}

async function temasDeResenas() {
  const res = {};
  Object.entries(TEMAS_RESENA).forEach(([t, d]) => { res[t] = { tipo: d.tipo, total: 0, locales: {}, positivas: 0, negativas: 0, cita: null }; });
  let totalTexto = 0;
  for (const [slug, nombre] of Object.entries(LOCALES)) {
    const { data } = await supabaseAdmin.from('pp_resenas_google')
      .select('estrellas, texto_original')
      .eq('local_id', slug).gte('fecha_resena', ini).lt('fecha_resena', fin).limit(5000);
    const conTexto = (data || []).filter((r) => String(r.texto_original || '').trim());
    totalTexto += conTexto.length;
    conTexto.forEach((r) => {
      const t = norm(textoOriginal(r.texto_original));
      Object.entries(TEMAS_RESENA).forEach(([tema, def]) => {
        if (!def.claves.some((k) => t.includes(norm(k)))) return;
        const o = res[tema];
        o.total++; o.locales[nombre] = (o.locales[nombre] || 0) + 1;
        if (Number(r.estrellas) >= 4) o.positivas++; else o.negativas++;
        if (!o.cita && Number(r.estrellas) >= 4) {
          o.cita = { local: nombre, texto: textoOriginal(r.texto_original).slice(0, 170) };
        }
      });
    });
  }
  return { res, totalTexto };
}

async function preguntasAPepe() {
  const { data } = await supabaseAdmin.from('ppweb_chat_logs')
    .select('user_msg').gte('created_at', ini + 'T00:00:00Z').lt('created_at', fin + 'T00:00:00Z').limit(5000);
  const cuenta = {}; const ejemplos = {};
  Object.keys(TEMAS_PEPE).forEach((t) => { cuenta[t] = 0; ejemplos[t] = []; });
  const sinClasificar = [];
  (data || []).forEach((r) => {
    const t = norm(r.user_msg);
    if (!t || t.length < 4) return;
    let hit = false;
    Object.entries(TEMAS_PEPE).forEach(([tema, ks]) => {
      if (ks.some((k) => t.includes(norm(k)))) {
        cuenta[tema]++; hit = true;
        if (ejemplos[tema].length < 2) ejemplos[tema].push(String(r.user_msg).trim().slice(0, 95));
      }
    });
    if (!hit && sinClasificar.length < 40) sinClasificar.push(String(r.user_msg).trim().slice(0, 95));
  });
  return { total: (data || []).length, cuenta, ejemplos, sinClasificar };
}

async function busquedasCarta() {
  const { data: rest } = await supabaseAdmin.from('restaurants').select('id, name');
  const nombre = Object.fromEntries((rest || []).map((r) => [r.id, r.name]));
  let filas = [], from = 0;
  for (;;) {
    const { data } = await supabaseAdmin.from('menu_analytics')
      .select('restaurant_id, search_query')
      .not('search_query', 'is', null)
      .gte('created_at', ini + 'T00:00:00Z').lt('created_at', fin + 'T00:00:00Z')
      .range(from, from + 999);
    filas = filas.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  const utiles = filas.filter((r) => {
    const q = String(r.search_query || '').trim();
    return q.length >= 3 && !RUIDO.test(q);
  });
  const fam = {};
  Object.keys(FAMILIAS_BUSQUEDA).forEach((f) => { fam[f] = { total: 0, locales: {} }; });
  utiles.forEach((r) => {
    const q = norm(r.search_query);
    Object.entries(FAMILIAS_BUSQUEDA).forEach(([f, ks]) => {
      if (ks.some((k) => q.includes(norm(k)))) {
        fam[f].total++;
        const n = nombre[r.restaurant_id] || '—';
        fam[f].locales[n] = (fam[f].locales[n] || 0) + 1;
      }
    });
  });
  return { total: utiles.length, fam };
}

// OJO: name y description son objetos multiidioma ({es, en, ...}), no texto.
// Buscar sobre el objeto serializado, o no se encuentra nada.
const nombrePlato = (v) => (typeof v === 'string' ? v : (v && (v.es || Object.values(v)[0])) || '');

async function ofertaSinGluten() {
  const { data } = await supabaseAdmin.from('menu_items')
    .select('name, labels, allergens, is_active').limit(3000);
  const items = data || [];
  const etiquetados = items.filter((i) => (i.labels || []).includes('sin_gluten') && i.is_active);
  const faina = items.find((i) => /fain|farinata/i.test(JSON.stringify(i.name)));
  return {
    totalCarta: items.length,
    etiquetados: etiquetados.map((i) => nombrePlato(i.name)),
    faina: faina ? {
      nombre: nombrePlato(faina.name),
      activa: faina.is_active,
      marcadaConGluten: (faina.allergens || []).includes('gluten'),
      tieneEtiqueta: (faina.labels || []).includes('sin_gluten'),
    } : null,
  };
}

// ---------------- render ----------------
function tablaLocales(locales) {
  const filas = Object.entries(locales).map(([slug, d]) => {
    const g = d.google.actual, r = d.resenas.actual;
    return {
      nombre: d.local,
      inter: ACCIONES.reduce((a, k) => a + (Number(g[k]) || 0), 0),
      llegar: g.como_llegar, reservas: g.reservas,
      media: r.media, resenas: r.total, resp: r.pct_respondidas, malas: r.pct_malas,
    };
  }).sort((a, b) => b.inter - a.inter);

  return `<div class="tabla-scroll"><table>
  <tr><th>Local</th><th class="num">Interacciones</th><th class="num">Cómo llegar</th><th class="num">Reservas</th><th class="num">Reseñas</th><th class="num">Nota</th><th class="num">1-2★</th><th class="num">Respondidas</th></tr>
  ${filas.map((f) => `<tr><td><b>${esc(f.nombre)}</b></td><td class="num">${fmt(f.inter)}</td><td class="num">${fmt(f.llegar)}</td><td class="num">${fmt(f.reservas)}</td><td class="num">${fmt(f.resenas)}</td><td class="num">${coma(f.media)} ★</td><td class="num">${coma(f.malas)}%</td><td class="num">${coma(f.resp)}%</td></tr>`).join('')}
  </table></div>
  <p class="hint-scroll">👉 Deslizá la tabla hacia el costado para ver todo.</p>`;
}

function barrasTema(pares, clase = "") {
  if (!pares.length) return '<p class="vacio">Sin datos.</p>';
  const max = Math.max(...pares.map(([, v]) => v));
  return pares.map(([k, v, extra]) => `<div class="barra ${clase}"><div class="txt">${esc(k)}${extra ? ` <span style="color:var(--gris);font-size:12.5px">${esc(extra)}</span>` : ''}</div><div class="track"><div class="fill" style="width:${Math.max(Math.round(v / max * 100), 4)}%"></div></div><span class="val">${fmt(v)}</span></div>`).join('');
}

(async () => {
  const locales = cargarLocales();
  if (!Object.keys(locales).length) { console.error('No hay datos-<local>.json en ' + DIR); process.exit(1); }

  const { res: temas, totalTexto } = await temasDeResenas();
  const pepe = await preguntasAPepe();
  const busq = await busquedasCarta();
  const carta = await ofertaSinGluten();

  // agregados de marca
  const tot = Object.values(locales).reduce((a, d) => {
    const g = d.google.actual, r = d.resenas.actual;
    a.inter += ACCIONES.reduce((s, k) => s + (Number(g[k]) || 0), 0);
    a.llegar += g.como_llegar || 0; a.reservas += g.reservas || 0;
    a.resenas += r.total || 0; a.suma += (r.media || 0) * (r.total || 0);
    a.malas += r.malas || 0; a.respondidas += r.respondidas || 0;
    return a;
  }, { inter: 0, llegar: 0, reservas: 0, resenas: 0, suma: 0, malas: 0, respondidas: 0 });
  const notaMarca = tot.resenas ? (tot.suma / tot.resenas) : null;

  // Piso: un tema se reporta si está en 3+ locales o suma 8+ menciones.
  const pasaPiso = ([, v]) => Object.keys(v.locales).length >= 3 || v.total >= 8;
  const porTotal = (a, b) => b[1].total - a[1].total;
  const temasFuertes = Object.entries(temas).filter(pasaPiso)
    .filter(([, v]) => v.tipo === 'reconocimiento').sort(porTotal);
  const temasVigilar = Object.entries(temas).filter(pasaPiso)
    .filter(([, v]) => v.tipo === 'vigilar').sort(porTotal);

  const sinGlutenBusq = busq.fam['Sin gluten'];
  const pepeGluten = pepe.cuenta['Sin gluten'] || 0;
  const pctGluten = busq.total ? Math.round(sinGlutenBusq.total / busq.total * 100) : 0;

  let n = 0; const N = () => ++n;
  const cuerpo = `
  <div class="destacado">📌 <b>El titular del mes:</b> las cinco fichas generaron <b>${fmt(tot.inter)} interacciones</b> en ${MES} — ${fmt(tot.llegar)} personas pidiendo cómo llegar y ${fmt(tot.reservas)} reservas directas — con una nota media de marca de <b>${coma(notaMarca.toFixed(2))}★</b> sobre ${fmt(tot.resenas)} reseñas nuevas. Y una demanda que se repite en tres canales distintos y hoy no tiene respuesta: <b>sin gluten</b>.</div>

  <section><h2><span class="n">${N()}</span> 🏪 Los cinco locales, lado a lado</h2>
  <p class="explica">Ordenados por interacciones con la ficha de Google. Este cuadro es solo para dirección: los informes que recibe cada local no comparan contra los demás.</p>
  ${tablaLocales(locales)}
  </section>

  <section><h2><span class="n">${N()}</span> 🔴 Lo que la gente pide y no encuentra</h2>
  <p class="explica">Demanda que llega por canales independientes entre sí. Que coincidan es lo que la vuelve accionable.</p>

  <div class="aviso"><b>Sin gluten es la demanda número uno de la marca — y la respuesta que tenemos está mal comunicada.</b>
  <ul>
    <li><b>${sinGlutenBusq.total} búsquedas</b> en la carta digital — el <b>${pctGluten}%</b> de todo lo que se busca. Es el término más buscado de ${MES}.</li>
    <li><b>${pepeGluten} personas</b> se lo preguntaron a Pepe en la web.</li>
    <li>Aparece en <b>${Object.keys(sinGlutenBusq.locales).length} locales</b>: ${Object.entries(sinGlutenBusq.locales).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} (${c})`).join(', ')}.</li>
  </ul></div>

  ${carta.faina ? `<div class="aviso"><b>🔧 Lo que hay que arreglar hoy mismo, y no cuesta nada.</b>
  La <b>fainá</b> es nuestra opción sin gluten y está en la carta${carta.faina.activa ? ' y activa' : ''}. Pero en el sistema:
  <ul>
    ${carta.faina.marcadaConGluten ? '<li>Está marcada con el <b>alérgeno “gluten”</b>. Al celíaco que la mira, la carta le está diciendo que <b>no la puede comer</b>.</li>' : ''}
    ${!carta.faina.tieneEtiqueta ? '<li>No lleva la etiqueta <b>“sin gluten”</b>, así que quien filtra por eso no la encuentra.</li>' : ''}
    <li>De los ${carta.totalCarta} productos de la carta, lo único etiquetado como sin gluten es <b>${carta.etiquetados.length ? esc(carta.etiquetados.join(', ')) : 'nada'}</b>.</li>
  </ul>
  Por eso las ${sinGlutenBusq.total} búsquedas terminan en nada: la opción existe, pero está escondida y mal etiquetada. Corregir esas dos casillas es gratis y se hace en cinco minutos desde el panel.</div>

  <div class="ok">💡 <b>Y con una sola opción no alcanza.</b> La fainá resuelve la primera visita, pero el cliente celíaco que vuelve se encuentra siempre con lo mismo. Hace falta ampliar la línea — al menos una base de pizza — para que “sin gluten” deje de ser una excepción y sea una opción de verdad.</div>` : ''}

  <p class="nota-chica">Nadie se queja de esto en las reseñas: buscan, no encuentran y se van. Por eso no aparece como problema en ningún informe de local.</p>

  <h3>Lo demás que se busca en la carta digital</h3>
  ${barrasTema(Object.entries(busq.fam).filter(([f, v]) => f !== 'Sin gluten' && v.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([f, v]) => [f, v.total, Object.keys(v.locales).join(', ')]))}
  <p class="nota-chica">Sobre ${fmt(busq.total)} búsquedas útiles del mes en los cinco locales.</p>
  </section>

  <section><h2><span class="n">${N()}</span> 🟢 Lo que nos reconocen sin que se lo pidamos</h2>
  <p class="explica">Temas que aparecen espontáneamente en las ${fmt(totalTexto)} reseñas con texto de ${MES}. Solo se listan los que aparecen en 3 locales o más, o al menos 8 veces: dos menciones sueltas no son un tema.</p>
  ${barrasTema(temasFuertes.map(([t, v]) => [t, v.total, `${Object.keys(v.locales).length} ${Object.keys(v.locales).length === 1 ? 'local' : 'locales'} · ${v.positivas} de ${v.total} con 4-5★`]))}
  ${temasFuertes.filter(([, v]) => v.cita).slice(0, 2).map(([t, v]) => `<div class="ok"><b>${esc(t)}</b> · ${esc(v.cita.local)}: “${esc(v.cita.texto)}”</div>`).join('')}
  ${temasVigilar.length ? `<h3>Y lo que aparece como molestia</h3>
  <p class="explica" style="margin-top:0">Cuando estos salen en una reseña, salen para mal — aunque el cliente igual haya puesto buena nota.</p>
  ${barrasTema(temasVigilar.map(([t, v]) => [t, v.total, Object.entries(v.locales).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} ${c}`).join(', ')]), 'mala')}` : ''}
  </section>

  <section><h2><span class="n">${N()}</span> 💬 Qué le pregunta la gente a Pepe</h2>
  <p class="explica">Las ${fmt(pepe.total)} consultas al asistente de la web en ${MES}. Lo que preguntan es lo que no encontraron solos.</p>
  ${barrasTema(Object.entries(pepe.cuenta).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([t, v]) => [t, v]))}
  <h3>Preguntas que Pepe hoy no sabe responder</h3>
  <ul>
    ${pepe.sinClasificar.filter((s) => s.length > 12 && /\?|cuanto|cual|tienen|hay |teneis|tenéis|is |what/i.test(s)).slice(0, 6).map((s) => `<li>“${esc(s)}”</li>`).join('')}
  </ul>
  <p class="nota-chica">Cada una de estas es una línea que falta en su cerebro. Cargarlas es barato y evita que la consulta muera ahí.</p>
  </section>

  <section><h2><span class="n">${N()}</span> 🎧 Cada canal cuenta algo distinto</h2>
  <p class="explica">Por qué mirar solo Google deja fuera la mitad de la historia.</p>
  <ul>
    <li><b>Google</b> — es donde el cliente habla en público, y por eso <b>suaviza</b>. Elogia comida, servicio y equipo; casi nunca menciona lo incómodo.</li>
    <li><b>RESTOO</b> — se le pregunta directamente al cliente que ya reservó, y ahí <b>sí dice lo incómodo</b>. El calor del local de Russafa salió por acá, no por Google.</li>
    <li><b>El buscador de la carta</b> — es el canal más honesto de todos: nadie busca para quedar bien. Es donde aparece “sin gluten”.</li>
    <li><b>Pepe</b> — muestra lo que la web no explica. ${pepe.cuenta['Promociones del día'] || 0} de ${fmt(pepe.total)} consultas son por las promos del día.</li>
  </ul>
  <div class="aviso">⚠️ <b>Un cliente puede ponerte 5 estrellas y estar incómodo.</b> Las quejas por el aire acondicionado de ${MES} vinieron en reseñas de 4 y 5 estrellas. Si solo se miran las de 1 y 2, esa capa entera se pierde.</div>
  </section>

  <section><h2><span class="n">${N()}</span> ✅ Decisiones que solo puede tomar dirección</h2>
  <p class="explica">Ninguna de estas la puede resolver un encargado.</p>
  <div class="acciones">
    <div class="accion"><div><b>Arreglar la ficha de la fainá en la carta digital</b> — quitarle el alérgeno “gluten” y ponerle la etiqueta “sin gluten”. Es la corrección más barata del informe: cinco minutos y desbloquea la demanda más buscada del mes.</div></div>
    <div class="accion"><div><b>Ampliar la línea sin gluten.</b> Con la fainá sola, el cliente celíaco que vuelve siempre come lo mismo. Una base de pizza sin gluten convierte una excepción en una opción real.</div></div>
    <div class="accion"><div><b>Convertir la milanesa en bandera.</b> Es lo único que se nombra solo en los cinco locales y casi siempre bien. Hoy no se comunica como diferencial de marca — y la promo de milanesas es lo que más le preguntan a Pepe.</div></div>
    <div class="accion"><div><b>Comunicar las porciones.</b> ${temas['Las porciones / la cantidad'].total} reseñas hablan de la cantidad y ${temas['Las porciones / la cantidad'].negativas === 0 ? '<b>ninguna se queja</b>' : `solo ${temas['Las porciones / la cantidad'].negativas} se quejan`}. Es un diferencial reconocido que no está en ninguna pieza.</div></div>
    <div class="accion"><div><b>Publicar la promo del día donde se vea.</b> Es la consulta número uno a Pepe, y varias preguntan por las condiciones (“el 2x1, ¿es solo comiendo acá?”). Se resuelve con una línea en la web y en la ficha.</div></div>
    <div class="accion"><div><b>Climatización de Russafa.</b> Es inversión, no gestión de sala. El cliente lo escribe en RESTOO y se lo calla en Google, así que no va a aparecer solo en los indicadores.</div></div>
    <div class="accion"><div><b>Cargar en Pepe lo que hoy no sabe:</b> tamaños de las pizzas, si hay delivery y a qué zonas, y opciones sin queso. Son preguntas reales de ${MES} que quedaron sin respuesta.</div></div>
  </div>
  </section>`;

  const salida = path.join(DIR, `informe-direccion-${periodo}.html`);
  fs.writeFileSync(salida, `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pizzería Popular · Dirección · ${MES} ${ANIO}</title>${CSS}
<style>
  .tabla-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 6px -4px; }
  table { border-collapse: collapse; font-size: 13.5px; min-width: 620px; width: 100%; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--gris); border-bottom: 2px solid var(--tinta); padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid var(--linea); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .hint-scroll { display: none; font-size: 12px; color: var(--gris); }
  @media (max-width: 700px) { .hint-scroll { display: block; } }
</style></head><body>
<header><div class="kicker">🍕 Pizzería Popular · Grupo Ajax</div><h1>Informe de Dirección</h1><div class="sub">${MES.charAt(0).toUpperCase() + MES.slice(1)} ${ANIO} · los 5 locales</div></header>
${cuerpo}
<div class="nota"><b>Cómo se hizo este informe.</b> Los datos de las fichas vienen de la API de Google. Los temas de las reseñas se cuentan de forma determinística sobre el texto de las ${fmt(totalTexto)} reseñas con comentario de ${MES}: un tema se reporta solo si aparece en 3 locales o más, o al menos 8 veces. Las consultas a Pepe y las búsquedas de la carta salen de sistema propio. Las valoraciones de RESTOO se cargan a mano hasta que tengamos acceso a su API en producción. Grupo Ajax · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</div>
</body></html>`);
  console.log('OK ' + salida);
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
