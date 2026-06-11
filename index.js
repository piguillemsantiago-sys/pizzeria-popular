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
const { generarCopy, ajustarCopy, generarPiezas, geminiDisponible, materializarFoto } = require('./lib/generador');
const { sincronizar: sincronizarBanco, estado: estadoBanco, elegirFotos } = require('./lib/banco');
const { listarReferencias } = require('./lib/referencia');

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

// Static files
app.use(express.static(PUBLIC));

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
app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true, email: req.adminUser.email, id: req.adminUser.id });
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

// La IA escribe el copy Y elige del banco la foto acorde a cada placa.
app.post('/api/admin/gen/copy', requireAdmin, async (req, res) => {
  try {
    const { instruccion, formato } = req.body;
    if (!instruccion || !String(instruccion).trim()) {
      return res.status(400).json({ error: 'Contame qué querés comunicar.' });
    }
    const copy = await generarCopy(String(instruccion), formato);
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
    res.json(copy);
  } catch (e) {
    console.error('[Gen copy] Error:', e.message);
    res.status(500).json({ error: 'No pude generar el copy: ' + e.message });
  }
});

// Ajuste conversacional: el usuario ya vio las piezas y pide cambios en
// lenguaje natural. La IA reescribe copy/logo y, si hace falta, cambia la foto.
app.post('/api/admin/gen/ajustar', requireAdmin, async (req, res) => {
  try {
    const { instruccion, formato, placas, caption } = req.body;
    if (!instruccion || !String(instruccion).trim()) {
      return res.status(400).json({ error: 'Contame qué querés ajustar.' });
    }
    if (!Array.isArray(placas) || !placas.length) {
      return res.status(400).json({ error: 'No hay piezas para ajustar.' });
    }
    const out = await ajustarCopy(String(instruccion), formato, placas, caption);

    // Aplica los cambios de texto/logo sobre las placas actuales (preserva la foto).
    const result = placas.map((orig, i) => {
      const nu = out.placas[i] || {};
      return {
        ...orig,
        titulo: nu.titulo != null ? nu.titulo : orig.titulo,
        acento: nu.acento != null ? nu.acento : orig.acento,
        bajada: nu.bajada != null ? nu.bajada : orig.bajada,
        cta: nu.cta != null ? nu.cta : orig.cta,
        lugar: nu.lugar != null ? nu.lugar : orig.lugar,
        estilo: nu.estilo || orig.estilo || 'clasico',
        logo: nu.logo || orig.logo || 'wordmark-blanco',
        _cambiarFoto: !!nu.cambiarFoto,
        _fotoHint: nu.fotoHint || '',
      };
    });

    // Cambia la foto solo donde la indicación lo pidió.
    for (const p of result) {
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

    res.json({ placas: result, caption: out.caption != null ? out.caption : caption });
  } catch (e) {
    console.error('[Gen ajustar] Error:', e.message);
    res.status(500).json({ error: 'No pude aplicar el ajuste: ' + e.message });
  }
});

// Compone las piezas finales (foto + gráfica de marca) y las sube al storage.
app.post('/api/admin/gen/piezas', requireAdmin, async (req, res) => {
  try {
    const { formato, placas } = req.body;
    if (!Array.isArray(placas) || !placas.length) {
      return res.status(400).json({ error: 'No hay placas para componer.' });
    }
    const urls = await generarPiezas(formato, placas.slice(0, 6));
    res.json({ urls });
  } catch (e) {
    console.error('[Gen piezas] Error:', e.message);
    const status = e.code === 'NO_KEY' ? 422 : 500;
    res.status(status).json({ error: e.message });
  }
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

// ========== 404 ==========
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC, 'pages/404.html'));
});

// ========== CRON: Update Google ratings every 7 days (Sunday 3am) ==========
cron.schedule('0 3 * * 0', () => {
  console.log('[Cron] Running weekly Google ratings update...');
  updateRatings().catch(err => console.error('[Cron] Error:', err.message));
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
