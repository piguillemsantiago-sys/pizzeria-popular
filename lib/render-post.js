// ============================================================
// lib/render-post.js — renderiza un blog post desde la base de
// datos usando los templates de templates/post-*.html.
// El cuerpo del post (post.contenido) es HTML con clases .article-*.
// ============================================================
const fs = require('fs');
const path = require('path');

const TEMPLATES = {
  es: fs.readFileSync(path.join(__dirname, '..', 'templates', 'post-es.html'), 'utf-8'),
  en: fs.readFileSync(path.join(__dirname, '..', 'templates', 'post-en.html'), 'utf-8'),
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function formatDate(fecha, idioma) {
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  if (idioma === 'en') return day + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  return day + ' de ' + MESES[d.getUTCMonth()] + ' de ' + d.getUTCFullYear();
}

function isoDate(fecha) {
  const d = new Date(fecha);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Construye el índice (TOC) a partir de los <h2 id="..."> del cuerpo.
function buildTOC(contenido) {
  const items = [];
  const re = /<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  while ((m = re.exec(contenido)) !== null) {
    let label = m[2].replace(/<span class="h2-num">[\s\S]*?<\/span>/gi, '');
    label = label.replace(/<[^>]+>/g, '').trim();
    if (label) items.push('<a href="#' + m[1] + '">' + label + '</a>');
  }
  return items.join('\n          ');
}

function absUrl(u) {
  if (!u) return 'https://www.pizzeriapopular.es/images/blog/benidorm/benidorm-hero.jpg';
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://www.pizzeriapopular.es' + (u.startsWith('/') ? '' : '/') + u;
}

// post: fila de ppweb_posts. opts.hasTranslation: true si existe la versión
// publicada en el otro idioma (mismo slug). Devuelve el HTML de la página.
function renderPost(post, opts) {
  opts = opts || {};
  const idioma = post.idioma === 'en' ? 'en' : 'es';
  // URL de la versión en el otro idioma (o el listado si no hay traducción).
  const otherBase = idioma === 'en' ? '/blog/' : '/en/blog/';
  const altLangUrl = opts.hasTranslation ? otherBase + post.slug + '/' : otherBase;
  let hreflang = '';
  if (opts.hasTranslation) {
    hreflang =
      '<link rel="alternate" hreflang="es" href="https://www.pizzeriapopular.es/blog/' + post.slug + '/" />\n' +
      '  <link rel="alternate" hreflang="en" href="https://www.pizzeriapopular.es/en/blog/' + post.slug + '/" />';
  }
  const repl = {
    HREFLANG: hreflang,
    ALT_LANG_URL: altLangUrl,
    TITULO: escAttr(post.titulo),
    META_DESC: escAttr(post.meta_desc || post.subtitulo || post.titulo),
    SLUG: post.slug,
    HERO_IMAGE: post.hero_image || '',
    HERO_ABS: absUrl(post.hero_image),
    EYEBROW: escAttr(post.eyebrow || (idioma === 'en' ? 'News' : 'Novedades')),
    SUBTITULO: escAttr(post.subtitulo || ''),
    FECHA: formatDate(post.fecha, idioma),
    ISO_DATE: isoDate(post.fecha),
    TOC: buildTOC(post.contenido || ''),
    BODY: post.contenido || '',
  };
  return TEMPLATES[idioma].replace(/\{\{(\w+)\}\}/g, (full, key) =>
    (Object.prototype.hasOwnProperty.call(repl, key) ? repl[key] : full));
}

module.exports = { renderPost };
