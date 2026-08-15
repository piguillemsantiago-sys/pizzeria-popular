const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { updateRatings, loadRatings, ratingsExist } = require('./google-places');

require('dotenv').config();

const { requireAdmin, supabaseAdmin, SUPABASE_URL, ANON_KEY } = require('./lib/supabase');
const { renderPost } = require('./lib/render-post');
const { interpret, applyPlan } = require('./lib/assistant');
const { interpretBlog, applyBlogPlan } = require('./lib/blog-assistant');
const { listFolder, downloadFile } = require('./lib/drive');
const { chat, rateOk, reloadKnowledge } = require('./lib/chatbot');
const { logTurn, getStats, analyze, getLatestInsight } = require('./lib/chat-stats');
const { getOverview, getInformes, generarInforme, emailInforme } = require('./lib/intel');
const { logEvento, getWebStats } = require('./lib/web-stats');
const { snapshotGoogle, getGoogleStats, volcarRatingsARestaurants } = require('./lib/google-stats');
const metaAds = require('./lib/meta-ads');
const ig = require('./lib/instagram');
const { generarCopy, ajustarCopy, generarPiezas, generarImagenIA, generarPortadaReel, generarPortadaEditorial, afinarPromptIA, sugerirEscenaBlog, geminiDisponible, materializarFoto, interpretarRetoque } = require('./lib/generador');
const { sincronizar: sincronizarBanco, estado: estadoBanco, elegirFotos } = require('./lib/banco');
const { listarReferencias } = require('./lib/referencia');
const { getBrandKit, saveBrandKit } = require('./lib/brand-kit');
const menu = require('./lib/menu');
const menuAnalytics = require('./lib/menu-analytics');
const resenas = require('./lib/google-reviews');
const menciones = require('./lib/menciones');
const mencionesPdf = require('./lib/menciones-pdf');
const googleOAuth = require('./lib/google-oauth');
const gbp = require('./lib/gbp');
const gbpPosts = require('./lib/gbp-posts');
const autoResenas = require('./lib/auto-resenas');
const gbpFotos = require('./lib/gbp-fotos');
const gbpPerformance = require('./lib/gbp-performance');

const app = express();
app.set('trust proxy', 1); // detrás de Nginx — req.ip = IP real del visitante
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// Parse JSON & form data
app.use(express.json({ limit: '15mb' })); // 15mb: subida de imágenes del panel
app.use(express.urlencoded({ extended: true }));

// Force no-cache for HTML pages so edits are picked up immediately
app.use((req, res, next) => {
  if (req.path.endsWith('/') || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Static files. Los videos se cachean fuerte (son estáticos; se invalidan con
// el ?v= del src) para que no se re-bajen en cada carga ni en cada loop —
// eso evita que el video del hero se trabe.
app.use(express.static(PUBLIC, {
  setHeaders: (res, filePath) => {
    if (/\.(mp4|webm)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 días
    }
  },
}));

// ========== API: FRANCHISE CONTACT FORM ==========
// Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// Example .env:
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=587
//   SMTP_USER=tu-email@gmail.com
//   SMTP_PASS=tu-app-password
app.post('/api/franquicia', async (req, res) => {
  const {
    nombre, email, telefono, ciudad, experiencia,
    local_disponible, presupuesto, intencion, socios,
    como_conociste, mensaje
  } = req.body;

  // Basic validation
  if (!nombre || !email || !telefono || !ciudad) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
  }

  const htmlBody = `
    <h2>Nueva solicitud de franquicia</h2>
    <table style="border-collapse:collapse;width:100%;max-width:600px;font-family:Arial,sans-serif;">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Nombre</td><td style="padding:8px;border-bottom:1px solid #eee;">${nombre}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${email}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Teléfono</td><td style="padding:8px;border-bottom:1px solid #eee;">${telefono}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Ciudad</td><td style="padding:8px;border-bottom:1px solid #eee;">${ciudad}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Experiencia en gastronomía</td><td style="padding:8px;border-bottom:1px solid #eee;">${experiencia || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Local disponible</td><td style="padding:8px;border-bottom:1px solid #eee;">${local_disponible || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Presupuesto</td><td style="padding:8px;border-bottom:1px solid #eee;">${presupuesto || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Intención</td><td style="padding:8px;border-bottom:1px solid #eee;">${intencion || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Socios</td><td style="padding:8px;border-bottom:1px solid #eee;">${socios || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Cómo nos conoció</td><td style="padding:8px;border-bottom:1px solid #eee;">${como_conociste || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Mensaje</td><td style="padding:8px;border-bottom:1px solid #eee;">${mensaje || '-'}</td></tr>
    </table>
  `;

  // If SMTP is not configured, log and return success anyway
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('[Franquicia] SMTP not configured. Form data:', req.body);
    return res.json({ ok: true, message: 'Solicitud recibida (SMTP no configurado, datos logueados).' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Pizzería Popular Web" <${process.env.SMTP_USER}>`,
      to: 'pizzeriapopular@grupoajax.es',
      replyTo: email,
      subject: `Nueva solicitud de franquicia — ${nombre} (${ciudad})`,
      html: htmlBody,
    });

    res.json({ ok: true, message: 'Solicitud enviada correctamente.' });
  } catch (err) {
    console.error('[Franquicia] Error sending email:', err.message);
    res.status(500).json({ ok: false, error: 'Error al enviar. Intentá de nuevo.' });
  }
});

// ========== API: TRACKING WEB (analítica propia, sin cookies) ==========
// El sitio público manda pageviews y eventos (whatsapp, reserva, instagram,
// formulario). Respuesta vacía y rápida; nunca rompe la navegación.
app.post('/api/track', (req, res) => {
  try {
    const { tipo, path: p, ref, target } = req.body || {};
    logEvento(req, { tipo, path: p, ref, target });
  } catch (e) { /* fire-and-forget */ }
  res.status(204).end();
});

// --- Trailing slash redirect middleware ---
app.use((req, res, next) => {
  // Skip files with extensions, API routes, etc.
  if (req.path === '/' || req.path.includes('.') || req.path.endsWith('/') || req.path.startsWith('/api/')) {
    return next();
  }
  res.redirect(301, req.path + '/');
});

// --- Helper ---
const sendPage = (file) => (req, res) => {
  res.sendFile(path.join(PUBLIC, file));
};

// ========== SPANISH ROUTES ==========
app.get('/', sendPage('pages/index.html'));
app.get('/nosotros/', sendPage('pages/nosotros.html'));
app.get('/restaurantes/', sendPage('pages/restaurantes.html'));
app.get('/menu-diario/', sendPage('pages/menu-diario.html'));
app.get('/carta/', sendPage('pages/carta.html'));
app.get('/promos/', sendPage('pages/promos.html'));
app.get('/franquicias/', sendPage('pages/franquicias.html'));
app.get('/contacto/', sendPage('pages/contacto.html'));
app.get('/blog/', sendPage('pages/blog.html'));

// Legal pages
app.get('/aviso-legal/', sendPage('pages/aviso-legal.html'));
app.get('/politica-de-cookies/', sendPage('pages/politica-cookies.html'));
app.get('/politica-de-privacidad/', sendPage('pages/politica-privacidad.html'));

// Blog posts (existing indexed URLs)
app.get('/pizzerias-cerca-de-ti-descubre-pizzeria-popular/', sendPage('pages/blog/pizzerias-cerca-de-ti.html'));
app.get('/pizzeria-popular-llega-a-madrid/', sendPage('pages/blog/pizzeria-popular-madrid.html'));
app.get('/como-abrir-una-franquicia-de-exito-con-pizzeria-popular/', sendPage('pages/blog/franquicia-exito.html'));
app.get('/ingredientes-frescos-y-autenticos-el-alma-de-nuestras-pizzerias/', sendPage('pages/blog/ingredientes-frescos.html'));
app.get('/llegamos-a-benidorm/', sendPage('pages/blog/llegamos-a-benidorm.html'));

// ========== ENGLISH ROUTES ==========
app.get('/en/home/', sendPage('en/home.html'));
app.get('/en/about-us/', sendPage('en/about-us.html'));
app.get('/en/restaurants/', sendPage('en/restaurants.html'));
app.get('/en/menu/', sendPage('en/menu.html'));
app.get('/en/promos/', sendPage('en/promos.html'));
app.get('/en/franchises/', sendPage('en/franchises.html'));
app.get('/en/contact/', sendPage('en/contact.html'));
app.get('/en/blog/', sendPage('en/blog.html'));
app.get('/en/we-have-arrived-in-benidorm/', sendPage('en/blog/we-have-arrived-in-benidorm.html'));

// ========== BLOG POSTS DESDE LA BASE DE DATOS ==========
async function serveDbPost(req, res, next, idioma) {
  try {
    const otro = idioma === 'es' ? 'en' : 'es';
    const { data, error } = await supabaseAdmin
      .from('ppweb_posts').select('*')
      .eq('slug', req.params.slug).eq('idioma', idioma).eq('estado', 'publicado')
      .maybeSingle();
    if (error || !data) return next();
    // ¿Existe la versión publicada en el otro idioma (mismo slug)?
    const { data: alt } = await supabaseAdmin
      .from('ppweb_posts').select('id')
      .eq('slug', req.params.slug).eq('idioma', otro).eq('estado', 'publicado')
      .maybeSingle();
    res.send(renderPost(data, { hasTranslation: !!alt }));
  } catch (e) { next(); }
}
app.get('/blog/:slug/', (req, res, next) => serveDbPost(req, res, next, 'es'));
app.get('/en/blog/:slug/', (req, res, next) => serveDbPost(req, res, next, 'en'));

// Previsualización de un post en cualquier estado (borradores incluidos).
// El id (uuid) hace de token: no es enumerable. Ruta bajo /admin/ (noindex).
app.get('/admin/preview/:id/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ppweb_posts').select('*').eq('id', req.params.id).maybeSingle();
    if (error || !data) return next();
    res.send(renderPost(data, { hasTranslation: false }));
  } catch (e) { next(); }
});

// ========== PANEL ADMIN (páginas) ==========
app.get('/admin/', sendPage('admin/index.html'));
app.get('/admin/login/', sendPage('admin/login.html'));

// ========== API: CONTACT FORM ==========
app.post('/api/contacto', async (req, res) => {
  const { nombre, email, telefono, local, mensaje } = req.body;

  if (!nombre || !email || !mensaje) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
  }

  const htmlBody = `
    <h2>Nuevo mensaje desde la web</h2>
    <table style="border-collapse:collapse;width:100%;max-width:600px;font-family:Arial,sans-serif;">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Nombre</td><td style="padding:8px;border-bottom:1px solid #eee;">${nombre}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${email}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Teléfono</td><td style="padding:8px;border-bottom:1px solid #eee;">${telefono || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;">Local</td><td style="padding:8px;border-bottom:1px solid #eee;">${local || '-'}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#392E2C;vertical-align:top;">Mensaje</td><td style="padding:8px;border-bottom:1px solid #eee;white-space:pre-wrap;">${mensaje}</td></tr>
    </table>
  `;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log('[Contacto] SMTP not configured. Form data:', req.body);
    return res.json({ ok: true, message: 'Mensaje recibido (SMTP no configurado, datos logueados).' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: parseInt(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Pizzería Popular Web" <${process.env.SMTP_USER}>`,
      to: 'pizzeriapopular@grupoajax.es',
      replyTo: email,
      subject: `Nuevo mensaje desde la web — ${nombre}`,
      html: htmlBody,
    });

    res.json({ ok: true, message: 'Mensaje enviado correctamente.' });
  } catch (err) {
    console.error('[Contacto] Error sending email:', err.message);
    res.status(500).json({ ok: false, error: 'Error al enviar. Intentá de nuevo.' });
  }
});

// ========== GOOGLE RATINGS API ==========
app.get('/api/ratings', (req, res) => {
  const data = loadRatings();
  if (data) return res.json(data);
  res.status(404).json({ error: 'No ratings data yet.' });
});

app.get('/api/update-ratings', async (req, res) => {
  if (req.query.key !== 'secretkey123') {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const data = await updateRatings();
    if (data) return res.json({ ok: true, data });
    res.json({ ok: false, error: 'GOOGLE_PLACES_API_KEY not configured.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== PANEL ADMIN — API ==========

// Config pública para el navegador (la anon key es pública por diseño).
app.get('/api/admin/config', (req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: ANON_KEY });
});

// Verifica que el usuario logueado es admin autorizado.
// Incluye el scope del Menú Digital para que el front decida la visibilidad:
//   isFullAdmin (role 'dueno') → ve todo el panel.
//   menu.hasAccess sin isFullAdmin → gerente solo-menú (scopeado por local).
app.get('/api/admin/me', requireAdmin, async (req, res) => {
  let menuAccess = null;
  try { menuAccess = await menu.getMenuAccess(req.adminUser.id); } catch (_) {}
  const isFullAdmin = !!(menuAccess && menuAccess.role === 'dueno');
  res.json({
    ok: true,
    email: req.adminUser.email,
    id: req.adminUser.id,
    isFullAdmin,
    menu: menuAccess
      ? { hasAccess: menuAccess.restaurantIds.length > 0, isOwner: menuAccess.isOwner, restaurantIds: menuAccess.restaurantIds }
      : { hasAccess: false, isOwner: false, restaurantIds: [] },
  });
});

// Promos públicas (solo activas) — usado por la página /promos/.
app.get('/api/promos', async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  const { data, error } = await supabaseAdmin
    .from('ppweb_promos')
    .select('*')
    .eq('idioma', lang)
    .eq('activa', true)
    .order('orden', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Posts públicos (solo publicados) — usado por el listado /blog/.
app.get('/api/posts', async (req, res) => {
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  const { data, error } = await supabaseAdmin
    .from('ppweb_posts')
    .select('titulo,slug,fecha,subtitulo,meta_desc,hero_image')
    .eq('idioma', lang)
    .eq('estado', 'publicado')
    .order('fecha', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  // El sufijo #split del hero es solo para el layout del post, no para el listado.
  res.json((data || []).map((p) =>
    Object.assign({}, p, { hero_image: String(p.hero_image || '').replace(/#split$/i, '') })));
});

// Listado completo para el panel (incluye inactivas).
app.get('/api/admin/promos', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('ppweb_promos')
    .select('*')
    .order('orden', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Whitelist de campos editables — nada fuera de esto llega a la base.
const PROMO_FIELDS = ['titulo', 'subtitulo', 'descripcion', 'condiciones', 'badge',
  'imagen_url', 'boton_texto', 'boton_accion', 'activa', 'orden', 'idioma'];
function cleanPromo(body) {
  const out = {};
  for (const f of PROMO_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// Crear promo.
app.post('/api/admin/promos', requireAdmin, async (req, res) => {
  const promo = cleanPromo(req.body);
  if (!promo.titulo) return res.status(400).json({ error: 'El título es obligatorio.' });
  const { data, error } = await supabaseAdmin
    .from('ppweb_promos').insert(promo).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Editar promo.
app.patch('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  const promo = cleanPromo(req.body);
  const { data, error } = await supabaseAdmin
    .from('ppweb_promos').update(promo).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Borrar promo.
app.delete('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('ppweb_promos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---- Blog posts ----
const POST_FIELDS = ['slug', 'idioma', 'titulo', 'subtitulo', 'eyebrow', 'fecha',
  'hero_image', 'meta_desc', 'keyword', 'contenido', 'estado'];
function cleanPost(body) {
  const out = {};
  for (const f of POST_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// Listado de posts para el panel (incluye borradores).
app.get('/api/admin/posts', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('ppweb_posts').select('*').order('fecha', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Crear post.
app.post('/api/admin/posts', requireAdmin, async (req, res) => {
  const post = cleanPost(req.body);
  if (!post.titulo || !post.slug) return res.status(400).json({ error: 'Faltan título o slug.' });
  const { data, error } = await supabaseAdmin
    .from('ppweb_posts').insert(post).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Editar post.
app.patch('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  const post = cleanPost(req.body);
  const { data, error } = await supabaseAdmin
    .from('ppweb_posts').update(post).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Borrar post.
app.delete('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('ppweb_posts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---- Imagen de portada (hero) generada con IA (Gemini "nano banana") ----
// Equivalente del generador de placas, pero enfocado en blog: la salida es una FOTO
// PURA (sin texto ni logo horneados), apaisada 16:9, pensada para que el título del
// post se monte encima por CSS. Sugiere la escena desde el propio post y la genera.

// Sugiere una escena fotográfica para el hero, a partir del título/bajada/contenido.
app.post('/api/admin/posts/hero-ia/sugerir', requireAdmin, async (req, res) => {
  try {
    const { titulo, subtitulo, contenido } = req.body;
    const prompt = await sugerirEscenaBlog({
      titulo: String(titulo || ''),
      subtitulo: String(subtitulo || ''),
      contenido: String(contenido || ''),
    });
    res.json({ prompt });
  } catch (e) {
    console.error('[Hero IA sugerir] Error:', e.message);
    res.status(500).json({ error: 'No pude sugerir la escena: ' + e.message });
  }
});

// Genera la foto de portada con Gemini y la sube al Storage. Devuelve la URL pública
// lista para cargar como hero_image del post.
app.post('/api/admin/posts/hero-ia', requireAdmin, async (req, res) => {
  try {
    const sharp = require('sharp');
    const { prompt } = req.body;
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Describí la escena a generar.' });
    }
    if (!geminiDisponible()) {
      return res.status(400).json({ error: 'Falta GEMINI_API_KEY en el servidor: la generación con IA no está activa.' });
    }
    const raw = await generarImagenIA(String(prompt), { aspecto: '16:9' });
    const optim = await sharp(raw).rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const objectPath = 'blog/hero-ia-' + Date.now() + '.jpg';
    const { error } = await supabaseAdmin.storage.from('ppweb-blog')
      .upload(objectPath, optim, { contentType: 'image/jpeg', upsert: false });
    if (error) return res.status(500).json({ error: error.message });
    const { data } = supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[Hero IA] Error:', e.message);
    res.status(500).json({ error: 'No pude generar la imagen: ' + e.message });
  }
});

// ---- Asistente de IA (promociones) ----
// Interpreta una instrucción y devuelve { reply, plan }. NO ejecuta nada.
app.post('/api/admin/assistant', requireAdmin, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Escribí una instrucción.' });
    }
    const { data: promos } = await supabaseAdmin
      .from('ppweb_promos').select('*').order('orden', { ascending: true });
    const result = await interpret(history || [], String(message), promos || []);
    res.json(result);
  } catch (e) {
    console.error('[Asistente] Error:', e.message);
    res.status(500).json({ error: 'El asistente falló: ' + e.message });
  }
});

// Ejecuta un plan ya confirmado por el usuario.
app.post('/api/admin/assistant/apply', requireAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!Array.isArray(plan) || !plan.length) {
      return res.status(400).json({ error: 'No hay cambios para aplicar.' });
    }
    const results = await applyPlan(plan);
    res.json({ ok: true, results });
  } catch (e) {
    console.error('[Asistente] Error al aplicar:', e.message);
    res.status(500).json({ error: 'Error al aplicar: ' + e.message });
  }
});

// ---- Subida de imágenes (Supabase Storage, bucket ppweb-blog) ----
app.post('/api/admin/upload', requireAdmin, async (req, res) => {
  try {
    const { filename, dataUrl } = req.body;
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
    if (!m) return res.status(400).json({ error: 'Imagen no válida (jpg, png o webp).' });
    const contentType = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    const ext = contentType === 'image/png' ? 'png' : (contentType === 'image/webp' ? 'webp' : 'jpg');
    const safe = String(filename || 'foto').toLowerCase()
      .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 40) || 'foto';
    const objectPath = 'blog/' + Date.now() + '-' + safe + '.' + ext;
    const { error } = await supabaseAdmin.storage.from('ppweb-blog')
      .upload(objectPath, buffer, { contentType, upsert: false });
    if (error) return res.status(500).json({ error: error.message });
    const { data } = supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[Upload] Error:', e.message);
    res.status(500).json({ error: 'Error al subir: ' + e.message });
  }
});

// ---- Google Drive: listar una carpeta ----
app.get('/api/admin/drive/list', requireAdmin, async (req, res) => {
  try {
    res.json(await listFolder(req.query.folder));
  } catch (e) {
    console.error('[Drive list] Error:', e.message);
    res.status(500).json({ error: 'No se pudo leer Google Drive: ' + e.message });
  }
});

// ---- Google Drive: importar imágenes (descarga + optimiza + sube al Storage) ----
app.post('/api/admin/drive/import', requireAdmin, async (req, res) => {
  try {
    const sharp = require('sharp');
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'No elegiste imágenes.' });
    const urls = [];
    for (const id of ids) {
      const original = await downloadFile(id);
      const optimized = await sharp(original).rotate()
        .resize({ width: 2000, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      const objectPath = 'blog/drive-' + Date.now() + '-' +
        Math.random().toString(36).slice(2, 8) + '.jpg';
      const { error } = await supabaseAdmin.storage.from('ppweb-blog')
        .upload(objectPath, optimized, { contentType: 'image/jpeg' });
      if (error) throw new Error(error.message);
      urls.push(supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl);
    }
    res.json({ urls });
  } catch (e) {
    console.error('[Drive import] Error:', e.message);
    res.status(500).json({ error: 'Error al importar: ' + e.message });
  }
});

// ---- Asistente de IA para el blog ----
app.post('/api/admin/blog-assistant', requireAdmin, async (req, res) => {
  try {
    const { message, history, photos } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Escribí una instrucción.' });
    }
    const { data: posts } = await supabaseAdmin
      .from('ppweb_posts')
      .select('id,titulo,idioma,estado,slug,subtitulo,eyebrow,meta_desc,keyword,hero_image,fecha,local,contenido')
      .order('created_at', { ascending: false });
    const result = await interpretBlog(history || [], String(message), photos || [], posts || []);
    res.json(result);
  } catch (e) {
    console.error('[Blog assistant] Error:', e.message);
    res.status(500).json({ error: 'El asistente falló: ' + e.message });
  }
});

app.post('/api/admin/blog-assistant/apply', requireAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!Array.isArray(plan) || !plan.length) {
      return res.status(400).json({ error: 'No hay nada para aplicar.' });
    }
    const results = await applyBlogPlan(plan);
    res.json({ ok: true, results });
  } catch (e) {
    console.error('[Blog assistant apply] Error:', e.message);
    res.status(500).json({ error: 'Error al aplicar: ' + e.message });
  }
});

// ========== CHAT PÚBLICO (asistente de visitantes) ==========
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history, sessionId } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Escribí una consulta.' });
    }
    if (!rateOk(req.ip)) {
      return res.status(429).json({ error: 'Demasiadas consultas seguidas. Probá de nuevo en un rato.' });
    }
    const reply = await chat(String(message), history || []);
    logTurn(sessionId, String(message), reply); // registro para estadísticas
    res.json({ reply });
  } catch (e) {
    console.error('[Chat] Error:', e.message);
    res.status(500).json({ error: 'No pude responder ahora. Probá de nuevo en un momento.' });
  }
});

// ---- Estadísticas del chat de Pepe (panel) ----
app.get('/api/admin/chat/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    const insight = await getLatestInsight();
    res.json(Object.assign({}, stats, { insight }));
  } catch (e) {
    console.error('[ChatStats] Error:', e.message);
    res.status(500).json({ error: 'No se pudieron cargar las estadísticas: ' + e.message });
  }
});

// ---- Análisis IA del chat, a pedido ----
app.post('/api/admin/chat/analyze', requireAdmin, async (req, res) => {
  try {
    const insight = await analyze();
    res.json(insight);
  } catch (e) {
    console.error('[ChatStats] Error al analizar:', e.message);
    res.status(500).json({ error: 'No se pudo analizar: ' + e.message });
  }
});

// ---- Cerebro de Pepe: base de conocimiento editable ----
app.get('/api/admin/pepe/knowledge', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('ppweb_pepe_conocimiento').select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/admin/pepe/knowledge', requireAdmin, async (req, res) => {
  const contenido = String(req.body.contenido || '').trim();
  if (!contenido) return res.status(400).json({ error: 'El contenido es obligatorio.' });
  const origen = req.body.origen === 'ia' ? 'ia' : 'manual';
  const { data, error } = await supabaseAdmin
    .from('ppweb_pepe_conocimiento')
    .insert({ contenido: contenido.slice(0, 1000), origen }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  reloadKnowledge();
  res.json(data);
});

app.patch('/api/admin/pepe/knowledge/:id', requireAdmin, async (req, res) => {
  const upd = {};
  if (req.body.activo !== undefined) upd.activo = !!req.body.activo;
  if (req.body.contenido !== undefined) upd.contenido = String(req.body.contenido).trim().slice(0, 1000);
  const { data, error } = await supabaseAdmin
    .from('ppweb_pepe_conocimiento').update(upd).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  reloadKnowledge();
  res.json(data);
});

app.delete('/api/admin/pepe/knowledge/:id', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('ppweb_pepe_conocimiento').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  reloadKnowledge();
  res.json({ ok: true });
});

// ---- Generador: piezas para redes (historias y carruseles) ----
app.get('/api/admin/gen/status', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let referencia = 0;
  try { referencia = (await listarReferencias()).length; } catch (e) { /* opcional */ }
  try {
    const banco = await estadoBanco();
    res.json({ gemini: geminiDisponible(), banco: banco.indexadas, referencia });
  } catch (e) {
    res.json({ gemini: geminiDisponible(), banco: 0, referencia });
  }
});

// Brand Kit: la identidad de marca que se inyecta en todos los prompts de imagen.
app.get('/api/admin/gen/brand-kit', requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await getBrandKit());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/gen/brand-kit', requireAdmin, async (req, res) => {
  try {
    res.json(await saveBrandKit(req.body || {}));
  } catch (e) {
    console.error('[Brand Kit] Error:', e.message);
    res.status(500).json({ error: 'No pude guardar el Brand Kit: ' + e.message });
  }
});

// Indexa el banco de imágenes (Drive → catálogo descrito por IA).
app.post('/api/admin/gen/sync-banco', requireAdmin, async (req, res) => {
  try {
    const r = await sincronizarBanco({ limit: req.body && req.body.limit });
    res.json(r);
  } catch (e) {
    console.error('[Banco] Error:', e.message);
    res.status(500).json({ error: 'No pude sincronizar el banco: ' + e.message });
  }
});

// «Dame otra»: la IA elige OTRA foto del banco para una placa, excluyendo
// las ya descartadas.
app.post('/api/admin/gen/reelegir', requireAdmin, async (req, res) => {
  try {
    const { instruccion, formato, placa, excluir } = req.body;
    if (!placa) return res.status(400).json({ error: 'Falta la placa.' });
    const el = (await elegirFotos(String(instruccion || ''), formato || 'historia', [placa], excluir || []))[0];
    if (!el || !el.driveId) return res.status(404).json({ error: 'No encontré otra foto distinta en el banco.' });
    res.json({
      driveId: el.driveId, bancoId: el.bancoId, motivo: el.motivo || '',
      fotoUrl: await materializarFoto(el.driveId),
    });
  } catch (e) {
    console.error('[Gen reelegir] Error:', e.message);
    res.status(500).json({ error: 'No pude buscar otra foto: ' + e.message });
  }
});

// ---- Trabajos largos del generador en segundo plano ----
// Los POST pesados (copy/ajustar/portada/piezas) devuelven { jobId } al instante
// y siguen trabajando; el panel pregunta GET /gen/job/:id cada pocos segundos.
// Así ningún timeout de proxy/conexión puede matar una generación en curso: la
// conexión larga desapareció del sistema.
const genJobs = new Map();
function lanzarJobGen(fn) {
  const id = require('crypto').randomUUID();
  genJobs.set(id, { estado: 'corriendo' });
  (async () => {
    try {
      const resultado = await fn();
      genJobs.set(id, { estado: 'listo', resultado });
    } catch (e) {
      console.error('[Gen job] Error:', e.message);
      genJobs.set(id, { estado: 'error', error: e.message });
    }
    // El resultado espera 30 min a ser retirado; después se limpia solo.
    setTimeout(() => genJobs.delete(id), 30 * 60 * 1000);
  })();
  return id;
}
app.get('/api/admin/gen/job/:id', requireAdmin, (req, res) => {
  const j = genJobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Ese trabajo ya no existe (probablemente se reinició el servidor). Volvé a generar.' });
  if (j.estado === 'listo') return res.json({ estado: 'listo', resultado: j.resultado });
  if (j.estado === 'error') return res.json({ estado: 'error', error: j.error });
  res.json({ estado: 'corriendo' });
});

// ---- Generador de historias v2 (14 jul): director Opus + canon + Gemini PRO +
// control visual + logo por código. Ver lib/generador2.js. ----
const gen2 = require('./lib/generador2');
app.post('/api/admin/gen2/historia', requireAdmin, (req, res) => {
  const { tipo, modo, texto } = req.body || {};
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'Contame qué querés comunicar.' });
  if (!['informativo', 'producto', 'partido', 'celebracion'].includes(tipo)) {
    return res.status(400).json({ error: 'Elegí un tipo de diseño.' });
  }
  res.json({ jobId: lanzarJobGen(() => gen2.generarHistoria({ tipo, modo, texto })) });
});
app.post('/api/admin/gen2/retoque', requireAdmin, (req, res) => {
  const { url, instruccion, textos } = req.body || {};
  if (!url || !instruccion || !String(instruccion).trim()) {
    return res.status(400).json({ error: 'Falta la historia o el retoque a aplicar.' });
  }
  res.json({ jobId: lanzarJobGen(() => gen2.retocarHistoria({ url, instruccion, textos })) });
});

// ---- Generador de portadas de reel (15 jul): modelos fijos diseñados con el
// dueño. La IA pinta, el código posiciona. Ver lib/portadas.js. ----
const portadas = require('./lib/portadas');
app.post('/api/admin/gen2/portada', requireAdmin, (req, res) => {
  const { modelo, texto, foto } = req.body || {};
  if (!foto) return res.status(400).json({ error: 'Subí el frame o la captura del reel.' });
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'Escribí el texto de la portada.' });
  if (!['auto', 'producto', 'partido', 'elegante', 'impacto'].includes(modelo)) {
    return res.status(400).json({ error: 'Elegí un modelo de portada.' });
  }
  res.json({ jobId: lanzarJobGen(() => portadas.generarPortada({ modelo, texto, foto })) });
});

// La IA escribe el copy Y elige del banco la foto acorde a cada placa.
app.post('/api/admin/gen/copy', requireAdmin, async (req, res) => {
  const { instruccion, formato, modo } = req.body;
  if (!instruccion || !String(instruccion).trim()) {
    return res.status(400).json({ error: 'Contame qué querés comunicar.' });
  }
  res.json({ jobId: lanzarJobGen(() => trabajoGenCopy({ instruccion, formato, modo })) });
});
async function trabajoGenCopy({ instruccion, formato, modo }) {
  {
    const copy = await generarCopy(String(instruccion), formato);
    // Modo "placa completa IA": Gemini diseña todo (fondo incluido) → no hace
    // falta elegir fotos del banco (ahorra la llamada más lenta del flujo).
    // Excepción: si la instrucción pide la ambientación REAL de los locales
    // (ambienteReal), se elige una foto del banco por placa y viaja a Gemini
    // como referencia visual del ambiente.
    if (modo === 'completa') {
      copy.bancoUsado = false;
      const conAmbiente = (copy.placas || []).filter((p) => p.ambienteReal);
      if (conAmbiente.length) {
        try {
          // La foto debe coincidir con el TIPO de espacio de la escena (un salón
          // interior no se ambienta con la fachada, y viceversa).
          const escenas = conAmbiente
            .map((p, i) => (i + 1) + '. ' + String(p.escenaIA || '').slice(0, 160))
            .filter((s) => s.length > 3).join('\n');
          const elecciones = await elegirFotos(
            String(instruccion) + '\n(Estas placas necesitan una foto de las INSTALACIONES del local como referencia de ambientación — NO primeros planos de comida. La foto tiene que mostrar el MISMO tipo de espacio que la escena de cada placa: si la escena es un salón interior, elegí SOLO interiores (salón, mesas, barra, horno), NUNCA la fachada ni la calle; si la escena es exterior, elegí fachada o terraza. Escenas:\n' + escenas + ')',
            formato || 'historia', conAmbiente);
          await Promise.all(conAmbiente.map(async (p, i) => {
            const el = elecciones[i];
            if (el && el.driveId) {
              p.driveId = el.driveId;
              p.bancoId = el.bancoId;
              p.fotoUrl = await materializarFoto(el.driveId);
              p.motivo = el.motivo || '';
            }
          }));
        } catch (e) {
          copy.bancoAviso = e.code === 'BANCO_VACIO'
            ? 'Pediste la ambientación de los locales, pero el banco no está indexado: tocá «Sincronizar banco».'
            : 'No pude elegir la foto del local para ambientar: ' + e.message;
        }
      }
      // Ídem con el PRODUCTO real (productoReal): una foto del plato de verdad
      // viaja a Gemini para que la comida generada se vea como la nuestra.
      const conProducto = (copy.placas || []).filter((p) => p.productoReal);
      if (conProducto.length) {
        try {
          // La foto debe coincidir con el PLATO NOMBRADO en los textos, no solo
          // con la escena (una "napolitana" no se referencia con una a caballo).
          const escenas = conProducto
            .map((p, i) => (i + 1) + '. ' + [p.titulo, p.bajada].filter(Boolean).join(' — ').slice(0, 120) +
              ' · escena: ' + String(p.escenaIA || '').slice(0, 140))
            .join('\n');
          const elecciones = await elegirFotos(
            String(instruccion) + '\n(Estas placas necesitan una foto REAL del PRODUCTO como referencia del plato: primeros planos o planos cortos de NUESTRA comida. La foto tiene que mostrar el MISMO plato que NOMBRAN los textos de cada placa (si dice "napolitana", foto de napolitana — no otra variante). NUNCA fachadas, salones ni fotos sin comida. Placas:\n' + escenas + ')',
            formato || 'historia', conProducto);
          await Promise.all(conProducto.map(async (p, i) => {
            const el = elecciones[i];
            if (el && el.driveId) {
              p.fotoProductoUrl = await materializarFoto(el.driveId);
              p.motivoProducto = el.motivo || '';
            }
          }));
        } catch (e) {
          // Referencia opcional: la placa sale igual (100% generada, como antes).
          if (!copy.bancoAviso) copy.bancoAviso = e.code === 'BANCO_VACIO'
            ? 'La comida saldría más fiel con el banco indexado: tocá «Sincronizar banco».'
            : 'No pude elegir la foto de producto de referencia: ' + e.message;
        }
      }
      return copy;
    }
    // Selección automática de fotos del banco (si está indexado).
    try {
      const elecciones = await elegirFotos(String(instruccion), formato || 'historia', copy.placas);
      await Promise.all(copy.placas.map(async (p, i) => {
        const el = elecciones[i];
        if (el && el.driveId) {
          p.driveId = el.driveId;                 // para componer en full-res
          p.bancoId = el.bancoId;                 // para «dame otra» (excluir)
          p.fotoUrl = await materializarFoto(el.driveId); // para previsualizar
          p.motivo = el.motivo || '';
        }
      }));
      copy.bancoUsado = true;
    } catch (e) {
      copy.bancoUsado = false;
      copy.bancoAviso = e.code === 'BANCO_VACIO'
        ? 'El banco todavía no está indexado: tocá «Sincronizar banco» para que elija las fotos solo.'
        : 'No pude elegir fotos del banco automáticamente: ' + e.message;
    }
    // Aviso (no bloqueante) si quedó alguna placa sin foto, para que el editor la
    // resuelva a mano antes de componer en vez de descubrirlo recién al armar.
    // Sólo si el banco se consultó de verdad: si falló (banco vacío / error), ya hay
    // bancoAviso y este aviso sería redundante (doble modal por la misma causa).
    const sinFoto = (copy.placas || []).filter((p) => !p.driveId && !p.fotoUrl).length;
    if (sinFoto && copy.bancoUsado) {
      copy.avisos = (copy.avisos || []).concat(
        sinFoto + ' placa(s) quedaron sin foto: elegila a mano o tocá «Dame otra».');
    }
    return copy;
  }
}

// Afinar el prompt de imagen: un experto reteje el borrador de escena + los
// elementos a destacar en un solo prompt fotográfico pulido para Gemini.
app.post('/api/admin/gen/prompt-experto', requireAdmin, async (req, res) => {
  try {
    const { borrador, destacar, contexto, formato } = req.body;
    const prompt = await afinarPromptIA({
      borrador: String(borrador || ''),
      destacar: Array.isArray(destacar) ? destacar.map((s) => String(s)).filter(Boolean) : [],
      contexto: String(contexto || ''),
      formato: formato || 'historia',
    });
    res.json({ prompt });
  } catch (e) {
    console.error('[Gen prompt-experto] Error:', e.message);
    res.status(500).json({ error: 'No pude afinar el prompt: ' + e.message });
  }
});

// Ajuste conversacional: el usuario ya vio las piezas y pide cambios en
// lenguaje natural. La IA reescribe copy/logo y, si hace falta, cambia la foto.
app.post('/api/admin/gen/ajustar', requireAdmin, async (req, res) => {
  const { instruccion, formato, placas, caption } = req.body;
  if (!instruccion || !String(instruccion).trim()) {
    return res.status(400).json({ error: 'Contame qué querés ajustar.' });
  }
  if (!Array.isArray(placas) || !placas.length) {
    return res.status(400).json({ error: 'No hay piezas para ajustar.' });
  }
  res.json({ jobId: lanzarJobGen(() => trabajoGenAjustar({ instruccion, formato, placas, caption })) });
});
async function trabajoGenAjustar({ instruccion, formato, placas, caption }) {
  {
    // En paralelo: copy/foto/estilo/logo (ajustarCopy) + diseño tamaño/posición/ocultar
    // (interpretarRetoque). Una sola caja maneja TODO. El diseño se mergea acumulativo
    // sobre el adj que ya traía cada placa (rondas sucesivas suman, no pisan).
    const [out, adjGlobal] = await Promise.all([
      ajustarCopy(String(instruccion), formato, placas, caption),
      interpretarRetoque(String(instruccion)),
    ]);

    // Merge acumulativo del diseño: claves nuevas pisan a las viejas (una escala en 1
    // resetea a normal). "ocultar" se UNE entre rondas; "mostrar" lo revierte (saca de
    // ocultar) y es transitorio (no se guarda). Devuelve undefined si queda vacío.
    const mergeAdj = (prev, next) => {
      if (!next) return prev || undefined;
      const m = { ...(prev || {}), ...next };
      let oc = Array.from(new Set([...((prev && prev.ocultar) || []), ...(next.ocultar || [])]));
      if (next.mostrar && next.mostrar.length) oc = oc.filter((k) => !next.mostrar.includes(k));
      delete m.mostrar;
      if (oc.length) m.ocultar = oc; else delete m.ocultar;
      return Object.keys(m).length ? m : undefined;
    };

    // Guard anti-borrado: vaciar un campo ("") solo vale si la indicación pide
    // sacar algo. Sin intención de sacar, un "" del modelo (típico cuando el
    // schema cae al modo sin gramática y completa campos "por las dudas") se
    // ignora y se conserva el texto actual.
    const pideSacar = /\b(sac[aá]|quit[aá]|borr[aá]|elimin[aá]|sin|fuera|no (?:quiero|pongas|va|vaya)|s[oó]lo|solamente|nada m[aá]s)\b/i.test(String(instruccion));
    const campoTxt = (nuevo, viejo) => {
      if (nuevo == null) return viejo;
      if (nuevo === '' && viejo && !pideSacar) return viejo;
      return nuevo;
    };

    // Aplica los cambios de texto/logo sobre las placas actuales (preserva la foto).
    const result = placas.map((orig, i) => {
      const nu = out.placas[i] || {};
      const adj = mergeAdj(orig.adj, adjGlobal);
      return {
        ...orig,
        titulo: campoTxt(nu.titulo, orig.titulo),
        acento: campoTxt(nu.acento, orig.acento),
        bajada: campoTxt(nu.bajada, orig.bajada),
        cta: campoTxt(nu.cta, orig.cta),
        lugar: campoTxt(nu.lugar, orig.lugar),
        banderas: (nu.banderas != null && !(Array.isArray(nu.banderas) && !nu.banderas.length && (orig.banderas || []).length && !pideSacar))
          ? nu.banderas : (orig.banderas || []),
        evento: campoTxt(nu.evento, orig.evento) || '',
        estilo: nu.estilo || orig.estilo || 'clasico',
        logo: nu.logo || orig.logo || 'wordmark-blanco',
        adj,
        _cambiarFoto: !!nu.cambiarFoto,
        _fotoHint: nu.fotoHint || '',
        _notaDiseno: (nu.notaDiseno || '').trim(),
      };
    });

    // Placas en modo "placa completa IA": los pedidos VISUALES (layout, banderas,
    // tamaño, colores, escena) no pasan por el retoque de sharp — el modelo de
    // ajuste los devuelve como notaDiseno por placa y acá se acumulan (últimas 3)
    // para que el redactor de prompts los teja en el próximo prompt.
    for (let i = 0; i < result.length; i++) {
      const p = result[i];
      const orig = placas[i] || {};
      if (p._notaDiseno && p.modoIA === 'completa') {
        const notas = String(p.notasDiseno || '').split(' | ').filter(Boolean);
        notas.push(p._notaDiseno);
        p.notasDiseno = notas.slice(-3).join(' | ');
      }
      // EDICIÓN QUIRÚRGICA: si esta placa completa ya tiene imagen y el ajuste la
      // tocó (textos o pedido visual), la instrucción cruda viaja como _edicionIA
      // → componer EDITA la imagen existente (misma escena) en vez de regenerarla.
      // Cambiar la foto/escena sigue regenerando de cero (_cambiarFoto la pisa).
      const claves = ['titulo', 'acento', 'bajada', 'cta', 'lugar', 'evento'];
      const cambio = !!p._notaDiseno ||
        claves.some((k) => String(p[k] || '') !== String(orig[k] || '')) ||
        JSON.stringify(p.banderas || []) !== JSON.stringify(orig.banderas || []);
      if (p.modoIA === 'completa' && p.iaPlacaUrl && cambio && !p._cambiarFoto) {
        p._edicionIA = String(instruccion);
      }
      delete p._notaDiseno;
    }

    // Cambia la foto solo donde la indicación lo pidió.
    for (const p of result) {
      if (p._cambiarFoto && p.modoIA === 'completa') {
        // En modo placa completa no hay banco: el pedido de otra imagen se suma
        // a la escena base y se invalida el cache para que regenere.
        const extra = p._fotoHint || String(instruccion);
        p.iaPrompt = (String(p.iaPrompt || p.escenaIA || '').trim() + '. ' + extra).replace(/^\.\s*/, '');
        p.iaPlacaUrl = null;
        delete p._cambiarFoto;
        delete p._fotoHint;
        continue;
      }
      if (p._cambiarFoto) {
        try {
          const hint = (p._fotoHint ? p._fotoHint + '. ' : '') + String(instruccion);
          const el = (await elegirFotos(hint, formato || 'historia',
            [{ titulo: p.titulo, bajada: p.bajada, cta: p.cta }], p.descartadas || []))[0];
          if (el && el.driveId) {
            p.driveId = el.driveId;
            p.bancoId = el.bancoId;
            p.motivo = el.motivo || '';
            p.fotoUrl = await materializarFoto(el.driveId);
            p.descartadas = (p.descartadas || []).concat(el.bancoId);
            p.iaPrompt = null;
          }
        } catch (e) {
          console.error('[Gen ajustar] foto:', e.message); // si falla, deja la foto actual
        }
      }
      delete p._cambiarFoto;
      delete p._fotoHint;
    }

    return { placas: result, caption: out.caption != null ? out.caption : caption };
  }
}

// Portada para Reel: imagen 9:16 LIMPIA (sin texto) para usar de portada de un reel.
// modo 'generar' (tema + color) o 'limpiar' (frame subido en base64). El título grande
// lo agrega el usuario después en su editor de reel.
app.post('/api/admin/gen/portada', requireAdmin, async (req, res) => {
  const { modo, tema, color, frameB64, titulo, campos, diseno } = req.body || {};
  if (modo !== 'generar' && !frameB64) {
    return res.status(400).json({ error: 'Subí un frame del reel para limpiar.' });
  }
  res.json({ jobId: lanzarJobGen(async () => {
    let buf, copy;
    if (modo === 'generar') {
      // Portada editorial "Método Ana": el PRO pinta todo + logo real. Devuelve
      // también el copy usado para que el panel lo muestre y se pueda editar/rehacer.
      const out = await generarPortadaEditorial({ tema, color, campos });
      buf = out.buf; copy = out.copy;
    } else {
      const frameBuf = Buffer.from(String(frameB64).replace(/^data:image\/\w+;base64,/, ''), 'base64');
      buf = await generarPortadaReel({ modo, frameBuf, titulo, diseno });
    }
    const objectPath = 'social/portada-reel-' + Date.now() + '.jpg';
    const { error } = await supabaseAdmin.storage.from('ppweb-blog')
      .upload(objectPath, buf, { contentType: 'image/jpeg' });
    if (error) throw new Error('Storage: ' + error.message);
    const url = supabaseAdmin.storage.from('ppweb-blog').getPublicUrl(objectPath).data.publicUrl;
    return copy ? { url, copy } : { url };
  }) });
});

// Compone las piezas finales (foto + gráfica de marca) y las sube al storage.
app.post('/api/admin/gen/piezas', requireAdmin, async (req, res) => {
  const { formato, placas } = req.body;
  if (!Array.isArray(placas) || !placas.length) {
    return res.status(400).json({ error: 'No hay placas para componer.' });
  }
  // placas trae la iaFotoUrl/iaPlacaUrl cacheadas; avisos, la verificación de placas IA.
  res.json({ jobId: lanzarJobGen(() => generarPiezas(formato, placas.slice(0, 6))) });
});

// ---- Inteligencia: tablero + informes semanales ----
app.get('/api/admin/intel/overview', requireAdmin, async (req, res) => {
  try {
    res.json(await getOverview());
  } catch (e) {
    console.error('[Intel] Error:', e.message);
    res.status(500).json({ error: 'No se pudo cargar Inteligencia: ' + e.message });
  }
});

app.get('/api/admin/intel/informes', requireAdmin, async (req, res) => {
  try {
    res.json(await getInformes());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Genera un informe a pedido. El mail sale solo con el cron de los lunes.
app.post('/api/admin/intel/informes', requireAdmin, async (req, res) => {
  try {
    const row = await generarInforme();
    if (req.body && req.body.enviar) await emailInforme(row);
    res.json(row);
  } catch (e) {
    console.error('[Intel] Error al generar:', e.message);
    res.status(500).json({ error: 'No se pudo generar el informe: ' + e.message });
  }
});

// ---- Analítica: web propia + Instagram (panel) ----
app.get('/api/admin/analitica/web', requireAdmin, async (req, res) => {
  try {
    res.json(await getWebStats(req.query.mes));
  } catch (e) {
    console.error('[Analitica web] Error:', e.message);
    res.status(500).json({ error: 'No se pudo cargar la analítica web: ' + e.message });
  }
});

app.get('/api/admin/analitica/instagram', requireAdmin, async (req, res) => {
  try {
    res.json(await ig.getIgStats(req.query.mes));
  } catch (e) {
    console.error('[Analitica IG] Error:', e.message);
    res.status(500).json({ error: 'No se pudo cargar Instagram: ' + e.message });
  }
});

// Mejores publicaciones de Instagram del mes (en vivo desde la API).
app.get('/api/admin/analitica/instagram/top', requireAdmin, async (req, res) => {
  try {
    res.json(await ig.getTopMedia(req.query.mes));
  } catch (e) {
    console.error('[Analitica IG top] Error:', e.message);
    res.status(500).json({ error: 'No se pudieron cargar las publicaciones: ' + e.message });
  }
});

// Fuerza un snapshot de Instagram a pedido (botón «Actualizar» del panel).
app.post('/api/admin/analitica/instagram/snapshot', requireAdmin, async (req, res) => {
  try {
    res.json(await ig.snapshotIg());
  } catch (e) {
    console.error('[Analitica IG] Snapshot:', e.message);
    res.status(500).json({ error: 'No se pudo actualizar Instagram: ' + e.message });
  }
});

// Reseñas de Google por local (reusa google-places.js + histórico Supabase).
app.get('/api/admin/analitica/google', requireAdmin, async (req, res) => {
  try {
    res.json(await getGoogleStats());
  } catch (e) {
    console.error('[Analitica Google] Error:', e.message);
    res.status(500).json({ error: 'No se pudieron cargar las reseñas: ' + e.message });
  }
});

// Meta Ads (Marketing API). Lee del caché diario; no llama en vivo.
app.get('/api/admin/analitica/meta', requireAdmin, async (req, res) => {
  try {
    res.json(await metaAds.getMetaStats());
  } catch (e) {
    console.error('[Analitica Meta] Error:', e.message);
    res.status(500).json({ error: 'No se pudo cargar Meta Ads: ' + e.message });
  }
});

// Fuerza un snapshot de Meta Ads a pedido (botón «Actualizar»). Ojo: rate limit.
app.post('/api/admin/analitica/meta/snapshot', requireAdmin, async (req, res) => {
  try {
    res.json(await metaAds.snapshotMeta());
  } catch (e) {
    console.error('[Analitica Meta] Snapshot:', e.message);
    res.status(500).json({ error: 'No se pudo actualizar Meta Ads: ' + e.message });
  }
});

// ---- PAUTA (sección "Pauta" del panel) — desglose por anuncio. Solo dueño. ----
// Lee el snapshot por anuncio (ppweb_meta_ads): total de campaña + por local + por imagen.
// requireOwner está definido más abajo (hoisting de function declaration).
app.get('/api/admin/pauta', requireAdmin, requireOwner, async (req, res) => {
  try {
    res.json(await metaAds.getPautaData());
  } catch (e) {
    console.error('[Pauta] Error:', e.message);
    res.status(500).json({ error: 'No se pudo cargar la pauta: ' + e.message });
  }
});

// Fuerza el snapshot por anuncio a pedido (botón «Actualizar»). Ojo: rate limit.
app.post('/api/admin/pauta/snapshot', requireAdmin, requireOwner, async (req, res) => {
  try {
    res.json(await metaAds.snapshotMetaAds());
  } catch (e) {
    console.error('[Pauta] Snapshot:', e.message);
    res.status(500).json({ error: 'No se pudo actualizar la pauta: ' + e.message });
  }
});

// ========== PANEL ADMIN — RESEÑAS GOOGLE (sección Google Maps) ==========
// Gestión de reseñas con IA. Fase 1 (semi-manual): generar 3 respuestas con el
// tono Popular → elegir/editar → guardar en pp_resenas_google. Solo dueño.
// Ver lib/google-reviews.js. Fase 2 (jul 2026, API aprobada): OAuth + sync
// automático de reseñas + publicación de respuestas. Ver lib/gbp.js.

// Gate dueño-only: además de admin, role 'dueno' (mismo criterio que /api/admin/me).
async function requireOwner(req, res, next) {
  try {
    const access = await menu.getMenuAccess(req.adminUser.id);
    if (access && access.role === 'dueno') return next();
  } catch (_) {}
  return res.status(403).json({ error: 'Solo el dueño puede gestionar las reseñas.' });
}

app.post('/api/admin/resenas/generar', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.generar(req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/admin/resenas/guardar', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.guardar(req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/admin/resenas/historial', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.historial(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/admin/resenas/metricas', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.metricas(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// "Lo que dice la gente": positivos/negativos resumidos del texto de las reseñas.
app.get('/api/admin/resenas/voz', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.vozCliente()); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Salud por local: exactos del histórico sincronizado (media real, distribución,
// faltan-para-subir matemático, tasa de respuesta, evolución mensual).
app.get('/api/admin/resenas/salud', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.salud(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Insights IA: temas repetidos, empleados más mencionados, platos, idiomas.
app.get('/api/admin/resenas/insights', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.insights(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Menciones del equipo: quién es nombrado en las reseñas del rango elegido y
// con qué frases. Mismo filtro de local y fechas que el resto de la sección.
app.get('/api/admin/resenas/menciones', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await menciones.menciones(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// El mismo informe en PDF, para imprimirlo o mandárselo al camarero.
// ?empleado=Cata → informe individual (más frases y portada personal).
app.get('/api/admin/resenas/menciones/pdf', requireAdmin, requireOwner, async (req, res) => {
  try {
    const personal = !!req.query.empleado;
    const informe = await menciones.menciones({ ...req.query, frases: personal ? 40 : 10 });
    const pdf = await mencionesPdf.generar(informe, { personal });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      'attachment; filename="' + mencionesPdf.nombreArchivo(informe, personal) + '"');
    res.send(pdf);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.put('/api/admin/resenas/:id', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.actualizar(req.params.id, req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.get('/api/admin/resenas/pendientes/count', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await resenas.pendientesCount()); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/admin/resenas/notificar-telegram', requireAdmin, requireOwner, async (req, res) => {
  const { local_id, estrellas, texto_original, cliente_nombre } = req.body || {};
  if (!resenas.validateLocal(local_id)) return res.status(400).json({ error: 'local_id inválido' });
  if (!Number.isInteger(estrellas)) return res.status(400).json({ error: 'estrellas inválido' });
  if (!texto_original) return res.status(400).json({ error: 'texto_original requerido' });
  try { res.json(await resenas.notificarTelegram({ local_id, estrellas, texto_original, cliente_nombre })); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ---- Fase 2: Business Profile API (OAuth + sync + publicar) ----

// Estado de la conexión (para pintar la tarjeta GBP del panel).
app.get('/api/admin/google/gbp/estado', requireAdmin, requireOwner, (req, res) => {
  try { res.json(gbp.estado()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Devuelve la URL de consentimiento; el panel la abre en una pestaña nueva.
app.get('/api/admin/google/oauth/start', requireAdmin, requireOwner, (req, res) => {
  try { res.json({ url: googleOAuth.authUrl() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Callback del consentimiento. Llega por redirect del navegador (sin Bearer):
// lo protege el state de un solo uso generado en /start.
app.get('/api/admin/google/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/admin/?google=denegado');
  if (!code || !googleOAuth.validState(state)) return res.redirect('/admin/?google=error');
  try {
    await googleOAuth.exchangeCode(code);
    res.redirect('/admin/?google=ok');
  } catch (e) {
    console.error('[Google OAuth] Callback:', e.message);
    res.redirect('/admin/?google=error');
  }
});

// Descubre la cuenta y mapea las locations contra los placeId conocidos.
app.post('/api/admin/google/gbp/descubrir', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbp.descubrir()); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Sincroniza reseñas. body {full:true} = backfill histórico completo.
app.post('/api/admin/google/gbp/sync', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbp.sync({ full: !!(req.body && req.body.full) })); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Publica en Google la respuesta elegida/editada de una reseña sincronizada.
app.post('/api/admin/resenas/:id/publicar', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbp.publicar(req.params.id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Rendimiento oficial de las fichas (Performance API, respeta local y fechas).
app.get('/api/admin/google/rendimiento', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbpPerformance.rendimiento(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ---- Novedades de Google (localPosts): cola supervisada ----
app.get('/api/admin/gbp-posts', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbpPosts.listar()); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/api/admin/gbp-posts/generar', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbpPosts.generarBorradores()); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Publica un borrador (el texto editado viaja en el body y se guarda).
app.post('/api/admin/gbp-posts/:id/publicar', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbpPosts.publicar(req.params.id, req.body && req.body.resumen)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.patch('/api/admin/gbp-posts/:id', requireAdmin, requireOwner, async (req, res) => {
  try { res.json(await gbpPosts.guardar(req.params.id, req.body || {})); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ========== PANEL ADMIN — MENÚ DIGITAL ==========
// Portado de habit-tracker. Mismo proyecto Supabase; el menú PÚBLICO y los QR
// siguen viviendo en Railway. Acá solo va el plano de CONTROL (admin).
// Entrada gateada por requireAdmin (ppweb_admins); el scope fino por local lo
// resuelve menu.getMenuAccess() dentro de cada handler.
async function menuCtx(req) {
  const access = await menu.getMenuAccess(req.adminUser.id);
  if (!access.restaurantIds.length) {
    const e = new Error('Sin acceso al menú digital'); e.status = 403; throw e;
  }
  const ajaxId = await menu.getAjaxRestaurantId();
  return { userId: req.adminUser.id, access, ajaxId };
}

// Resuelve ctx, ejecuta fn(ctx, req, res) y serializa el retorno (si lo hay).
// Las funciones binarias (QR) setean headers y mandan ellas → devuelven undefined.
function menuRoute(fn) {
  return async (req, res) => {
    try {
      const ctx = await menuCtx(req);
      const out = await fn(ctx, req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) {
      console.error('[Menú] Error:', e.message);
      if (!res.headersSent) res.status(e.status || 500).json({ error: e.message });
    }
  };
}

// --- Restaurants ---
app.get('/api/admin/menu/restaurants', requireAdmin, menuRoute((ctx) => menu.listRestaurants(ctx)));
app.get('/api/admin/menu/restaurants/:id/qr', requireAdmin, menuRoute(async (ctx, req, res) => {
  const out = await menu.generateQr(ctx, req.params.id, req.query);
  res.setHeader('Content-Type', out.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.send(out.body);
}));
app.put('/api/admin/menu/restaurants/:id/hero', requireAdmin, menuRoute((ctx, req) => menu.updateHero(ctx, req.params.id, req.body)));
app.delete('/api/admin/menu/restaurants/:id/hero', requireAdmin, menuRoute((ctx, req) => menu.deleteHero(ctx, req.params.id)));
app.put('/api/admin/menu/restaurants/:id/contact', requireAdmin, menuRoute((ctx, req) => menu.updateContact(ctx, req.params.id, req.body)));

// --- Categories ---
app.get('/api/admin/menu/categories', requireAdmin, menuRoute((ctx, req) => menu.listCategories(ctx, req.query.restaurant_id)));
app.post('/api/admin/menu/categories', requireAdmin, menuRoute((ctx, req) => menu.createCategory(ctx, req.body)));
app.put('/api/admin/menu/categories/:id', requireAdmin, menuRoute((ctx, req) => menu.updateCategory(ctx, req.params.id, req.body)));
app.delete('/api/admin/menu/categories/:id', requireAdmin, menuRoute((ctx, req) => menu.deleteCategory(ctx, req.params.id)));
app.post('/api/admin/menu/categories/reorder', requireAdmin, menuRoute((ctx, req) => menu.reorderCategories(ctx, req.body)));
app.post('/api/admin/menu/categories/:id/override', requireAdmin, menuRoute((ctx, req) => menu.overrideCategory(ctx, req.params.id, req.body)));

// --- Subcategories ---
app.get('/api/admin/menu/subcategories', requireAdmin, menuRoute((ctx, req) => menu.listSubcategories(ctx, req.query.category_id, req.query.restaurant_id)));
app.post('/api/admin/menu/subcategories', requireAdmin, menuRoute((ctx, req) => menu.createSubcategory(ctx, req.body)));
app.put('/api/admin/menu/subcategories/:id', requireAdmin, menuRoute((ctx, req) => menu.updateSubcategory(ctx, req.params.id, req.body)));
app.delete('/api/admin/menu/subcategories/:id', requireAdmin, menuRoute((ctx, req) => menu.deleteSubcategory(ctx, req.params.id)));
app.post('/api/admin/menu/subcategories/reorder', requireAdmin, menuRoute((ctx, req) => menu.reorderSubcategories(ctx, req.body)));
app.post('/api/admin/menu/subcategories/:id/override', requireAdmin, menuRoute((ctx, req) => menu.overrideSubcategory(ctx, req.params.id, req.body)));

// --- Items ---
app.get('/api/admin/menu/items', requireAdmin, menuRoute((ctx, req) => menu.listItems(ctx, req.query.subcategory_id, req.query.restaurant_id)));
app.get('/api/admin/menu/items/:id', requireAdmin, menuRoute((ctx, req) => menu.getItem(ctx, req.params.id, req.query.restaurant_id)));
app.post('/api/admin/menu/items', requireAdmin, menuRoute((ctx, req) => menu.createItem(ctx, req.body)));
app.put('/api/admin/menu/items/:id', requireAdmin, menuRoute((ctx, req) => menu.updateItem(ctx, req.params.id, req.body)));
app.delete('/api/admin/menu/items/:id', requireAdmin, menuRoute((ctx, req) => menu.deleteItem(ctx, req.params.id, req.query.restaurant_id)));
app.post('/api/admin/menu/items/reorder', requireAdmin, menuRoute((ctx, req) => menu.reorderItems(ctx, req.body)));
app.post('/api/admin/menu/items/:id/restore', requireAdmin, menuRoute((ctx, req) => menu.restoreItem(ctx, req.params.id, req.body)));

// --- Image upload ---
app.post('/api/admin/menu/upload-image', requireAdmin, menuRoute((ctx, req) => menu.uploadImage(ctx, req.body)));

// --- Analytics ---
app.get('/api/admin/menu-analytics/summary', requireAdmin, menuRoute((ctx, req) => menuAnalytics.getSummary(ctx, req.query)));
app.get('/api/admin/menu-analytics/global', requireAdmin, menuRoute((ctx, req) => menuAnalytics.getGlobal(ctx, req.query)));

// ========== 404 ==========
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC, 'pages/404.html'));
});

// ========== CRON: Ratings de Google, todos los días 3am ==========
// Era semanal y la portada de la web se veía con datos de hasta 6 días atrás.
// Son 6 llamadas a Places por día: entra de sobra en el tramo gratis.
cron.schedule('0 3 * * *', () => {
  console.log('[Cron] Running daily Google ratings update...');
  updateRatings()
    .then(() => snapshotGoogle())
    .then(() => volcarRatingsARestaurants())
    .catch(err => console.error('[Cron] Error:', err.message));
});

// ========== CRON: Snapshot diario de reseñas Google (todos los días, 3:15am) ==========
cron.schedule('15 3 * * *', () => {
  snapshotGoogle().catch(err => console.error('[Cron Google snapshot] Error:', err.message));
});

// ========== CRON: Sync de reseñas Google vía GBP API (cada 15 min) ==========
// Incremental: corta apenas encuentra una página sin cambios. Si el OAuth no
// está conectado o los locales no están mapeados, no hace nada (silencioso).
cron.schedule('*/15 * * * *', async () => {
  if (!googleOAuth.conectado() || !gbp.mapeado()) return;
  try {
    const r = await gbp.sync({ full: false });
    const nuevas = r.resultados.reduce((s, x) => s + (x.nuevas || 0), 0);
    if (nuevas > 0) console.log('[Cron GBP] ' + nuevas + ' reseñas nuevas sincronizadas.');
  } catch (e) {
    console.error('[Cron GBP] Error:', e.message);
  }
  // Auto-responder 4-5★ (plantillas del dueño; lo mejorable queda para humano).
  try { await autoResenas.autoResponder({ limit: 30 }); }
  catch (e) { console.error('[Auto reseñas] Error:', e.message); }
  // Pre-redactar la respuesta de las que quedan para humano (publicación 1-click).
  try { await autoResenas.prepararBorradores({ limit: 10 }); }
  catch (e) { console.error('[Borradores] Error:', e.message); }
});

// ========== CRON: Pre-calentar caches del panel Google (7:30am) ==========
// Salud, insights y rendimiento tienen cache diario: calcularlos temprano
// hace que la primera carga del panel sea instantánea.
cron.schedule('30 7 * * *', async () => {
  if (!googleOAuth.conectado() || !gbp.mapeado()) return;
  try { await resenas.salud(); } catch (e) { console.error('[Warm salud]', e.message); }
  try { await gbpPerformance.rendimiento({}); } catch (e) { console.error('[Warm rendimiento]', e.message); }
  if (process.env.ANTHROPIC_API_KEY) {
    try { await resenas.insights({}); } catch (e) { console.error('[Warm insights]', e.message); }
  }
  console.log('[Warm] caches del panel Google listos.');
});

// ========== CRON: Foto fresca semanal en las fichas (miércoles 11am) ==========
// Google premia la recencia de fotos; rota el banco de fotos reales.
cron.schedule('0 11 * * 3', async () => {
  if (!googleOAuth.conectado() || !gbp.mapeado()) return;
  try { await gbpFotos.subirSemana(); }
  catch (e) { console.error('[GBP Fotos] Error:', e.message); }
});

// ========== CRON: Borradores de Novedades de Google (lunes 9am) ==========
// Genera UN borrador por local y lo deja en la cola del panel. NO publica.
cron.schedule('0 9 * * 1', async () => {
  if (!googleOAuth.conectado() || !gbp.mapeado() || !process.env.ANTHROPIC_API_KEY) return;
  try {
    const r = await gbpPosts.generarBorradores();
    const nuevos = r.resultados.filter((x) => x.id).length;
    if (nuevos) console.log('[Cron GBP Posts] ' + nuevos + ' borradores nuevos en la cola.');
  } catch (e) {
    console.error('[Cron GBP Posts] Error:', e.message);
  }
});

// ========== CRON: Publica las Novedades aprobadas al llegar su franja ==========
// El dueño aprueba cuando quiere; el post sale en el horario del local (Playa
// San Juan al mediodía, Luceros y Benidorm de noche). Corre cada hora en punto:
// el server va en UTC, así que la franja se calcula en lib/gbp-posts.js contra
// la hora de España y acá solo se pregunta qué venció.
cron.schedule('2 * * * *', async () => {
  if (!googleOAuth.conectado() || !gbp.mapeado()) return;
  try { await gbpPosts.publicarProgramados(); }
  catch (e) { console.error('[Cron GBP Posts agenda] Error:', e.message); }
});

// ========== CRON: Snapshot diario de Meta Ads (todos los días, 4am) ==========
cron.schedule('0 4 * * *', () => {
  if (!metaAds.configurado()) return;
  metaAds.snapshotMeta().catch(err => console.error('[Cron Meta Ads] Error:', err.message));
  metaAds.snapshotMetaAds().catch(err => console.error('[Cron Pauta (por anuncio)] Error:', err.message));
});

// ========== CRON: Autopublicar posts pendientes (todos los días, 6am) ==========
cron.schedule('0 6 * * *', async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await supabaseAdmin
      .from('ppweb_posts')
      .update({ estado: 'publicado' })
      .eq('estado', 'pendiente')
      .lte('fecha', hoy)
      .select('slug');
    if (error) console.error('[Autopublish] Error:', error.message);
    else if (data && data.length) {
      console.log('[Autopublish] Posts publicados:', data.map(p => p.slug).join(', '));
    }
  } catch (e) {
    console.error('[Autopublish] Error:', e.message);
  }
});

// ========== CRON: Análisis diario del chat de Pepe (todos los días, 7am) ==========
cron.schedule('0 7 * * *', async () => {
  console.log('[Cron] Análisis diario del chat de Pepe...');
  try {
    await analyze();
    console.log('[Cron] Análisis del chat generado.');
  } catch (e) {
    console.error('[Cron chat] Error:', e.message);
  }
});

// ========== CRON: Snapshot diario de Instagram (todos los días, 6:30am) ==========
cron.schedule('30 6 * * *', async () => {
  if (!ig.configurado()) return;
  console.log('[Cron] Snapshot diario de Instagram...');
  try {
    await ig.snapshotIg();
    console.log('[Cron] Snapshot de Instagram guardado.');
  } catch (e) {
    console.error('[Cron IG] Error:', e.message);
  }
});

// ========== CRON: Renovar token de Instagram (domingos 5am) ==========
cron.schedule('0 5 * * 0', async () => {
  if (!ig.configurado()) return;
  console.log('[Cron] Renovando token de Instagram...');
  try {
    await ig.refreshToken();
  } catch (e) {
    console.error('[Cron IG token] Error:', e.message);
  }
});

// ========== CRON: Informe semanal de Inteligencia (lunes 8am) ==========
cron.schedule('0 8 * * 1', async () => {
  console.log('[Cron] Generando informe semanal de Inteligencia...');
  try {
    const row = await generarInforme();
    const enviado = await emailInforme(row);
    console.log('[Cron] Informe generado' + (enviado ? ' y enviado por mail.' : ' (mail no configurado).'));
  } catch (e) {
    console.error('[Cron intel] Error:', e.message);
  }
});

app.listen(PORT, async () => {
  console.log(`Pizzería Popular running on http://localhost:${PORT}`);

  // Initial fetch if no data exists
  if (!ratingsExist()) {
    console.log('[Startup] No google-ratings.json found, fetching initial data...');
    await updateRatings().catch(err => console.error('[Startup] Error:', err.message));
  } else {
    const data = loadRatings();
    if (data) console.log(`[Startup] Google ratings loaded (updated: ${data.updatedAt})`);
  }
});
