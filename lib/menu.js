// ============================================================
// lib/menu.js — backend del Menú Digital (admin).
// Portado desde habit-tracker/src/routes/admin-menu.js, reescrito al
// patrón del panel: funciones puras (ctx, params) en vez de express.Router.
//
//   ctx = { userId, access: {isOwner, role, restaurantIds}, ajaxId }
//   - el handler en index.js resuelve ctx una vez (menuCtx) y delega acá.
//   - errores: throw httpError(status, msg) → index.js respeta e.status.
//   - funciones binarias (QR) devuelven { body, contentType, filename }.
//
// Endurecimiento vs. origen: las operaciones sobre la estructura MAESTRA
// (AJAX) — alta/edición/borrado/reorden de categorías, subcategorías e
// items maestros — exigen access.isOwner (cierra el agujero de subcategorías
// del origen, que no chequeaba acceso). Los overrides por local siguen
// gateados por assertAllowed(restaurant_id).
// ============================================================
const QRCode = require('qrcode');
const { supabaseAdmin } = require('./supabase');
const {
  getAjaxRestaurantId, getAdminCategories, getAdminSubcategories, getAdminItems, AJAX_SLUG,
} = require('./menu-effective');

// Base pública del menú (para los QR). Debe coincidir con la URL de los QR
// físicos en uso → por defecto el dominio de Railway. Sobreescribible por env.
// Los slugs cuelgan de la raíz: <base>/<slug> (sin /menu/ en el medio).
const PUBLIC_MENU_BASE_URL = (process.env.PUBLIC_MENU_BASE_URL
  || 'https://habit-tracker-production-b9ab.up.railway.app').replace(/\/+$/, '');

function publicMenuUrl(slug) {
  return `${PUBLIC_MENU_BASE_URL}/${slug}`;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// pdfkit solo se necesita para el formato PDF. Lazy-load para que PNG/SVG
// sigan funcionando aunque la dep falte (p.ej. deploy parcial).
let _PDFDocument = null;
function getPDFDocument() {
  if (_PDFDocument === null) {
    try { _PDFDocument = require('pdfkit'); }
    catch (_) { _PDFDocument = false; }
  }
  return _PDFDocument || null;
}

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ============ AUTH / ACCESS ============

// Resuelve el acceso del usuario al menú a partir de su id de auth.
// A diferencia del origen (que recibía el profile precargado), acá leemos
// user_profiles.role nosotros, porque requireAdmin del panel solo da el user.
async function getMenuAccess(userId) {
  if (!userId) return { isOwner: false, role: null, restaurantIds: [] };

  const { data: profile } = await supabaseAdmin.from('user_profiles')
    .select('role').eq('id', userId).maybeSingle();
  const role = profile ? profile.role : null;

  if (role === 'dueno') {
    const { data } = await supabaseAdmin.from('restaurants').select('id').eq('active', true);
    return { isOwner: true, role, restaurantIds: (data || []).map((r) => r.id) };
  }

  const { data: perms } = await supabaseAdmin.from('menu_user_restaurants')
    .select('restaurant_id, role').eq('user_id', userId);
  const rows = perms || [];
  if (rows.some((r) => r.role === 'menu_owner')) {
    const { data } = await supabaseAdmin.from('restaurants').select('id').eq('active', true);
    return { isOwner: true, role, restaurantIds: (data || []).map((r) => r.id) };
  }
  return { isOwner: false, role, restaurantIds: rows.map((r) => r.restaurant_id) };
}

function assertAllowed(ctx, restaurantId) {
  return !!(restaurantId && ctx.access.restaurantIds.includes(restaurantId));
}

function requireAllowed(ctx, restaurantId) {
  if (!assertAllowed(ctx, restaurantId)) throw httpError(403, 'Sin acceso');
}

// Estructura maestra (AJAX) → solo dueño / menu_owner.
function requireOwner(ctx) {
  if (!ctx.access || !ctx.access.isOwner) {
    throw httpError(403, 'Solo el dueño puede modificar la estructura del menú');
  }
}

// ============ RESTAURANTS ============

async function listRestaurants(ctx) {
  const ids = ctx.access.restaurantIds;
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from('restaurants')
    .select('id, name, slug, hero_image_url, hero_image_position, hero_image_zoom, wifi_ssid, wifi_password, whatsapp_phone')
    .in('id', ids).order('name');
  if (error) throw httpError(500, error.message);
  return (data || []).map((r) => ({
    ...r,
    is_ajax: r.id === ctx.ajaxId,
    public_url: r.slug ? publicMenuUrl(r.slug) : null,
  }));
}

// ============ QR GENERATION ============
// Devuelve { body, contentType, filename }. body: string (svg) | Buffer (png/pdf).
async function generateQr(ctx, restaurantId, query) {
  requireAllowed(ctx, restaurantId);
  if (restaurantId === ctx.ajaxId) {
    throw httpError(400, 'La plantilla AJAX no es un local público; no aplica QR.');
  }

  const size = Math.max(200, Math.min(4000, parseInt(query.size, 10) || 1000));
  const format = ['png', 'svg', 'pdf', 'pdf-grid'].includes(query.format) ? query.format : 'png';
  const style = ['classic', 'branded'].includes(query.style) ? query.style : 'classic';

  const { data: rest, error } = await supabaseAdmin.from('restaurants')
    .select('id, slug, name').eq('id', restaurantId).single();
  if (error || !rest || !rest.slug) {
    throw httpError(404, 'Local no encontrado o sin slug');
  }

  const targetUrl = publicMenuUrl(rest.slug);
  const colors = style === 'branded'
    ? { dark: '#d4a853', light: '#1a1a1a' }
    : { dark: '#000000', light: '#ffffff' };
  const qrOptions = { errorCorrectionLevel: 'H', margin: 2, color: colors, width: size };
  const safeSlug = String(rest.slug).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const filename = format === 'pdf-grid'
    ? `QR-pizzeria-popular-${safeSlug}-grid.pdf`
    : `QR-pizzeria-popular-${safeSlug}.${format}`;

  if (format === 'svg') {
    const svg = await QRCode.toString(targetUrl, { ...qrOptions, type: 'svg' });
    return { body: svg, contentType: 'image/svg+xml; charset=utf-8', filename };
  }

  if (format === 'png') {
    const buf = await QRCode.toBuffer(targetUrl, { ...qrOptions, type: 'png' });
    return { body: buf, contentType: 'image/png', filename };
  }

  // PDF formats — comparten pdfkit + un PNG de alta resolución del QR.
  const PDFDocument = getPDFDocument();
  if (!PDFDocument) {
    throw httpError(503, 'PDF no disponible (pdfkit no instalado)');
  }

  if (format === 'pdf-grid') {
    // A4 con 9 celdas (3×3). Cada celda: caption "MENÚ" arriba de un QR de 44mm.
    const pngBuf = await QRCode.toBuffer(targetUrl, { ...qrOptions, type: 'png', width: 1000 });
    const doc = new PDFDocument({ size: 'A4', margin: 0 });

    const MM = 2.83465; // 1mm en puntos PDF
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const cellSize = 60 * MM;
    const qrSize = 44 * MM;
    const titleTopOffset = 3 * MM;
    const titleAreaH = 6 * MM;
    const titleToQrGap = 3 * MM;
    const qrTopOffset = titleTopOffset + titleAreaH + titleToQrGap; // 12mm
    const qrLeftOffset = (cellSize - qrSize) / 2;                   // 8mm
    const titleFontSize = 16;
    const gap = 5 * MM;
    const cols = 3, rows = 3;
    const gridW = cols * cellSize + (cols - 1) * gap;
    const gridH = rows * cellSize + (rows - 1) * gap;
    const startX = (pageW - gridW) / 2;
    const startY = (pageH - gridH) / 2;

    if (style === 'branded') {
      doc.rect(0, 0, pageW, pageH).fill('#1a1a1a');
    }

    const frameColor = style === 'branded' ? '#d4a853' : '#888888';
    const frameOpacity = style === 'branded' ? 0.3 : 1;
    const titleColor = style === 'branded' ? '#d4a853' : '#1a1a1a';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (cellSize + gap);
        const y = startY + r * (cellSize + gap);
        doc.save();
        doc.lineWidth(0.3).strokeColor(frameColor).strokeOpacity(frameOpacity);
        doc.rect(x, y, cellSize, cellSize).stroke();
        doc.restore();
        doc.fillColor(titleColor)
          .font('Helvetica-Bold')
          .fontSize(titleFontSize)
          .text('MENÚ', x, y + titleTopOffset, { width: cellSize, align: 'center', lineBreak: false });
        doc.image(pngBuf, x + qrLeftOffset, y + qrTopOffset, { width: qrSize, height: qrSize });
      }
    }
    const buf = await pdfToBuffer(doc);
    return { body: buf, contentType: 'application/pdf', filename };
  }

  // Single large QR centrado en A4 con caption título/nombre/url.
  const pngBuf = await QRCode.toBuffer(targetUrl, { ...qrOptions, type: 'png' });
  const doc = new PDFDocument({ size: 'A4', margin: 0 });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const titleColor = style === 'branded' ? '#d4a853' : '#000000';
  const subtitleColor = style === 'branded' ? '#e8c87a' : '#444444';

  if (style === 'branded') {
    doc.rect(0, 0, pageW, pageH).fill('#1a1a1a');
  }

  const imgW = pageW * 0.65;
  const imgX = (pageW - imgW) / 2;
  const imgY = (pageH - imgW) / 2 + 10;
  doc.image(pngBuf, imgX, imgY, { width: imgW, height: imgW });

  doc.fillColor(titleColor).font('Helvetica-Bold').fontSize(28)
    .text('PIZZERIA POPULAR', 0, imgY - 80, { align: 'center', width: pageW });
  doc.fillColor(subtitleColor).font('Helvetica').fontSize(14)
    .text(rest.name || rest.slug, 0, imgY - 40, { align: 'center', width: pageW });
  doc.fillColor(subtitleColor).font('Helvetica').fontSize(10)
    .text(targetUrl, 0, imgY + imgW + 24, { align: 'center', width: pageW });

  const buf = await pdfToBuffer(doc);
  return { body: buf, contentType: 'application/pdf', filename };
}

// ============ HERO / CONTACT ============

async function updateHero(ctx, restaurantId, body) {
  requireAllowed(ctx, restaurantId);
  const { hero_image_url, hero_image_position, hero_image_zoom } = body || {};
  const update = {};
  if (typeof hero_image_url === 'string' && hero_image_url) update.hero_image_url = hero_image_url;
  if (typeof hero_image_position === 'string' && hero_image_position) update.hero_image_position = hero_image_position;
  if (hero_image_zoom !== undefined) {
    const z = Number(hero_image_zoom);
    if (Number.isFinite(z)) update.hero_image_zoom = Math.min(3, Math.max(1, z));
  }
  if (!Object.keys(update).length) throw httpError(400, 'hero_image_url, hero_image_position o hero_image_zoom requerido');
  const { data, error } = await supabaseAdmin.from('restaurants')
    .update(update).eq('id', restaurantId)
    .select('id, hero_image_url, hero_image_position, hero_image_zoom').single();
  if (error) throw httpError(500, error.message);
  return data;
}

async function deleteHero(ctx, restaurantId) {
  requireAllowed(ctx, restaurantId);
  const { error } = await supabaseAdmin.from('restaurants')
    .update({ hero_image_url: null, hero_image_position: 'center center', hero_image_zoom: 1.00 })
    .eq('id', restaurantId);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

async function updateContact(ctx, restaurantId, body) {
  requireAllowed(ctx, restaurantId);
  const { wifi_ssid, wifi_password, whatsapp_phone } = body || {};
  const norm = (v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };
  const update = {};
  const ssid = norm(wifi_ssid);
  const pwd = norm(wifi_password);
  const wa = norm(whatsapp_phone);
  if (ssid !== undefined) update.wifi_ssid = ssid;
  if (pwd !== undefined) update.wifi_password = pwd;
  if (wa !== undefined) update.whatsapp_phone = wa;
  if (!Object.keys(update).length) throw httpError(400, 'wifi_ssid, wifi_password o whatsapp_phone requerido');
  const { data, error } = await supabaseAdmin.from('restaurants')
    .update(update).eq('id', restaurantId)
    .select('id, wifi_ssid, wifi_password, whatsapp_phone').single();
  if (error) throw httpError(500, error.message);
  return data;
}

// ============ CATEGORIES ============
// Las categorías viven siempre en AJAX. Todos los locales ven las de AJAX.

async function listCategories(ctx, restaurantId) {
  requireAllowed(ctx, restaurantId);
  return getAdminCategories(restaurantId);
}

async function createCategory(ctx, body) {
  const { restaurant_id, name, slug, icon, is_active } = body;
  requireAllowed(ctx, restaurant_id);
  requireOwner(ctx);
  if (restaurant_id !== ctx.ajaxId) throw httpError(400, 'Solo se pueden crear categorías en AJAX');

  const { data: last } = await supabaseAdmin.from('menu_categories')
    .select('sort_order').eq('restaurant_id', ctx.ajaxId)
    .order('sort_order', { ascending: false }).limit(1);
  const sort_order = (last && last[0] ? last[0].sort_order : 0) + 1;

  const { data, error } = await supabaseAdmin.from('menu_categories')
    .insert({ restaurant_id: ctx.ajaxId, name, slug, icon, is_active: is_active !== false, sort_order })
    .select().single();
  if (error) throw httpError(500, error.message);
  return data;
}

async function updateCategory(ctx, id, body) {
  requireOwner(ctx);
  const { data: cat } = await supabaseAdmin.from('menu_categories').select('restaurant_id').eq('id', id).single();
  if (!cat || cat.restaurant_id !== ctx.ajaxId) throw httpError(400, 'Categoría no encontrada');
  const { name, slug, icon, is_active } = body;
  const { data, error } = await supabaseAdmin.from('menu_categories')
    .update({ name, slug, icon, is_active }).eq('id', id).select().single();
  if (error) throw httpError(500, error.message);
  return data;
}

async function deleteCategory(ctx, id) {
  requireOwner(ctx);
  const { data: cat } = await supabaseAdmin.from('menu_categories').select('restaurant_id').eq('id', id).single();
  if (!cat || cat.restaurant_id !== ctx.ajaxId) throw httpError(400, 'Categoría no encontrada');
  const { error } = await supabaseAdmin.from('menu_categories').delete().eq('id', id);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

async function reorderCategories(ctx, body) {
  requireOwner(ctx);
  const { order } = body;
  if (!Array.isArray(order)) throw httpError(400, 'order debe ser array');
  for (let i = 0; i < order.length; i++) {
    await supabaseAdmin.from('menu_categories')
      .update({ sort_order: i + 1 }).eq('id', order[i]).eq('restaurant_id', ctx.ajaxId);
  }
  return { ok: true };
}

// Toggle de categoría para un local concreto (override).
async function overrideCategory(ctx, id, body) {
  const { restaurant_id, is_active } = body;
  requireAllowed(ctx, restaurant_id);
  if (restaurant_id === ctx.ajaxId) throw httpError(400, 'AJAX no usa overrides');

  const { data: existing } = await supabaseAdmin.from('menu_category_overrides')
    .select('id').eq('category_id', id).eq('restaurant_id', restaurant_id).single();
  if (existing) {
    if (is_active === true || is_active === null) {
      await supabaseAdmin.from('menu_category_overrides').delete().eq('id', existing.id);
    } else {
      await supabaseAdmin.from('menu_category_overrides').update({ is_active }).eq('id', existing.id);
    }
  } else if (is_active === false) {
    await supabaseAdmin.from('menu_category_overrides')
      .insert({ category_id: id, restaurant_id, is_active });
  }
  return { ok: true };
}

// ============ SUBCATEGORIES ============
// Estructura maestra → create/update/delete/reorder exigen isOwner (origen no
// chequeaba acceso acá; este port cierra ese agujero). El toggle por local no.

async function listSubcategories(ctx, categoryId, restaurantId) {
  return getAdminSubcategories(categoryId, restaurantId || ctx.ajaxId);
}

async function createSubcategory(ctx, body) {
  requireOwner(ctx);
  const { category_id, name, slug, description, is_active } = body;
  const { data: last } = await supabaseAdmin.from('menu_subcategories')
    .select('sort_order').eq('category_id', category_id)
    .order('sort_order', { ascending: false }).limit(1);
  const sort_order = (last && last[0] ? last[0].sort_order : 0) + 1;
  const { data, error } = await supabaseAdmin.from('menu_subcategories')
    .insert({ category_id, name, slug, description, is_active: is_active !== false, sort_order })
    .select().single();
  if (error) throw httpError(500, error.message);
  return data;
}

async function updateSubcategory(ctx, id, body) {
  requireOwner(ctx);
  const { name, slug, description, is_active } = body;
  const { data, error } = await supabaseAdmin.from('menu_subcategories')
    .update({ name, slug, description, is_active }).eq('id', id).select().single();
  if (error) throw httpError(500, error.message);
  return data;
}

async function deleteSubcategory(ctx, id) {
  requireOwner(ctx);
  const { error } = await supabaseAdmin.from('menu_subcategories').delete().eq('id', id);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

async function reorderSubcategories(ctx, body) {
  requireOwner(ctx);
  const { category_id, order } = body;
  if (!category_id) throw httpError(400, 'category_id requerido');
  if (!Array.isArray(order)) throw httpError(400, 'order debe ser array');
  for (let i = 0; i < order.length; i++) {
    await supabaseAdmin.from('menu_subcategories')
      .update({ sort_order: i + 1 }).eq('id', order[i]).eq('category_id', category_id);
  }
  return { ok: true };
}

async function overrideSubcategory(ctx, id, body) {
  const { restaurant_id, is_active } = body;
  requireAllowed(ctx, restaurant_id);
  if (restaurant_id === ctx.ajaxId) throw httpError(400, 'AJAX no usa overrides');

  const { data: existing } = await supabaseAdmin.from('menu_subcategory_overrides')
    .select('id').eq('subcategory_id', id).eq('restaurant_id', restaurant_id).single();
  if (existing) {
    if (is_active === true || is_active === null) {
      await supabaseAdmin.from('menu_subcategory_overrides').delete().eq('id', existing.id);
    } else {
      await supabaseAdmin.from('menu_subcategory_overrides').update({ is_active }).eq('id', existing.id);
    }
  } else if (is_active === false) {
    await supabaseAdmin.from('menu_subcategory_overrides')
      .insert({ subcategory_id: id, restaurant_id, is_active });
  }
  return { ok: true };
}

// ============ ITEMS ============

async function listItems(ctx, subcategoryId, restaurantId) {
  requireAllowed(ctx, restaurantId);
  return getAdminItems(subcategoryId, restaurantId);
}

async function getItem(ctx, id, restaurantId) {
  requireAllowed(ctx, restaurantId);
  const isAjax = restaurantId === ctx.ajaxId;
  const { data: item, error } = await supabaseAdmin.from('menu_items')
    .select('*').eq('id', id).single();
  if (error || !item) throw httpError(404, 'Not found');

  const { data: masterPrices } = await supabaseAdmin.from('menu_item_prices')
    .select('*').eq('menu_item_id', item.id).eq('restaurant_id', ctx.ajaxId).order('sort_order');

  let localPrices = [];
  let override = null;
  if (!isAjax) {
    const { data: lp } = await supabaseAdmin.from('menu_item_prices')
      .select('*').eq('menu_item_id', item.id).eq('restaurant_id', restaurantId).order('sort_order');
    localPrices = lp || [];
    const { data: ov } = await supabaseAdmin.from('menu_item_overrides')
      .select('*').eq('menu_item_id', item.id).eq('restaurant_id', restaurantId).single();
    override = ov || null;
  }

  return {
    ...item,
    master_name: item.name,
    master_description: item.description,
    prices: isAjax ? (masterPrices || []) : (localPrices.length ? localPrices : masterPrices || []),
    master_prices: masterPrices || [],
    local_prices: localPrices,
    override,
    has_override: !!override,
    has_price_override: localPrices.length > 0,
    is_ajax: isAjax,
  };
}

async function createItem(ctx, body) {
  const { subcategory_id, restaurant_id, name, description, image_url, image_thumbnail_url, labels, allergens, is_featured, is_active, prices } = body;
  requireAllowed(ctx, restaurant_id);
  requireOwner(ctx);
  if (restaurant_id !== ctx.ajaxId) throw httpError(400, 'Solo se pueden crear platos desde AJAX');

  const { data: last } = await supabaseAdmin.from('menu_items')
    .select('sort_order').eq('subcategory_id', subcategory_id)
    .order('sort_order', { ascending: false }).limit(1);
  const sort_order = (last && last[0] ? last[0].sort_order : 0) + 1;

  const { data: item, error } = await supabaseAdmin.from('menu_items')
    .insert({
      subcategory_id, name, description, image_url, image_thumbnail_url,
      labels: labels || [], allergens: allergens || [],
      is_featured: !!is_featured, is_active: is_active !== false, sort_order,
    }).select().single();
  if (error) throw httpError(500, error.message);

  if (Array.isArray(prices) && prices.length) {
    const rows = prices.map((p, idx) => ({
      menu_item_id: item.id, restaurant_id: ctx.ajaxId,
      variant_name: p.variant_name || null, price: p.price,
      image_url: p.image_url || null, image_thumbnail_url: p.image_thumbnail_url || null,
      is_available: p.is_available !== false, sort_order: idx,
    }));
    const { error: pErr } = await supabaseAdmin.from('menu_item_prices').insert(rows);
    if (pErr) throw httpError(500, pErr.message);
  }
  return item;
}

async function updateItem(ctx, id, body) {
  const { restaurant_id, name, description, image_url, image_thumbnail_url, labels, allergens, is_featured, is_active, prices } = body;
  requireAllowed(ctx, restaurant_id);

  const isAjax = restaurant_id === ctx.ajaxId;

  if (isAjax) {
    // Edita el item maestro directamente.
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (image_url !== undefined) update.image_url = image_url;
    if (image_thumbnail_url !== undefined) update.image_thumbnail_url = image_thumbnail_url;
    if (labels !== undefined) update.labels = labels;
    if (allergens !== undefined) update.allergens = allergens;
    if (is_featured !== undefined) update.is_featured = is_featured;
    if (is_active !== undefined) update.is_active = is_active;

    if (Object.keys(update).length) {
      const { error } = await supabaseAdmin.from('menu_items').update(update).eq('id', id);
      if (error) throw httpError(500, error.message);
    }

    if (Array.isArray(prices)) {
      await supabaseAdmin.from('menu_item_prices')
        .delete().eq('menu_item_id', id).eq('restaurant_id', ctx.ajaxId);
      if (prices.length) {
        const rows = prices.map((p, idx) => ({
          menu_item_id: id, restaurant_id: ctx.ajaxId,
          variant_name: p.variant_name || null, price: p.price,
          image_url: p.image_url || null, image_thumbnail_url: p.image_thumbnail_url || null,
          is_available: p.is_available !== false, sort_order: idx,
        }));
        const { error: pErr } = await supabaseAdmin.from('menu_item_prices').insert(rows);
        if (pErr) throw httpError(500, pErr.message);
      }
    }
  } else {
    // Override local: upsert en menu_item_overrides.
    const overrideData = {};
    if (name !== undefined) overrideData.custom_name = name;
    if (description !== undefined) overrideData.custom_description = description;
    if (is_active !== undefined) overrideData.is_active = is_active;

    if (Object.keys(overrideData).length) {
      overrideData.updated_at = new Date().toISOString();
      const { data: existing } = await supabaseAdmin.from('menu_item_overrides')
        .select('id').eq('menu_item_id', id).eq('restaurant_id', restaurant_id).single();
      if (existing) {
        await supabaseAdmin.from('menu_item_overrides').update(overrideData).eq('id', existing.id);
      } else {
        await supabaseAdmin.from('menu_item_overrides')
          .insert({ menu_item_id: id, restaurant_id, ...overrideData });
      }
    }

    if (Array.isArray(prices)) {
      await supabaseAdmin.from('menu_item_prices')
        .delete().eq('menu_item_id', id).eq('restaurant_id', restaurant_id);
      if (prices.length) {
        const rows = prices.map((p, idx) => ({
          menu_item_id: id, restaurant_id,
          variant_name: p.variant_name || null, price: p.price,
          image_url: p.image_url || null, image_thumbnail_url: p.image_thumbnail_url || null,
          is_available: p.is_available !== false, sort_order: idx,
        }));
        const { error: pErr } = await supabaseAdmin.from('menu_item_prices').insert(rows);
        if (pErr) throw httpError(500, pErr.message);
      }
    }
  }

  const { data: updated } = await supabaseAdmin.from('menu_items').select('*').eq('id', id).single();
  return updated;
}

async function deleteItem(ctx, id, restaurantId) {
  requireAllowed(ctx, restaurantId);

  if (restaurantId === ctx.ajaxId) {
    const { error } = await supabaseAdmin.from('menu_items').delete().eq('id', id);
    if (error) throw httpError(500, error.message);
    return { ok: true, mode: 'full' };
  }

  await supabaseAdmin.from('menu_item_overrides')
    .delete().eq('menu_item_id', id).eq('restaurant_id', restaurantId);
  await supabaseAdmin.from('menu_item_prices')
    .delete().eq('menu_item_id', id).eq('restaurant_id', restaurantId);
  return { ok: true, mode: 'override_removed' };
}

async function reorderItems(ctx, body) {
  requireOwner(ctx);
  const { subcategory_id, order } = body;
  if (!Array.isArray(order)) throw httpError(400, 'order debe ser array');
  for (let i = 0; i < order.length; i++) {
    await supabaseAdmin.from('menu_items')
      .update({ sort_order: i + 1 }).eq('id', order[i]).eq('subcategory_id', subcategory_id);
  }
  return { ok: true };
}

// Quita el override de un local, restaurando los valores maestros.
async function restoreItem(ctx, id, body) {
  const { restaurant_id } = body;
  requireAllowed(ctx, restaurant_id);
  if (restaurant_id === ctx.ajaxId) throw httpError(400, 'AJAX no tiene overrides');

  await supabaseAdmin.from('menu_item_overrides')
    .delete().eq('menu_item_id', id).eq('restaurant_id', restaurant_id);
  await supabaseAdmin.from('menu_item_prices')
    .delete().eq('menu_item_id', id).eq('restaurant_id', restaurant_id);
  return { ok: true };
}

// ============ IMAGE UPLOAD ============

async function uploadImage(ctx, body) {
  const { filename, content_type, data_base64 } = body || {};
  if (!data_base64) throw httpError(400, 'data_base64 requerido');
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (content_type && !allowed.includes(content_type)) throw httpError(400, 'Tipo no permitido');
  const buf = Buffer.from(data_base64, 'base64');
  if (buf.length > 8 * 1024 * 1024) throw httpError(400, 'Archivo supera el límite permitido');
  const safeName = (filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
  const { error } = await supabaseAdmin.storage.from('menu-images')
    .upload(key, buf, { contentType: content_type || 'image/jpeg', upsert: false });
  if (error) throw httpError(500, error.message);
  const { data: pub } = supabaseAdmin.storage.from('menu-images').getPublicUrl(key);
  return { url: pub.publicUrl, key };
}

// ============ GOOGLE REVIEWS (no portado) ============
// El refresh manual de reseñas acopla scripts/cron de habit-tracker. No se
// porta al panel; el cron diario de Railway lo sigue ejecutando allá.
async function refreshGoogleReviews() {
  throw httpError(503, 'No disponible en este panel (lo ejecuta el cron de Railway)');
}

module.exports = {
  PUBLIC_MENU_BASE_URL,
  publicMenuUrl,
  getAjaxRestaurantId,
  getMenuAccess,
  assertAllowed,
  // restaurants
  listRestaurants,
  generateQr,
  updateHero,
  deleteHero,
  updateContact,
  // categories
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  overrideCategory,
  // subcategories
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  reorderSubcategories,
  overrideSubcategory,
  // items
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
  restoreItem,
  // misc
  uploadImage,
  refreshGoogleReviews,
};
