// ============================================================
// lib/menu-effective.js — herencia maestro (AJAX) → locales.
// Portado 1:1 desde habit-tracker/src/helpers/menu-effective.js.
// Único cambio vs. origen: el import del cliente Supabase (./supabase).
// Resuelve el menú efectivo de un local aplicando overrides de
// categorías/subcategorías/items y precios por local sobre el maestro AJAX.
// ============================================================
const { supabaseAdmin } = require('./supabase');

const AJAX_SLUG = 'ajax';

async function getAjaxRestaurantId() {
  const { data } = await supabaseAdmin.from('restaurants')
    .select('id').eq('slug', AJAX_SLUG).single();
  return data ? data.id : null;
}

async function getEffectiveMenu(restaurantId) {
  const ajaxId = await getAjaxRestaurantId();
  if (!ajaxId) return { categories: [] };

  const isAjax = restaurantId === ajaxId;

  const { data: categories } = await supabaseAdmin.from('menu_categories')
    .select('*').eq('restaurant_id', ajaxId).eq('is_active', true).order('sort_order');
  if (!categories || !categories.length) return { categories: [] };

  let catIds = categories.map(c => c.id);

  // Apply category overrides for non-AJAX
  let activeCatIds = catIds;
  if (!isAjax) {
    const { data: catOv } = await supabaseAdmin.from('menu_category_overrides')
      .select('category_id, is_active').in('category_id', catIds).eq('restaurant_id', restaurantId);
    const catOvMap = {};
    (catOv || []).forEach(o => { catOvMap[o.category_id] = o.is_active; });
    activeCatIds = catIds.filter(id => catOvMap[id] !== false);
  }

  const activeCats = categories.filter(c => activeCatIds.includes(c.id));
  if (!activeCats.length) return { categories: [] };

  const { data: subcategories } = await supabaseAdmin.from('menu_subcategories')
    .select('*').in('category_id', activeCatIds).eq('is_active', true).order('sort_order');

  let subIds = (subcategories || []).map(s => s.id);

  // Apply subcategory overrides for non-AJAX
  let activeSubIds = subIds;
  if (!isAjax && subIds.length) {
    const { data: subOv } = await supabaseAdmin.from('menu_subcategory_overrides')
      .select('subcategory_id, is_active').in('subcategory_id', subIds).eq('restaurant_id', restaurantId);
    const subOvMap = {};
    (subOv || []).forEach(o => { subOvMap[o.subcategory_id] = o.is_active; });
    activeSubIds = subIds.filter(id => subOvMap[id] !== false);
  }

  const activeSubs = (subcategories || []).filter(s => activeSubIds.includes(s.id));
  if (!activeSubs.length) return { categories: activeCats.map(c => ({ ...c, subcategories: [] })) };

  const { data: items } = await supabaseAdmin.from('menu_items')
    .select('*').in('subcategory_id', activeSubIds).eq('is_active', true).order('sort_order');
  const itemIds = (items || []).map(i => i.id);

  let ajaxPrices = [];
  let localPrices = [];
  if (itemIds.length) {
    const { data: ap } = await supabaseAdmin.from('menu_item_prices')
      .select('*').in('menu_item_id', itemIds).eq('restaurant_id', ajaxId).order('sort_order');
    ajaxPrices = ap || [];
    if (!isAjax) {
      const { data: lp } = await supabaseAdmin.from('menu_item_prices')
        .select('*').in('menu_item_id', itemIds).eq('restaurant_id', restaurantId).order('sort_order');
      localPrices = lp || [];
    }
  }

  const ajaxPricesByItem = groupBy(ajaxPrices, 'menu_item_id');
  const localPricesByItem = groupBy(localPrices, 'menu_item_id');

  let overrides = [];
  if (!isAjax && itemIds.length) {
    const { data: ov } = await supabaseAdmin.from('menu_item_overrides')
      .select('*').in('menu_item_id', itemIds).eq('restaurant_id', restaurantId);
    overrides = ov || [];
  }
  const overridesByItem = {};
  overrides.forEach(o => { overridesByItem[o.menu_item_id] = o; });

  const effectiveItems = (items || []).map(item => {
    const ov = overridesByItem[item.id];
    const effectiveActive = ov && ov.is_active !== null ? ov.is_active : item.is_active;
    if (!effectiveActive) return null;

    const effectiveName = (ov && ov.custom_name) ? { ...item.name, ...ov.custom_name } : item.name;
    const effectiveDesc = (ov && ov.custom_description) ? { ...item.description, ...ov.custom_description } : item.description;

    const localItemPrices = localPricesByItem[item.id] || [];
    const ajaxItemPrices = ajaxPricesByItem[item.id] || [];
    let prices;
    if (localItemPrices.length) {
      // Local price overrides win, but inherit per-variant photos from the AJAX
      // master when the local row doesn't have its own. Match by variant_name,
      // fall back to index position.
      const variantKey = (p) => JSON.stringify(p.variant_name ?? null);
      const ajaxByVariant = {};
      ajaxItemPrices.forEach(ap => {
        const k = variantKey(ap);
        if (!(k in ajaxByVariant)) ajaxByVariant[k] = ap;
      });
      prices = localItemPrices.map((lp, idx) => {
        if (lp.image_url || lp.image_thumbnail_url) return lp;
        const master = ajaxByVariant[variantKey(lp)] || ajaxItemPrices[idx];
        if (!master || (!master.image_url && !master.image_thumbnail_url)) return lp;
        return {
          ...lp,
          image_url: lp.image_url || master.image_url || null,
          image_thumbnail_url: lp.image_thumbnail_url || master.image_thumbnail_url || null,
        };
      });
    } else {
      prices = ajaxItemPrices;
    }

    return { ...item, name: effectiveName, description: effectiveDesc, is_active: effectiveActive, prices };
  }).filter(Boolean);

  const itemsBySub = groupBy(effectiveItems, 'subcategory_id');
  const subsByCat = {};
  for (const sub of activeSubs) {
    if (!subsByCat[sub.category_id]) subsByCat[sub.category_id] = [];
    subsByCat[sub.category_id].push({ ...sub, items: itemsBySub[sub.id] || [] });
  }

  return {
    categories: activeCats.map(cat => ({ ...cat, subcategories: subsByCat[cat.id] || [] }))
  };
}

// For admin: categories with local_active info
async function getAdminCategories(restaurantId) {
  const ajaxId = await getAjaxRestaurantId();
  const isAjax = restaurantId === ajaxId;

  const { data: cats } = await supabaseAdmin.from('menu_categories')
    .select('*').eq('restaurant_id', ajaxId).order('sort_order');

  const catIds = (cats || []).map(c => c.id);
  let countsByCat = {};
  if (catIds.length) {
    const { data: subs } = await supabaseAdmin.from('menu_subcategories')
      .select('id, category_id').in('category_id', catIds);
    const subToCat = {};
    for (const s of (subs || [])) subToCat[s.id] = s.category_id;
    const subIds = (subs || []).map(s => s.id);
    if (subIds.length) {
      const { data: items } = await supabaseAdmin.from('menu_items')
        .select('id, subcategory_id').in('subcategory_id', subIds);
      for (const it of (items || [])) {
        const catId = subToCat[it.subcategory_id];
        if (catId) countsByCat[catId] = (countsByCat[catId] || 0) + 1;
      }
    }
  }

  let catOvMap = {};
  if (!isAjax && catIds.length) {
    const { data: catOv } = await supabaseAdmin.from('menu_category_overrides')
      .select('category_id, is_active').in('category_id', catIds).eq('restaurant_id', restaurantId);
    (catOv || []).forEach(o => { catOvMap[o.category_id] = o.is_active; });
  }

  return (cats || []).map(c => ({
    ...c,
    items_count: countsByCat[c.id] || 0,
    local_active: catOvMap[c.id] !== undefined ? catOvMap[c.id] : null
  }));
}

// For admin: subcategories with local_active info
async function getAdminSubcategories(categoryId, restaurantId) {
  const ajaxId = await getAjaxRestaurantId();
  const isAjax = restaurantId === ajaxId;

  const { data } = await supabaseAdmin.from('menu_subcategories')
    .select('*').eq('category_id', categoryId).order('sort_order');

  let subOvMap = {};
  const subIds = (data || []).map(s => s.id);
  if (!isAjax && subIds.length) {
    const { data: subOv } = await supabaseAdmin.from('menu_subcategory_overrides')
      .select('subcategory_id, is_active').in('subcategory_id', subIds).eq('restaurant_id', restaurantId);
    (subOv || []).forEach(o => { subOvMap[o.subcategory_id] = o.is_active; });
  }

  return (data || []).map(s => ({
    ...s,
    local_active: subOvMap[s.id] !== undefined ? subOvMap[s.id] : null
  }));
}

async function getAdminItems(subcategoryId, restaurantId) {
  const ajaxId = await getAjaxRestaurantId();
  const isAjax = restaurantId === ajaxId;

  const { data: items } = await supabaseAdmin.from('menu_items')
    .select('*').eq('subcategory_id', subcategoryId).order('sort_order');
  if (!items || !items.length) return [];

  const itemIds = items.map(i => i.id);

  const { data: ajaxPrices } = await supabaseAdmin.from('menu_item_prices')
    .select('*').in('menu_item_id', itemIds).eq('restaurant_id', ajaxId).order('sort_order');
  const ajaxPricesByItem = groupBy(ajaxPrices || [], 'menu_item_id');

  let localPricesByItem = {};
  let overridesByItem = {};

  if (!isAjax) {
    const { data: lp } = await supabaseAdmin.from('menu_item_prices')
      .select('*').in('menu_item_id', itemIds).eq('restaurant_id', restaurantId).order('sort_order');
    localPricesByItem = groupBy(lp || [], 'menu_item_id');
    const { data: ov } = await supabaseAdmin.from('menu_item_overrides')
      .select('*').in('menu_item_id', itemIds).eq('restaurant_id', restaurantId);
    (ov || []).forEach(o => { overridesByItem[o.menu_item_id] = o; });
  }

  return items.map(item => {
    const override = overridesByItem[item.id] || null;
    const localPrices = localPricesByItem[item.id] || [];
    const masterPrices = ajaxPricesByItem[item.id] || [];
    const effectiveActive = override && override.is_active !== null ? override.is_active : item.is_active;
    const effectiveName = override && override.custom_name ? { ...item.name, ...override.custom_name } : item.name;
    const effectiveDesc = override && override.custom_description ? { ...item.description, ...override.custom_description } : item.description;

    return {
      ...item,
      master_name: item.name,
      master_description: item.description,
      effective_name: effectiveName,
      effective_description: effectiveDesc,
      effective_active: effectiveActive,
      prices: isAjax ? masterPrices : (localPrices.length ? localPrices : masterPrices),
      master_prices: masterPrices,
      local_prices: localPrices,
      override,
      has_override: !!override,
      has_price_override: localPrices.length > 0,
      is_ajax: isAjax
    };
  });
}

function groupBy(arr, key) {
  const m = {};
  for (const item of arr) {
    const k = item[key];
    if (!m[k]) m[k] = [];
    m[k].push(item);
  }
  return m;
}

module.exports = { getAjaxRestaurantId, getEffectiveMenu, getAdminCategories, getAdminSubcategories, getAdminItems, groupBy, AJAX_SLUG };
