const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { updateRatings, loadRatings, ratingsExist } = require('./google-places');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// Parse JSON & form data
app.use(express.json());
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

// ========== 404 ==========
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC, 'pages/404.html'));
});

// ========== CRON: Update Google ratings every 7 days (Sunday 3am) ==========
cron.schedule('0 3 * * 0', () => {
  console.log('[Cron] Running weekly Google ratings update...');
  updateRatings().catch(err => console.error('[Cron] Error:', err.message));
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
