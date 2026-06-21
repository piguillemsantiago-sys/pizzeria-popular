// ============================================
// MENU-ADMIN.JS - Panel admin del menú digital
// Sistema maestro AJAX + overrides locales
// ============================================

const MenuAdminModule = {
  LANGS: ['es', 'en', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh'],
  LANG_LABELS: { es: 'ES', en: 'EN', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT', nl: 'NL', ru: 'RU', zh: 'ZH' },
  LABELS: ['vegano', 'picante', 'sin_gluten', 'sin_lacteos', 'vegetariano', 'contiene_cerdo', 'nuevo', 'bestseller', 'congelado', 'sin_lactosa'],
  ALLERGENS: ['gluten', 'crustaceos', 'huevos', 'pescado', 'cacahuetes', 'soja', 'lacteos', 'frutos_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'moluscos', 'altramuces'],

  state: {
    restaurants: [],
    currentRestaurantId: null,
    isAjax: false,
    ajaxId: null,
    categories: [],
    currentCategory: null,
    subcategories: [],
    itemsBySub: {},
    cropperLib: false,
  },

  async load() {
    const root = document.getElementById('menu-admin-root');
    root.innerHTML = '<div class="ma-loading">Cargando…</div>';

    const list = await API.get('/api/admin/menu/restaurants');
    if (!list || !list.length) { root.innerHTML = '<div class="ma-empty">Sin acceso al menú digital.</div>'; return; }
    this.state.restaurants = list;
    this.state.ajaxId = (list.find(r => r.is_ajax) || {}).id || null;

    const saved = localStorage.getItem('ma_restaurant');
    const validSaved = saved && list.find(r => r.id === saved);
    // Default to AJAX if available
    this.state.currentRestaurantId = validSaved ? saved : (this.state.ajaxId || list[0].id);
    this.state.isAjax = this.state.currentRestaurantId === this.state.ajaxId;
    this.render();
    this.loadCategories();
  },

  render() {
    const { restaurants, currentRestaurantId, isAjax } = this.state;
    const currentName = (restaurants.find(r => r.id === currentRestaurantId) || {}).name || '';
    const root = document.getElementById('menu-admin-root');
    root.innerHTML = `
      <div class="ma-header">
        <h2 class="ma-title">📖 Menú Digital</h2>
        <div class="ma-rest-selector">
          <label>Local:</label>
          <select id="ma-restaurant" onchange="MenuAdminModule.changeRestaurant()">
            ${restaurants.map(r => `<option value="${r.id}" ${r.id === currentRestaurantId ? 'selected' : ''}>${r.name}${r.is_ajax ? ' (Plantilla)' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="ma-banner ${isAjax ? 'ma-banner-ajax' : 'ma-banner-local'}">
        <span class="ma-banner-text">${isAjax
          ? '🌐 Editando <b>plantilla maestra</b>. Los cambios se aplicarán a todos los locales que no tengan override.'
          : `📍 Editando <b>${_esc(currentName)}</b>. Los cambios solo afectan a este local.`}</span>
        <span class="ma-banner-actions">
          <button class="btn btn-secondary btn-sm ma-banner-action" onclick="MenuAdminModule.openAnalytics()">📊 Analytics</button>
          ${isAjax
            ? ''
            : '<button class="btn btn-secondary btn-sm ma-banner-action" onclick="MenuAdminModule.openQrModal()">📱 Descargar QR</button>'}
        </span>
      </div>
      <div id="ma-body"></div>
    `;
  },

  changeRestaurant() {
    const id = document.getElementById('ma-restaurant').value;
    this.state.currentRestaurantId = id;
    this.state.isAjax = id === this.state.ajaxId;
    this.state.currentCategory = null;
    localStorage.setItem('ma_restaurant', id);
    this.render();
    this.loadCategories();
  },

  // ============ CATEGORIES VIEW ============

  async loadCategories() {
    const body = document.getElementById('ma-body');
    body.innerHTML = '<div class="ma-loading">Cargando categorías…</div>';
    const cats = await API.get('/api/admin/menu/categories?restaurant_id=' + this.state.currentRestaurantId);
    this.state.categories = cats || [];
    this.renderCategoriesView();
  },

  renderCategoriesView() {
    const body = document.getElementById('ma-body');
    const cats = this.state.categories;
    const isAjax = this.state.isAjax;
    body.innerHTML = `
      ${this._renderHeroConfig()}
      ${this._renderContactConfig()}
      <div class="ma-toolbar">
        <h3>Categorías del menú</h3>
        <div class="ma-toolbar-actions">
          ${isAjax ? '<button class="btn btn-primary btn-sm" onclick="MenuAdminModule.openCategoryModal()">+ Nueva categoría</button>' : '<span class="ma-hint">Las categorías se gestionan desde AJAX</span>'}
        </div>
      </div>
      <div class="ma-cat-list" id="ma-cat-list">
        ${cats.length === 0 ? '<div class="ma-empty">No hay categorías.</div>' : cats.map(c => this.renderCategoryRow(c)).join('')}
      </div>
    `;
    if (cats.length && isAjax) {
      Sortable.create(document.getElementById('ma-cat-list'), {
        handle: '.ma-drag', animation: 150,
        onEnd: () => {
          const order = Array.from(document.getElementById('ma-cat-list').querySelectorAll('[data-cat-id]')).map(el => el.dataset.catId);
          API.post('/api/admin/menu/categories/reorder', { order });
        }
      });
    }
  },

  _currentRestaurant() {
    return this.state.restaurants.find(r => r.id === this.state.currentRestaurantId) || null;
  },

  _renderMockContent() {
    const rest = this._currentRestaurant();
    const restName = (rest && this._t(rest.name)) || 'Pizzería Popular';
    const defaultCats = [
      { icon: '🍕', name: { es: 'Pizzas' } },
      { icon: '🍝', name: { es: 'Pastas' } },
      { icon: '🥗', name: { es: 'Ensaladas' } },
      { icon: '🥩', name: { es: 'Carnes' } },
      { icon: '🍰', name: { es: 'Postres' } },
      { icon: '🥤', name: { es: 'Bebidas' } },
    ];
    const sourceCats = (this.state.categories && this.state.categories.length)
      ? this.state.categories
      : defaultCats;
    const catsHtml = sourceCats.slice(0, 6).map(c => `
      <div class="ma-mock-cat">
        <div class="ma-mock-cat-icon">${_esc(c.icon || '🍽️')}</div>
        <div class="ma-mock-cat-name">${_esc(this._t(c.name) || '')}</div>
      </div>
    `).join('');
    return `
      <div class="ma-phone-content">
        <div class="ma-mock-hero">
          <div class="ma-mock-logo">
            <span class="ma-mock-logo-top">PIZZERÍA</span>
            <span class="ma-mock-logo-bottom">POPULAR</span>
          </div>
          <div class="ma-mock-tagline">RINCÓN NUESTRO</div>
          <div class="ma-mock-rest">${_esc(restName)}</div>
          <div class="ma-mock-rating">
            <span class="ma-mock-stars">★★★★★</span>
            <strong>4.6</strong>
            <span class="ma-mock-rating-label">Excelente</span>
          </div>
          <div class="ma-mock-info">ℹ️ Información ▾</div>
        </div>
        <div class="ma-mock-cats">${catsHtml}</div>
      </div>
    `;
  },

  _renderHeroConfig() {
    const rest = this._currentRestaurant();
    const heroUrl = rest && rest.hero_image_url;
    const pos = this._parseHeroPos(rest && rest.hero_image_position);
    const zoom = this._clampZoom(rest && rest.hero_image_zoom);

    const previewHtml = heroUrl
      ? `<div class="ma-phone-wrap">
           <div class="ma-phone">
             <div class="ma-phone-notch"></div>
             <div class="ma-phone-screen" style="--bg-x:${pos.x}%; --bg-y:${pos.y}%; --bg-zoom:${zoom};">
               <img class="ma-phone-screen-img" src="${_esc(heroUrl)}" alt="">
               <div class="ma-phone-overlay"></div>
               ${this._renderMockContent()}
             </div>
           </div>
         </div>`
      : '<div class="ma-hero-empty">Sin imagen de portada — se usa el fondo oscuro por defecto</div>';

    return `
      <div class="ma-hero-config">
        <div class="ma-hero-head">
          <h3>Portada del menú</h3>
          <div class="ma-hero-actions">
            <button class="btn btn-primary btn-sm" onclick="MenuAdminModule.pickHeroImage()">${heroUrl ? 'Cambiar imagen' : 'Subir imagen de portada'}</button>
            ${heroUrl ? '<button class="btn btn-secondary btn-sm" onclick="MenuAdminModule.editHeroPosition()">Ajustar posición</button>' : ''}
            ${heroUrl ? '<button class="btn btn-secondary btn-sm" onclick="MenuAdminModule.removeHero()">Quitar imagen</button>' : ''}
          </div>
        </div>
        <div class="ma-hero-hint">Vista previa en celular de cómo se verá el menú público. Ajustá la posición para elegir qué parte de la imagen se muestra.</div>
        ${previewHtml}
      </div>
    `;
  },

  pickHeroImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      input.remove();
      if (file) await this._openHeroEditor({ file });
    };
    input.click();
  },

  async editHeroPosition() {
    const rest = this._currentRestaurant();
    if (!rest || !rest.hero_image_url) return;
    await this._openHeroEditor({ existingUrl: rest.hero_image_url });
  },

  async _openHeroEditor({ file, existingUrl }) {
    let blob = null;
    let sourceUrl = null;
    let fileName = null;

    if (file) {
      const overlay = this._createLoadingOverlay('Procesando imagen…');
      try {
        blob = await this._resizeToMaxWidth(file, 1920, 0.85);
      } finally {
        overlay.remove();
      }
      if (!blob) { showToast('No se pudo procesar la imagen'); return; }
      sourceUrl = URL.createObjectURL(blob);
      fileName = file.name || 'hero.jpg';
    } else if (existingUrl) {
      sourceUrl = existingUrl;
    } else {
      return;
    }

    const rest = this._currentRestaurant();
    const startPos = this._parseHeroPos(rest && rest.hero_image_position);
    const startZoom = this._clampZoom(rest && rest.hero_image_zoom);
    this._heroEdit = {
      blob, sourceUrl, fileName,
      isNewUpload: !!file,
      x: startPos.x, y: startPos.y, zoom: startZoom,
    };
    this._renderHeroEditor();
  },

  _renderHeroEditor() {
    const { sourceUrl, x, y, zoom, isNewUpload } = this._heroEdit;
    const wrap = document.createElement('div');
    wrap.id = 'ma-hero-editor-wrap';
    wrap.innerHTML = `
      <div class="ma-hero-editor-backdrop" onclick="if(event.target===this)MenuAdminModule._closeHeroEditor()">
        <div class="ma-hero-editor">
          <div class="ma-hero-editor-title">${isNewUpload ? 'Revisar y ajustar portada' : 'Ajustar posición'}</div>
          <div class="ma-hero-editor-hint">Arrastrá la imagen en cualquier dirección y usá el zoom para encuadrar. Así se verá en el celular del cliente.</div>
          <div class="ma-hero-editor-phone-wrap">
            <div class="ma-phone ma-phone--editor">
              <div class="ma-phone-notch"></div>
              <div class="ma-phone-screen ma-phone-screen--drag" id="ma-hero-editor-preview"
                   style="--bg-x:${x}%; --bg-y:${y}%; --bg-zoom:${zoom};">
                <img class="ma-phone-screen-img" id="ma-hero-editor-img" src="${_esc(sourceUrl)}" alt="" draggable="false">
                <div class="ma-phone-overlay"></div>
                ${this._renderMockContent()}
              </div>
            </div>
          </div>
          <div class="ma-hero-editor-zoom">
            <label for="ma-hero-editor-zoom-slider">Zoom</label>
            <input type="range" id="ma-hero-editor-zoom-slider" min="1" max="3" step="0.05" value="${zoom}">
            <span id="ma-hero-editor-zoom-val">${zoom.toFixed(2)}×</span>
          </div>
          <div class="ma-hero-editor-pos">
            Posición: <span id="ma-hero-editor-pos-val">X ${Math.round(x)}% · Y ${Math.round(y)}%</span>
          </div>
          <div class="ma-hero-editor-actions">
            <button class="btn btn-secondary btn-sm" onclick="MenuAdminModule._closeHeroEditor()">Cancelar</button>
            <button class="btn btn-primary btn-sm" onclick="MenuAdminModule._applyHero()">Aplicar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    this._bindHeroEditor();
  },

  _bindHeroEditor() {
    const preview = document.getElementById('ma-hero-editor-preview');
    const posVal = document.getElementById('ma-hero-editor-pos-val');
    const zoomSlider = document.getElementById('ma-hero-editor-zoom-slider');
    const zoomVal = document.getElementById('ma-hero-editor-zoom-val');
    if (!preview) return;

    const applyVars = () => {
      preview.style.setProperty('--bg-x', this._heroEdit.x + '%');
      preview.style.setProperty('--bg-y', this._heroEdit.y + '%');
      preview.style.setProperty('--bg-zoom', String(this._heroEdit.zoom));
      if (posVal) posVal.textContent = `X ${Math.round(this._heroEdit.x)}% · Y ${Math.round(this._heroEdit.y)}%`;
      if (zoomVal) zoomVal.textContent = this._heroEdit.zoom.toFixed(2) + '×';
    };

    // Drag in 2 axes; sensitivity scaled by zoom for 1:1 visual feel
    let dragging = false;
    let startClientX = 0, startClientY = 0;
    let startX = 0, startY = 0;

    const onDown = (e) => {
      dragging = true;
      startClientX = e.clientX;
      startClientY = e.clientY;
      startX = this._heroEdit.x;
      startY = this._heroEdit.y;
      try { preview.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = preview.getBoundingClientRect();
      const z = this._heroEdit.zoom || 1;
      const dxPct = ((e.clientX - startClientX) / rect.width) * 100 / z;
      const dyPct = ((e.clientY - startClientY) / rect.height) * 100 / z;
      let nx = startX - dxPct;
      let ny = startY - dyPct;
      nx = Math.max(0, Math.min(100, nx));
      ny = Math.max(0, Math.min(100, ny));
      this._heroEdit.x = nx;
      this._heroEdit.y = ny;
      applyVars();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      try { preview.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    preview.addEventListener('pointerdown', onDown);
    preview.addEventListener('pointermove', onMove);
    preview.addEventListener('pointerup', onUp);
    preview.addEventListener('pointercancel', onUp);

    if (zoomSlider) {
      zoomSlider.addEventListener('input', (e) => {
        this._heroEdit.zoom = this._clampZoom(parseFloat(e.target.value));
        applyVars();
      });
    }
  },

  _closeHeroEditor() {
    const wrap = document.getElementById('ma-hero-editor-wrap');
    if (wrap) wrap.remove();
    if (this._heroEdit && this._heroEdit.isNewUpload && this._heroEdit.sourceUrl) {
      try { URL.revokeObjectURL(this._heroEdit.sourceUrl); } catch (_) {}
    }
    this._heroEdit = null;
  },

  async _applyHero() {
    const edit = this._heroEdit;
    if (!edit) return;
    const rx = Math.round(edit.x * 10) / 10;
    const ry = Math.round(edit.y * 10) / 10;
    const posStr = `${rx}% ${ry}%`;
    const zoom = Math.round(this._clampZoom(edit.zoom) * 100) / 100;
    const overlay = this._createLoadingOverlay(edit.isNewUpload ? 'Subiendo imagen…' : 'Guardando…');
    try {
      let uploadedUrl = null;
      if (edit.isNewUpload && edit.blob) {
        const base64 = await this._blobToBase64(edit.blob);
        const safe = (edit.fileName || 'hero.jpg').replace(/\.[^.]+$/, '');
        const up = await API.post('/api/admin/menu/upload-image', {
          filename: 'hero_' + safe + '.jpg',
          content_type: 'image/jpeg',
          data_base64: base64,
        });
        if (!up || !up.url) { showToast('Error al subir'); return; }
        uploadedUrl = up.url;
      }

      const body = { hero_image_position: posStr, hero_image_zoom: zoom };
      if (uploadedUrl) body.hero_image_url = uploadedUrl;
      const save = await API.put('/api/admin/menu/restaurants/' + this.state.currentRestaurantId + '/hero', body);
      if (!save) { showToast('Error al guardar'); return; }

      const rest = this._currentRestaurant();
      if (rest) {
        if (save.hero_image_url) rest.hero_image_url = save.hero_image_url;
        if (save.hero_image_position) rest.hero_image_position = save.hero_image_position;
        if (save.hero_image_zoom !== undefined && save.hero_image_zoom !== null) rest.hero_image_zoom = save.hero_image_zoom;
      }
      showToast('Portada actualizada');
      this._closeHeroEditor();
      this.renderCategoriesView();
    } catch (err) {
      console.error('[hero-apply]', err);
      showToast('Error al guardar');
    } finally {
      overlay.remove();
    }
  },

  async removeHero() {
    if (!confirm('¿Quitar la imagen de portada? Volverá al fondo oscuro por defecto.')) return;
    const r = await API.del('/api/admin/menu/restaurants/' + this.state.currentRestaurantId + '/hero');
    if (!r) { showToast('Error al quitar'); return; }
    const rest = this._currentRestaurant();
    if (rest) {
      rest.hero_image_url = null;
      rest.hero_image_position = 'center center';
      rest.hero_image_zoom = 1.00;
    }
    showToast('Portada eliminada');
    this.renderCategoriesView();
  },

  _renderContactConfig() {
    const rest = this._currentRestaurant();
    const isAjax = this.state.isAjax;
    const ssid = (rest && rest.wifi_ssid) || '';
    const pwd = (rest && rest.wifi_password) || '';
    const wa = (rest && rest.whatsapp_phone) || '';
    const hint = isAjax
      ? 'Estos valores son los <b>defaults</b> que se usan en cualquier local que no tenga su propio dato cargado.'
      : 'Si dejás un campo vacío, el menú usará el valor de la plantilla AJAX.';
    return `
      <div class="ma-hero-config">
        <div class="ma-hero-head">
          <h3>Wi-Fi y WhatsApp</h3>
          <div class="ma-hero-actions">
            <button class="btn btn-primary btn-sm" onclick="MenuAdminModule.saveContactConfig()">Guardar</button>
          </div>
        </div>
        <div class="ma-hero-hint">${hint}</div>
        <div class="ma-contact-grid">
          <label class="ma-contact-field">
            <span>Red Wi-Fi</span>
            <input type="text" id="ma-contact-ssid" value="${_esc(ssid)}" placeholder="Nombre de la red" autocomplete="off">
          </label>
          <label class="ma-contact-field">
            <span>Contraseña Wi-Fi</span>
            <input type="text" id="ma-contact-pwd" value="${_esc(pwd)}" placeholder="Contraseña" autocomplete="off">
          </label>
          <label class="ma-contact-field">
            <span>WhatsApp</span>
            <input type="tel" id="ma-contact-wa" value="${_esc(wa)}" placeholder="+34 600 000 000" autocomplete="off">
          </label>
        </div>
      </div>
    `;
  },

  async saveContactConfig() {
    const ssid = document.getElementById('ma-contact-ssid').value;
    const pwd = document.getElementById('ma-contact-pwd').value;
    const wa = document.getElementById('ma-contact-wa').value;
    const id = this.state.currentRestaurantId;
    const saved = await API.put('/api/admin/menu/restaurants/' + id + '/contact', {
      wifi_ssid: ssid, wifi_password: pwd, whatsapp_phone: wa,
    });
    if (!saved) { showToast('Error al guardar'); return; }
    const rest = this._currentRestaurant();
    if (rest) {
      rest.wifi_ssid = saved.wifi_ssid;
      rest.wifi_password = saved.wifi_password;
      rest.whatsapp_phone = saved.whatsapp_phone;
    }
    showToast('Datos guardados');
  },

  _createLoadingOverlay(text) {
    const el = document.createElement('div');
    el.className = 'ma-hero-loading';
    el.innerHTML = `<div class="ma-hero-loading-box">${_esc(text)}</div>`;
    document.body.appendChild(el);
    return el;
  },

  _parseHeroPos(pos) {
    const def = { x: 50, y: 50 };
    if (!pos || typeof pos !== 'string') return def;
    const parts = pos.trim().split(/\s+/);
    function p(v) {
      if (!v) return 50;
      if (v === 'center') return 50;
      if (v === 'left' || v === 'top') return 0;
      if (v === 'right' || v === 'bottom') return 100;
      const num = parseFloat(v);
      if (isNaN(num)) return 50;
      return Math.max(0, Math.min(100, num));
    }
    return { x: p(parts[0]), y: p(parts[1]) };
  },
  _clampZoom(z) {
    const n = Number(z);
    if (!isFinite(n)) return 1;
    return Math.max(1, Math.min(3, n));
  },

  async _resizeToMaxWidth(file, maxWidth, quality) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        im.src = url;
      });
      const ratio = img.naturalWidth > maxWidth ? (maxWidth / img.naturalWidth) : 1;
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      return await this._canvasToBlob(canvas, [quality, 0.75, 0.6]);
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  renderCategoryRow(c) {
    const name = this._t(c.name);
    const isAjax = this.state.isAjax;
    return `
      <div class="ma-cat-row ${!isAjax && c.local_active === false ? 'ma-cat-disabled' : ''}" data-cat-id="${c.id}">
        ${isAjax ? '<span class="ma-drag">⋮⋮</span>' : ''}
        <span class="ma-cat-icon">${c.icon || '🍽️'}</span>
        <div class="ma-cat-info">
          <div class="ma-cat-name">${_esc(name)}</div>
          <div class="ma-cat-meta">${c.items_count || 0} platos</div>
        </div>
        ${isAjax ? `
          <label class="ma-switch"><input type="checkbox" ${c.is_active ? 'checked' : ''} onchange="MenuAdminModule.toggleCategory('${c.id}', this.checked)"><span class="ma-slider"></span></label>
          <button class="ma-btn-edit" onclick="MenuAdminModule.openCategoryModal('${c.id}')">✏️</button>
          <button class="ma-btn-delete" onclick="MenuAdminModule.deleteCategory('${c.id}')">🗑</button>
        ` : `
          <label class="ma-switch"><input type="checkbox" ${c.local_active !== false ? 'checked' : ''} onchange="MenuAdminModule.toggleCategoryLocal('${c.id}', this.checked)"><span class="ma-slider"></span></label>
          ${c.local_active === false ? '<span class="ma-badge-disabled">Desactivada en este local</span>' : ''}
        `}
        <button class="ma-btn-edit" onclick="MenuAdminModule.openCategory('${c.id}')">Ver platos</button>
      </div>
    `;
  },

  async toggleCategory(id, active) {
    const cat = this.state.categories.find(c => c.id === id);
    if (!cat) return;
    await API.put('/api/admin/menu/categories/' + id, { name: cat.name, slug: cat.slug, icon: cat.icon, is_active: active });
    cat.is_active = active;
    showToast('Categoría actualizada');
  },

  async deleteCategory(id) {
    if (!confirm('¿Eliminar categoría y todos sus platos? Afecta a TODOS los locales.')) return;
    const r = await API.del('/api/admin/menu/categories/' + id);
    if (r) { showToast('Eliminada'); this.loadCategories(); }
  },

  async toggleCategoryLocal(catId, active) {
    const r = await API.post('/api/admin/menu/categories/' + catId + '/override', {
      restaurant_id: this.state.currentRestaurantId, is_active: active
    });
    if (r) { showToast(active ? 'Categoría activada' : 'Categoría desactivada'); this.loadCategories(); }
  },

  async toggleSubcategoryLocal(subId, active) {
    const r = await API.post('/api/admin/menu/subcategories/' + subId + '/override', {
      restaurant_id: this.state.currentRestaurantId, is_active: active
    });
    if (r) { showToast(active ? 'Subcategoría activada' : 'Subcategoría desactivada'); this.openCategory(this.state.currentCategory.id); }
  },

  openCategoryModal(id) {
    const editing = id ? this.state.categories.find(c => c.id === id) : null;
    const name = editing ? this._t(editing.name) : '';
    this._showModal(`
      <div class="ma-modal-backdrop" onclick="if(event.target===this)MenuAdminModule.closeModal()">
        <div class="ma-modal">
          <div class="ma-modal-header"><h3>${editing ? 'Editar' : 'Nueva'} categoría</h3><button class="ma-close" onclick="MenuAdminModule.closeModal()">×</button></div>
          <div class="ma-modal-body">
            <label>Nombre (ES)</label><input type="text" id="ma-cat-name" value="${_esc(name)}">
            <label>Slug</label><input type="text" id="ma-cat-slug" value="${editing ? _esc(editing.slug) : ''}">
            <label>Icono (emoji)</label><input type="text" id="ma-cat-icon" value="${editing ? _esc(editing.icon || '') : ''}">
          </div>
          <div class="ma-modal-footer">
            <button class="btn btn-secondary" onclick="MenuAdminModule.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="MenuAdminModule.saveCategory('${id || ''}')">Guardar</button>
          </div>
        </div>
      </div>
    `);
  },

  async saveCategory(id) {
    const name = document.getElementById('ma-cat-name').value.trim();
    const slug = document.getElementById('ma-cat-slug').value.trim() || this._slugify(name);
    const icon = document.getElementById('ma-cat-icon').value.trim();
    if (!name) return showToast('Nombre requerido');
    let r;
    if (id) {
      const existing = this.state.categories.find(c => c.id === id);
      r = await API.put('/api/admin/menu/categories/' + id, { name: { ...(existing.name || {}), es: name }, slug, icon, is_active: existing.is_active });
    } else {
      r = await API.post('/api/admin/menu/categories', { restaurant_id: this.state.ajaxId, name: { es: name }, slug, icon, is_active: true });
    }
    if (r) { showToast('Guardado'); this.closeModal(); this.loadCategories(); }
  },

  // ============ CATEGORY VIEW (subcats + items) ============

  async openCategory(categoryId) {
    this.state.currentCategory = this.state.categories.find(c => c.id === categoryId);
    const body = document.getElementById('ma-body');
    body.innerHTML = '<div class="ma-loading">Cargando…</div>';
    const subs = await API.get(`/api/admin/menu/subcategories?category_id=${categoryId}&restaurant_id=${this.state.currentRestaurantId}`);
    this.state.subcategories = subs || [];
    this.state.itemsBySub = {};
    for (const sub of this.state.subcategories) {
      const items = await API.get(`/api/admin/menu/items?subcategory_id=${sub.id}&restaurant_id=${this.state.currentRestaurantId}`);
      this.state.itemsBySub[sub.id] = items || [];
    }
    this.renderCategoryView();
  },

  renderCategoryView() {
    const body = document.getElementById('ma-body');
    const cat = this.state.currentCategory;
    const isAjax = this.state.isAjax;
    body.innerHTML = `
      <div class="ma-toolbar">
        <button class="btn btn-secondary btn-sm" onclick="MenuAdminModule.loadCategories()">← Categorías</button>
        <h3>${cat.icon || ''} ${_esc(this._t(cat.name))}</h3>
        <div class="ma-toolbar-actions">
          ${isAjax ? '<button class="btn btn-secondary btn-sm" onclick="MenuAdminModule.openSubcategoryModal()">+ Subcategoría</button>' : ''}
          ${isAjax ? '<button class="btn btn-primary btn-sm" onclick="MenuAdminModule.openItemModal(null)">+ Nuevo plato</button>' : ''}
        </div>
      </div>
      ${this.state.subcategories.length === 0
        ? '<div class="ma-empty">No hay subcategorías.</div>'
        : `<div id="ma-subcat-list">${this.state.subcategories.map(s => this._renderSubBlock(s)).join('')}</div>`}
    `;
    const subListEl = document.getElementById('ma-subcat-list');
    if (subListEl && isAjax && this.state.subcategories.length > 1) {
      Sortable.create(subListEl, {
        handle: '.ma-drag-sub', animation: 150,
        onEnd: () => {
          const order = Array.from(subListEl.querySelectorAll('[data-sub-id]')).map(el => el.dataset.subId);
          API.post('/api/admin/menu/subcategories/reorder', { category_id: cat.id, order });
        }
      });
    }
    for (const sub of this.state.subcategories) {
      const el = document.getElementById('ma-items-' + sub.id);
      if (el && isAjax) {
        Sortable.create(el, {
          handle: '.ma-drag', animation: 150,
          onEnd: () => {
            const order = Array.from(el.querySelectorAll('[data-item-id]')).map(x => x.dataset.itemId);
            API.post('/api/admin/menu/items/reorder', { subcategory_id: sub.id, order });
          }
        });
      }
    }
  },

  _renderSubBlock(sub) {
    const name = this._t(sub.name);
    const items = this.state.itemsBySub[sub.id] || [];
    const isAjax = this.state.isAjax;
    return `
      <div class="ma-subcat-block ${!isAjax && sub.local_active === false ? 'ma-subcat-disabled' : ''}" data-sub-id="${sub.id}">
        <div class="ma-subcat-header">
          <h4>${isAjax ? '<span class="ma-drag-sub" title="Arrastrar para reordenar">⋮⋮</span> ' : ''}${_esc(name)} <span class="ma-count">${items.length}</span></h4>
          <div>
            ${isAjax ? `<button class="ma-btn-edit" onclick="MenuAdminModule.openSubcategoryModal('${sub.id}')">✏️</button>
              <button class="ma-btn-delete" onclick="MenuAdminModule.deleteSubcategory('${sub.id}')">🗑</button>` : `
              <label class="ma-switch"><input type="checkbox" ${sub.local_active !== false ? 'checked' : ''} onchange="MenuAdminModule.toggleSubcategoryLocal('${sub.id}', this.checked)"><span class="ma-slider"></span></label>
              ${sub.local_active === false ? '<span class="ma-badge-disabled">Desactivada</span>' : ''}
            `}
            ${isAjax ? `<button class="btn btn-primary btn-sm" onclick="MenuAdminModule.openItemModal(null, '${sub.id}')">+ Plato</button>` : ''}
          </div>
        </div>
        <div class="ma-item-list" id="ma-items-${sub.id}">
          ${items.length === 0 ? '<div class="ma-empty-sm">Sin platos</div>' : items.map(it => this._renderItemRow(it)).join('')}
        </div>
      </div>
    `;
  },

  _renderItemRow(item) {
    const isAjax = this.state.isAjax;
    const name = this._t(isAjax ? item.name : item.effective_name);
    const prices = item.prices || [];
    let priceStr = '—';
    if (prices.length === 1) priceStr = this._fmtPrice(prices[0].price);
    else if (prices.length > 1) priceStr = 'Desde ' + this._fmtPrice(Math.min(...prices.map(p => parseFloat(p.price))));
    const img = item.image_url ? `<img src="${_esc(item.image_url)}" class="ma-item-thumb">` : '<div class="ma-item-thumb ma-no-img"></div>';
    const overrideBadge = !isAjax && (item.has_override || item.has_price_override) ? '<span class="ma-badge-override">⚙️ Personalizado</span>' : '';
    const activeCheck = isAjax ? item.is_active : item.effective_active;
    return `
      <div class="ma-item-row ${!activeCheck ? 'ma-item-inactive' : ''}" data-item-id="${item.id}">
        ${isAjax ? '<span class="ma-drag">⋮⋮</span>' : ''}
        ${img}
        <div class="ma-item-info">
          <div class="ma-item-name">${_esc(name)} ${item.is_featured ? '<span class="ma-badge">⭐</span>' : ''} ${overrideBadge}</div>
          <div class="ma-item-price">${priceStr}${!isAjax && item.has_price_override ? ' <span class="ma-price-local">(precio local)</span>' : ''}</div>
        </div>
        <label class="ma-switch">
          <input type="checkbox" ${activeCheck ? 'checked' : ''} onchange="MenuAdminModule.toggleItem('${item.id}', this.checked)">
          <span class="ma-slider"></span>
        </label>
        <button class="ma-btn-edit" onclick="MenuAdminModule.openItemModal('${item.id}', '${item.subcategory_id}')">✏️</button>
        ${!isAjax && (item.has_override || item.has_price_override) ? `<button class="ma-btn-edit" title="Restaurar a maestro" onclick="MenuAdminModule.restoreItem('${item.id}')">🔄</button>` : ''}
        ${isAjax ? `<button class="ma-btn-delete" onclick="MenuAdminModule.deleteItem('${item.id}')">🗑</button>` : ''}
      </div>
    `;
  },

  async toggleItem(id, active) {
    const rid = this.state.currentRestaurantId;
    if (this.state.isAjax) {
      await API.put('/api/admin/menu/items/' + id, { restaurant_id: rid, is_active: active });
    } else {
      await API.put('/api/admin/menu/items/' + id, { restaurant_id: rid, is_active: active });
    }
    showToast('Actualizado');
    this.openCategory(this.state.currentCategory.id);
  },

  async deleteItem(id) {
    const msg = this.state.isAjax
      ? '¿Eliminar este plato de TODOS los locales?'
      : '¿Quitar override de este plato para este local?';
    if (!confirm(msg)) return;
    await API.del(`/api/admin/menu/items/${id}?restaurant_id=${this.state.currentRestaurantId}`);
    showToast('Eliminado');
    this.openCategory(this.state.currentCategory.id);
  },

  async restoreItem(id) {
    if (!confirm('¿Restaurar este plato a los valores de la plantilla maestra? Se borran nombre, descripción y precios personalizados de este local.')) return;
    const r = await API.post(`/api/admin/menu/items/${id}/restore`, { restaurant_id: this.state.currentRestaurantId });
    if (r) { showToast('Restaurado a maestro'); this.openCategory(this.state.currentCategory.id); }
  },

  // ============ SUBCATEGORY MODAL ============

  openSubcategoryModal(id) {
    const editing = id ? this.state.subcategories.find(s => s.id === id) : null;
    const name = editing ? this._t(editing.name) : '';
    this._showModal(`
      <div class="ma-modal-backdrop" onclick="if(event.target===this)MenuAdminModule.closeModal()">
        <div class="ma-modal">
          <div class="ma-modal-header"><h3>${editing ? 'Editar' : 'Nueva'} subcategoría</h3><button class="ma-close" onclick="MenuAdminModule.closeModal()">×</button></div>
          <div class="ma-modal-body">
            <label>Nombre (ES)</label><input type="text" id="ma-sub-name" value="${_esc(name)}">
            <label>Slug</label><input type="text" id="ma-sub-slug" value="${editing ? _esc(editing.slug) : ''}">
          </div>
          <div class="ma-modal-footer">
            <button class="btn btn-secondary" onclick="MenuAdminModule.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="MenuAdminModule.saveSubcategory('${id || ''}')">Guardar</button>
          </div>
        </div>
      </div>
    `);
  },

  async saveSubcategory(id) {
    const name = document.getElementById('ma-sub-name').value.trim();
    const slug = document.getElementById('ma-sub-slug').value.trim() || this._slugify(name);
    if (!name) return showToast('Nombre requerido');
    let r;
    if (id) {
      const existing = this.state.subcategories.find(s => s.id === id);
      r = await API.put('/api/admin/menu/subcategories/' + id, { name: { ...(existing.name || {}), es: name }, slug, is_active: existing.is_active });
    } else {
      r = await API.post('/api/admin/menu/subcategories', { category_id: this.state.currentCategory.id, name: { es: name }, slug, is_active: true });
    }
    if (r) { showToast('Guardado'); this.closeModal(); this.openCategory(this.state.currentCategory.id); }
  },

  async deleteSubcategory(id) {
    if (!confirm('¿Eliminar subcategoría y sus platos? Afecta a TODOS los locales.')) return;
    const r = await API.del('/api/admin/menu/subcategories/' + id);
    if (r) { showToast('Eliminado'); this.openCategory(this.state.currentCategory.id); }
  },

  // ============ ITEM MODAL ============

  async openItemModal(itemId, subcategoryId) {
    const isAjax = this.state.isAjax;
    const rid = this.state.currentRestaurantId;
    let item = null;
    let subId = subcategoryId;

    if (itemId) {
      item = await API.get(`/api/admin/menu/items/${itemId}?restaurant_id=${rid}`);
      if (!item) return;
      subId = item.subcategory_id;
    }

    // For local: pick the first subcategory if none passed
    if (!subId && this.state.subcategories.length) {
      subId = this.state.subcategories[0].id;
    }

    const langTabs = this.LANGS.map((lg, i) =>
      `<button class="ma-lang-tab ${i === 0 ? 'active' : ''}" data-lang="${lg}" onclick="MenuAdminModule._switchLang('${lg}')">${this.LANG_LABELS[lg]}</button>`
    ).join('');

    let langPanels = '';
    if (isAjax) {
      langPanels = this.LANGS.map((lg, i) => `
        <div class="ma-lang-panel ${i === 0 ? 'active' : ''}" data-lang="${lg}">
          <label>Nombre (${this.LANG_LABELS[lg]})</label>
          <input type="text" data-field="name" data-lang="${lg}" value="${_esc((item && item.name && item.name[lg]) || '')}">
          <label>Descripción (${this.LANG_LABELS[lg]})</label>
          <textarea data-field="description" data-lang="${lg}" rows="3">${_esc((item && item.description && item.description[lg]) || '')}</textarea>
        </div>
      `).join('');
    } else {
      // Local: show master + custom fields
      const ov = item ? item.override : null;
      langPanels = this.LANGS.map((lg, i) => `
        <div class="ma-lang-panel ${i === 0 ? 'active' : ''}" data-lang="${lg}">
          <label>Nombre maestro (${this.LANG_LABELS[lg]})</label>
          <div class="ma-inherited">${_esc((item && item.master_name && item.master_name[lg]) || '—')}</div>
          <label>Nombre personalizado (${this.LANG_LABELS[lg]}) <small>dejar vacío para heredar</small></label>
          <input type="text" data-field="name" data-lang="${lg}" value="${_esc((ov && ov.custom_name && ov.custom_name[lg]) || '')}">
          <label>Descripción maestra (${this.LANG_LABELS[lg]})</label>
          <div class="ma-inherited">${_esc((item && item.master_description && item.master_description[lg]) || '—')}</div>
          <label>Descripción personalizada (${this.LANG_LABELS[lg]}) <small>dejar vacío para heredar</small></label>
          <textarea data-field="description" data-lang="${lg}" rows="2">${_esc((ov && ov.custom_description && ov.custom_description[lg]) || '')}</textarea>
        </div>
      `).join('');
    }

    // Prices: in AJAX edit master prices, in local edit local overrides (show master as reference)
    const masterPrices = (item && item.master_prices) || [];
    const localPrices = (item && item.local_prices) || [];
    const editPrices = isAjax ? masterPrices : (localPrices.length ? localPrices : []);

    let pricesHtml = '';
    if (!isAjax && masterPrices.length) {
      pricesHtml += '<div class="ma-master-prices"><label>Precios maestros (referencia):</label>';
      pricesHtml += masterPrices.map(p => `<span class="ma-ref-price">${_esc(this._t(p.variant_name))} ${this._fmtPrice(p.price)}</span>`).join(' ');
      pricesHtml += '</div>';
    }
    const pricesToShow = editPrices.length ? editPrices : [{ variant_name: null, price: '' }];
    pricesHtml += pricesToShow.map((p, i) => this._renderPriceRow(p, i)).join('');

    const labelsHtml = this.LABELS.map(l =>
      `<label class="ma-check"><input type="checkbox" data-label="${l}" ${item && (item.labels || []).includes(l) ? 'checked' : ''} ${!isAjax ? 'disabled' : ''}> ${l}</label>`
    ).join('');

    const allergensHtml = this.ALLERGENS.map(a =>
      `<label class="ma-check"><input type="checkbox" data-allergen="${a}" ${item && (item.allergens || []).includes(a) ? 'checked' : ''} ${!isAjax ? 'disabled' : ''}> ${a}</label>`
    ).join('');

    const imgPreview = item && item.image_url
      ? `<img id="ma-img-preview" src="${_esc(item.image_url)}">`
      : `<div id="ma-img-preview" class="ma-no-img">Sin foto</div>`;
    const thumbSrc = item && (item.image_thumbnail_url || item.image_url);
    const thumbPreview = thumbSrc
      ? `<img id="ma-thumb-preview" class="ma-thumb-preview" src="${_esc(thumbSrc)}">`
      : `<div id="ma-thumb-preview" class="ma-thumb-preview ma-no-img">Thumb</div>`;

    const activeChecked = item ? (isAjax ? item.is_active : item.effective_active) : true;

    this._showModal(`
      <div class="ma-modal-backdrop" onclick="if(event.target===this)MenuAdminModule.closeModal()">
        <div class="ma-modal ma-modal-lg">
          <div class="ma-modal-header">
            <h3>${item ? 'Editar plato' : 'Nuevo plato'} ${!isAjax ? '<span class="ma-badge-override">⚙️ Override local</span>' : ''}</h3>
            <button class="ma-close" onclick="MenuAdminModule.closeModal()">×</button>
          </div>
          <div class="ma-modal-body">
            <div class="ma-lang-tabs">${langTabs}</div>
            <div class="ma-lang-panels">${langPanels}</div>

            ${isAjax ? `<h4>Foto</h4>
            <div class="ma-img-row">
              ${thumbPreview}
              ${imgPreview}
              <input type="file" id="ma-img-input" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onchange="MenuAdminModule._cropTarget=null;MenuAdminModule._handleImage(event)">
              <input type="hidden" id="ma-img-url" value="${item ? _esc(item.image_url || '') : ''}">
              <input type="hidden" id="ma-img-thumb-url" value="${item ? _esc(item.image_thumbnail_url || '') : ''}">
              <div id="ma-img-status" class="ma-img-status" style="display:none"></div>
            </div>` : ''}

            <h4>Precios ${isAjax ? '' : '<small>(override local)</small>'} <button class="btn btn-secondary btn-sm" onclick="MenuAdminModule._addPriceRow()">+ variante</button></h4>
            <div id="ma-prices">${pricesHtml}</div>

            ${isAjax ? `
            <h4>Etiquetas</h4>
            <div class="ma-checks">${labelsHtml}</div>
            <h4>Alérgenos</h4>
            <div class="ma-checks">${allergensHtml}</div>
            ` : `
            <div class="ma-inherited-section">
              <h4>Etiquetas (heredadas)</h4><div class="ma-checks">${labelsHtml}</div>
              <h4>Alérgenos (heredados)</h4><div class="ma-checks">${allergensHtml}</div>
            </div>
            `}

            <div class="ma-toggles">
              ${isAjax ? `<label class="ma-check"><input type="checkbox" id="ma-featured" ${item && item.is_featured ? 'checked' : ''}> Destacado</label>` : ''}
              <label class="ma-check"><input type="checkbox" id="ma-active" ${activeChecked ? 'checked' : ''}> Activo</label>
            </div>
          </div>
          <div class="ma-modal-footer">
            ${item && isAjax ? `<button class="btn btn-danger" onclick="MenuAdminModule._deleteFromModal('${item.id}')">Eliminar</button>` : ''}
            ${item && !isAjax && (item.has_override || item.has_price_override) ? `<button class="btn btn-danger" onclick="MenuAdminModule._restoreFromModal('${item.id}')">🔄 Restaurar a maestro</button>` : ''}
            <button class="btn btn-secondary" onclick="MenuAdminModule._openPreview()">👁 Vista previa</button>
            <button class="btn btn-secondary" onclick="MenuAdminModule.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="MenuAdminModule._saveItem('${item ? item.id : ''}', '${subId}')">Guardar</button>
          </div>
        </div>
      </div>
    `);
  },

  async _saveItem(itemId, subcategoryId) {
    const modal = document.querySelector('.ma-modal');
    const isAjax = this.state.isAjax;
    const rid = this.state.currentRestaurantId;

    // Collect names/descriptions
    const name = {}, description = {};
    modal.querySelectorAll('[data-field="name"]').forEach(el => {
      if (el.value.trim()) name[el.dataset.lang] = el.value.trim();
    });
    modal.querySelectorAll('[data-field="description"]').forEach(el => {
      if (el.value.trim()) description[el.dataset.lang] = el.value.trim();
    });

    if (isAjax && !name.es) return showToast('Nombre en español requerido');

    // Prices
    const prices = [];
    modal.querySelectorAll('#ma-prices .ma-price-row').forEach(row => {
      const variant = row.querySelector('[data-price-field="variant"]').value.trim();
      const priceStr = row.querySelector('[data-price-field="price"]').value;
      if (priceStr === '' || isNaN(parseFloat(priceStr))) return;
      const vImgUrl = row.querySelector('[data-price-field="image_url"]')?.value || null;
      const vThumbUrl = row.querySelector('[data-price-field="image_thumbnail_url"]')?.value || null;
      prices.push({ variant_name: variant ? { es: variant } : null, price: parseFloat(priceStr), image_url: vImgUrl || null, image_thumbnail_url: vThumbUrl || null });
    });

    if (isAjax) {
      if (!prices.length) return showToast('Agregá al menos un precio');
      const labels = [];
      modal.querySelectorAll('[data-label]').forEach(el => { if (el.checked) labels.push(el.dataset.label); });
      const allergens = [];
      modal.querySelectorAll('[data-allergen]').forEach(el => { if (el.checked) allergens.push(el.dataset.allergen); });

      const body = {
        restaurant_id: rid, name, description,
        image_url: document.getElementById('ma-img-url')?.value || null,
        image_thumbnail_url: document.getElementById('ma-img-thumb-url')?.value || null,
        labels, allergens,
        is_featured: document.getElementById('ma-featured')?.checked || false,
        is_active: document.getElementById('ma-active')?.checked !== false,
        prices
      };
      if (itemId) {
        await API.put('/api/admin/menu/items/' + itemId, body);
      } else {
        body.subcategory_id = subcategoryId;
        await API.post('/api/admin/menu/items', body);
      }
    } else {
      // Local override
      const body = { restaurant_id: rid };
      if (Object.keys(name).length) body.name = name;
      if (Object.keys(description).length) body.description = description;
      body.is_active = document.getElementById('ma-active')?.checked !== false;
      if (prices.length) body.prices = prices;
      await API.put('/api/admin/menu/items/' + itemId, body);
    }

    showToast('Guardado');
    this.closeModal();
    this.openCategory(this.state.currentCategory.id);
  },

  async _deleteFromModal(id) {
    if (!confirm('¿Eliminar este plato de TODOS los locales?')) return;
    await API.del(`/api/admin/menu/items/${id}?restaurant_id=${this.state.currentRestaurantId}`);
    showToast('Eliminado');
    this.closeModal();
    this.openCategory(this.state.currentCategory.id);
  },

  async _restoreFromModal(id) {
    if (!confirm('¿Restaurar a los valores de la plantilla maestra?')) return;
    await API.post(`/api/admin/menu/items/${id}/restore`, { restaurant_id: this.state.currentRestaurantId });
    showToast('Restaurado');
    this.closeModal();
    this.openCategory(this.state.currentCategory.id);
  },

  // ============ helpers ============

  _renderPriceRow(p, i) {
    const variantEs = (p.variant_name && p.variant_name.es) || '';
    const hasPhoto = !!(p.image_url || p.image_thumbnail_url);
    const thumbSrc = p.image_thumbnail_url || p.image_url || '';
    return `<div class="ma-price-row" data-idx="${i}">
      <input type="text" placeholder="Variante (ej: Mediana)" data-price-field="variant" value="${_esc(variantEs)}">
      <input type="number" step="0.01" placeholder="Precio" data-price-field="price" value="${p.price || ''}">
      <input type="hidden" data-price-field="image_url" value="${_esc(p.image_url || '')}">
      <input type="hidden" data-price-field="image_thumbnail_url" value="${_esc(p.image_thumbnail_url || '')}">
      <div class="ma-variant-photo">
        ${hasPhoto ? `<img class="ma-variant-thumb" src="${_esc(thumbSrc)}" data-variant-thumb>` : ''}
        <button type="button" class="ma-variant-photo-btn" onclick="MenuAdminModule._handleVariantImage(this)" title="Foto variante">\u{1F4F7}</button>
        ${hasPhoto ? `<button type="button" class="ma-btn-delete ma-variant-remove" onclick="MenuAdminModule._removeVariantImage(this)" title="Quitar foto">×</button>` : ''}
      </div>
      <button class="ma-btn-delete" onclick="this.parentElement.remove()">×</button>
    </div>`;
  },

  _addPriceRow() {
    const el = document.getElementById('ma-prices');
    const div = document.createElement('div');
    div.innerHTML = this._renderPriceRow({ variant_name: null, price: '' }, el.children.length);
    el.appendChild(div.firstElementChild);
  },

  _switchLang(lang) {
    document.querySelectorAll('.ma-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
    document.querySelectorAll('.ma-lang-panel').forEach(p => p.classList.toggle('active', p.dataset.lang === lang));
  },

  _setImgStatus(text, type) {
    const el = document.getElementById('ma-img-status');
    if (!el) return;
    el.style.display = text ? 'block' : 'none';
    el.textContent = text;
    el.className = 'ma-img-status' + (type ? ' ma-img-status-' + type : '');
  },

  _fmtSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  },

  async _handleImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    const validExts = /\.(jpe?g|png|webp|heic|heif)$/i;
    if (!validTypes.includes(file.type) && !validExts.test(file.name)) {
      showToast('No se pudo procesar la imagen. Verificá que sea un archivo JPG, PNG o WebP.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      showToast('Archivo supera 25MB');
      return;
    }

    console.log(`[img-upload] Original: ${this._fmtSize(file.size)} (${file.type || file.name})`);

    try {
      this._setImgStatus('Cargando editor...', 'working');
      await this._loadCropperLib();
      this._setImgStatus('', null);
      this._openCropEditor(file);
    } catch (err) {
      console.error('[img-upload] Error:', err);
      this._setImgStatus('', null);
      showToast('No se pudo procesar la imagen. Verificá que sea un archivo JPG, PNG o WebP.');
    }
  },

  _loadCropperLib() {
    if (this.state.cropperLib) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';
      js.onload = () => { this.state.cropperLib = true; resolve(); };
      js.onerror = () => reject(new Error('No se pudo cargar el editor de imagen'));
      document.head.appendChild(js);
    });
  },

  _openCropEditor(file) {
    this._cropFileOriginal = file;
    this._cropObjectUrl = URL.createObjectURL(file);
    this._cropStep = 1;
    this._cropThumbCanvas = null;
    const wrap = document.createElement('div');
    wrap.id = 'ma-crop-wrap';
    wrap.innerHTML = `
      <div class="ma-crop-overlay">
        <div class="ma-crop-dialog">
          <div class="ma-crop-header">
            <div>
              <div class="ma-crop-step" id="ma-crop-step">Paso 1 de 2: Recorte para el listado</div>
              <h3 id="ma-crop-title">Recorte cuadrado (thumbnail)</h3>
            </div>
            <button class="ma-close" onclick="MenuAdminModule._closeCropEditor()">×</button>
          </div>
          <div class="ma-crop-body">
            <div class="ma-crop-container"><img id="ma-crop-img" src="${this._cropObjectUrl}"></div>
            <div class="ma-crop-toolbar">
              <button class="ma-crop-zoom-btn" id="ma-crop-zoom-out">−</button>
              <input type="range" id="ma-crop-zoom" min="0" max="3" step="0.01" value="1">
              <button class="ma-crop-zoom-btn" id="ma-crop-zoom-in">+</button>
            </div>
          </div>
          <div class="ma-crop-footer">
            <button class="btn btn-secondary" id="ma-crop-back" style="display:none;margin-right:auto" onclick="MenuAdminModule._goBackCropStep()">← Paso anterior</button>
            <button class="btn btn-secondary" onclick="MenuAdminModule._closeCropEditor()">Cancelar</button>
            <button class="btn btn-primary" onclick="MenuAdminModule._confirmCrop()">Confirmar recorte</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    this._initCropStep(1);
  },

  _initCropStep(step) {
    this._cropStep = step;
    const stepEl = document.getElementById('ma-crop-step');
    const titleEl = document.getElementById('ma-crop-title');
    const backBtn = document.getElementById('ma-crop-back');
    if (step === 1) {
      stepEl.textContent = 'Paso 1 de 2: Recorte para el listado';
      titleEl.textContent = 'Recorte cuadrado (thumbnail)';
      backBtn.style.display = 'none';
    } else {
      stepEl.textContent = 'Paso 2 de 2: Recorte para el detalle';
      titleEl.textContent = 'Recorte vertical (detalle)';
      backBtn.style.display = 'inline-block';
    }
    if (this._cropper) { this._cropper.destroy(); this._cropper = null; }
    const img = document.getElementById('ma-crop-img');
    img.src = this._cropObjectUrl;
    const self = this;
    this._cropper = new Cropper(img, {
      aspectRatio: step === 1 ? 1 : 27 / 35,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: false,
      cropBoxResizable: false,
      toggleDragModeOnDblclick: false,
      ready() {
        const imageData = self._cropper.getImageData();
        self._cropInitialZoom = imageData.width / imageData.naturalWidth;
        const slider = document.getElementById('ma-crop-zoom');
        slider.min = (self._cropInitialZoom * 0.5).toFixed(4);
        slider.max = (self._cropInitialZoom * 4).toFixed(4);
        slider.step = (self._cropInitialZoom * 0.05).toFixed(4);
        slider.value = self._cropInitialZoom.toFixed(4);
        slider.oninput = () => self._cropper.zoomTo(parseFloat(slider.value));
        document.getElementById('ma-crop-zoom-in').onclick = () => self._cropper.zoom(0.1);
        document.getElementById('ma-crop-zoom-out').onclick = () => self._cropper.zoom(-0.1);
      },
      zoom(e) {
        const slider = document.getElementById('ma-crop-zoom');
        if (slider) slider.value = e.detail.ratio;
        const maxZ = self._cropInitialZoom * 4;
        const minZ = self._cropInitialZoom * 0.5;
        if (e.detail.ratio > maxZ || e.detail.ratio < minZ) e.preventDefault();
      }
    });
  },

  _goBackCropStep() {
    if (this._cropStep === 2) {
      this._cropThumbCanvas = null;
      this._initCropStep(1);
    }
  },

  _closeCropEditor() {
    if (this._cropper) { this._cropper.destroy(); this._cropper = null; }
    if (this._cropObjectUrl) { URL.revokeObjectURL(this._cropObjectUrl); this._cropObjectUrl = null; }
    this._cropThumbCanvas = null;
    const wrap = document.getElementById('ma-crop-wrap');
    if (wrap) wrap.remove();
  },

  async _confirmCrop() {
    if (!this._cropper) return;

    if (this._cropStep === 1) {
      this._cropThumbCanvas = this._cropper.getCroppedCanvas({ width: 1080, height: 1080 });
      this._initCropStep(2);
      return;
    }

    // Step 2: process both crops
    const detailCanvas = this._cropper.getCroppedCanvas({ width: 1080, height: 1400 });
    const thumbCanvas = this._cropThumbCanvas;
    const file = this._cropFileOriginal;
    this._closeCropEditor();

    if (!thumbCanvas || !detailCanvas) { showToast('Error al procesar las imágenes'); return; }

    this._setImgStatus('Comprimiendo...', 'working');
    try {
      const thumbBlob = await this._canvasToBlob(thumbCanvas, [0.85, 0.7, 0.6]);
      if (!thumbBlob) { this._setImgStatus('', null); showToast('No se pudo comprimir el thumbnail'); return; }
      const detailBlob = await this._canvasToBlob(detailCanvas, [0.85, 0.7, 0.6]);
      if (!detailBlob) { this._setImgStatus('', null); showToast('No se pudo comprimir la imagen de detalle'); return; }

      console.log(`[img-upload] Original: ${this._fmtSize(file ? file.size : 0)} → Thumb: ${this._fmtSize(thumbBlob.size)}, Detail: ${this._fmtSize(detailBlob.size)}`);

      // Show previews (main item only)
      let thumbUrl, detailUrl;
      if (!this._cropTarget) {
        thumbUrl = URL.createObjectURL(thumbBlob);
        detailUrl = URL.createObjectURL(detailBlob);
        const thumbEl = document.getElementById('ma-thumb-preview');
        if (thumbEl) thumbEl.outerHTML = `<img id="ma-thumb-preview" class="ma-thumb-preview" src="${thumbUrl}">`;
        const detailEl = document.getElementById('ma-img-preview');
        if (detailEl) detailEl.outerHTML = `<img id="ma-img-preview" src="${detailUrl}">`;
      }

      // Upload thumbnail
      this._setImgStatus('Subiendo thumbnail...', 'working');
      const thumbBase64 = await this._blobToBase64(thumbBlob);
      const thumbR = await API.post('/api/admin/menu/upload-image', {
        filename: 'thumb_' + (file ? file.name : 'image.jpg'), content_type: 'image/jpeg', data_base64: thumbBase64
      });
      if (!thumbR) { this._setImgStatus('', null); showToast('Error al subir thumbnail'); return; }

      // Upload detail
      this._setImgStatus('Subiendo imagen detalle...', 'working');
      const detailBase64 = await this._blobToBase64(detailBlob);
      const detailR = await API.post('/api/admin/menu/upload-image', {
        filename: 'detail_' + (file ? file.name : 'image.jpg'), content_type: 'image/jpeg', data_base64: detailBase64
      });
      if (!detailR) { this._setImgStatus('', null); showToast('Error al subir imagen detalle'); return; }

      // Save URLs
      if (this._cropTarget) {
        const row = this._cropTarget;
        row.querySelector('[data-price-field="image_url"]').value = detailR.url;
        row.querySelector('[data-price-field="image_thumbnail_url"]').value = thumbR.url;
        let vThumb = row.querySelector('[data-variant-thumb]');
        if (vThumb) {
          vThumb.src = thumbR.url;
        } else {
          const photoDiv = row.querySelector('.ma-variant-photo');
          if (photoDiv) {
            const img = document.createElement('img');
            img.className = 'ma-variant-thumb';
            img.src = thumbR.url;
            img.setAttribute('data-variant-thumb', '');
            photoDiv.insertBefore(img, photoDiv.firstChild);
            if (!photoDiv.querySelector('.ma-variant-remove')) {
              const rb = document.createElement('button');
              rb.type = 'button';
              rb.className = 'ma-btn-delete ma-variant-remove';
              rb.title = 'Quitar foto';
              rb.textContent = '\u00d7';
              rb.onclick = function() { MenuAdminModule._removeVariantImage(this); };
              photoDiv.appendChild(rb);
            }
          }
        }
        this._cropTarget = null;
      } else {
        document.getElementById('ma-img-thumb-url').value = thumbR.url;
        document.getElementById('ma-img-url').value = detailR.url;
        const finalThumb = document.getElementById('ma-thumb-preview');
        if (finalThumb) finalThumb.src = thumbR.url;
        const finalDetail = document.getElementById('ma-img-preview');
        if (finalDetail) finalDetail.src = detailR.url;
      }
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      if (detailUrl) URL.revokeObjectURL(detailUrl);

      this._setImgStatus('Listo \u2713', 'success');
      setTimeout(() => this._setImgStatus('', null), 3000);
      showToast('Fotos subidas');
    } catch (err) {
      console.error('[img-upload] Error:', err);
      this._setImgStatus('', null);
      showToast('Error al subir, intentá de nuevo');
    }
  },

  async _canvasToBlob(canvas, qualities) {
    const maxBytes = 5 * 1024 * 1024;
    let blob = null;
    for (const q of qualities) {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/jpeg', q);
      });
      if (blob.size <= maxBytes) break;
    }
    return (blob && blob.size <= maxBytes) ? blob : null;
  },

  _getFormData() {
    const modal = document.querySelector('.ma-modal');
    if (!modal) return null;
    const activeLangTab = modal.querySelector('.ma-lang-tab.active');
    const lang = activeLangTab ? activeLangTab.dataset.lang : 'es';
    const nameEl = modal.querySelector(`[data-field="name"][data-lang="${lang}"]`);
    const descEl = modal.querySelector(`[data-field="description"][data-lang="${lang}"]`);
    const name = nameEl ? nameEl.value.trim() : '';
    const desc = descEl ? descEl.value.trim() : '';
    const imgUrl = document.getElementById('ma-img-url')?.value || '';
    const imgThumbUrl = document.getElementById('ma-img-thumb-url')?.value || '';
    const prices = [];
    modal.querySelectorAll('#ma-prices .ma-price-row').forEach(row => {
      const variant = row.querySelector('[data-price-field="variant"]')?.value.trim() || '';
      const price = row.querySelector('[data-price-field="price"]')?.value || '';
      if (price && !isNaN(parseFloat(price))) prices.push({ variant, price: parseFloat(price) });
    });
    const labels = [];
    modal.querySelectorAll('[data-label]').forEach(el => { if (el.checked) labels.push(el.dataset.label); });
    const allergens = [];
    modal.querySelectorAll('[data-allergen]').forEach(el => { if (el.checked) allergens.push(el.dataset.allergen); });
    return { name, desc, imgUrl, imgThumbUrl, prices, labels, allergens, lang };
  },

  _openPreview() {
    const data = this._getFormData();
    if (!data) return;
    const LABEL_MAP = {
      vegano: '🌱 Vegano', picante: '🌶️ Picante', sin_gluten: '🌾 Sin gluten',
      sin_lacteos: '🥛 Sin lácteos', vegetariano: '🥬 Vegetariano', contiene_cerdo: '🐷 Cerdo',
      nuevo: '✨ Nuevo', bestseller: '⭐ Bestseller', congelado: '❄️ Congelado', sin_lactosa: '🥛 Sin lactosa'
    };
    const detailImgHtml = data.imgUrl
      ? `<div class="ma-pv-img-wrap"><img class="ma-pv-img" src="${_esc(data.imgUrl)}"></div>`
      : `<div class="ma-pv-img-wrap ma-pv-no-img"><span>📷</span></div>`;
    const thumbSrc = data.imgThumbUrl || data.imgUrl;
    const thumbImgHtml = thumbSrc
      ? `<img class="ma-pv-list-thumb" src="${_esc(thumbSrc)}">`
      : `<div class="ma-pv-list-thumb ma-pv-no-img"><span>📷</span></div>`;
    let pricesHtml = '';
    if (data.prices.length === 1 && !data.prices[0].variant) {
      pricesHtml = `<div class="ma-pv-price-single">${data.prices[0].price.toFixed(2).replace('.', ',')} €</div>`;
    } else if (data.prices.length) {
      pricesHtml = '<div class="ma-pv-prices">' + data.prices.map(p =>
        `<div class="ma-pv-price-var"><span class="ma-pv-var-name">${_esc(p.variant || 'Estándar')}</span><span class="ma-pv-var-price">${p.price.toFixed(2).replace('.', ',')} €</span></div>`
      ).join('') + '</div>';
    }
    let priceStr = '';
    if (data.prices.length === 1) priceStr = data.prices[0].price.toFixed(2).replace('.', ',') + ' €';
    else if (data.prices.length > 1) priceStr = 'Desde ' + Math.min(...data.prices.map(p => p.price)).toFixed(2).replace('.', ',') + ' €';
    const labelsHtml = data.labels.length
      ? '<div class="ma-pv-labels">' + data.labels.map(l => `<span class="ma-pv-label">${LABEL_MAP[l] || l}</span>`).join('') + '</div>'
      : '';
    const listLabelsHtml = data.labels.length
      ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">' + data.labels.slice(0, 2).map(l => `<span style="font-size:0.6rem;padding:1px 6px;border-radius:4px;background:rgba(212,168,83,0.12);color:#d4a853">${LABEL_MAP[l] || l}</span>`).join('') + '</div>'
      : '';
    const allergensHtml = data.allergens.length
      ? '<div class="ma-pv-allergens"><div class="ma-pv-allergens-title">ALÉRGENOS</div><div class="ma-pv-allergens-list">' +
        data.allergens.map(a => `<span class="ma-pv-allergen">${_esc(a)}</span>`).join('') + '</div></div>'
      : '';
    const wrap = document.createElement('div');
    wrap.id = 'ma-preview-wrap';
    wrap.innerHTML = `
      <div class="ma-preview-overlay" onclick="if(event.target===this)MenuAdminModule._closePreview()">
        <div class="ma-phone-frame">
          <div class="ma-phone-notch"></div>
          <div class="ma-pv-toggle">
            <button class="ma-pv-toggle-btn active" onclick="MenuAdminModule._switchPreviewView('list',this)">Ver listado</button>
            <button class="ma-pv-toggle-btn" onclick="MenuAdminModule._switchPreviewView('detail',this)">Ver detalle</button>
          </div>
          <div class="ma-phone-screen">
            <div id="ma-pv-list-view" class="ma-pv-view active">
              <div class="ma-pv-list-card">
                ${thumbImgHtml}
                <div class="ma-pv-list-info">
                  <div class="ma-pv-list-name-row">
                    <span class="ma-pv-list-name">${_esc(data.name) || 'Sin nombre'}</span>
                    <span class="ma-pv-list-price">${priceStr}</span>
                  </div>
                  ${data.desc ? `<div class="ma-pv-list-desc">${_esc(data.desc)}</div>` : ''}
                  ${listLabelsHtml}
                </div>
              </div>
            </div>
            <div id="ma-pv-detail-view" class="ma-pv-view">
              ${detailImgHtml}
              <div class="ma-pv-body">
                <div class="ma-pv-title">${_esc(data.name) || 'Sin nombre'}</div>
                ${data.desc ? `<div class="ma-pv-desc">${_esc(data.desc)}</div>` : ''}
                ${pricesHtml}
                ${labelsHtml}
                ${allergensHtml}
              </div>
            </div>
          </div>
          <button class="ma-pv-close-btn" onclick="MenuAdminModule._closePreview()">Cerrar preview</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  },

  _switchPreviewView(view, btn) {
    document.querySelectorAll('.ma-pv-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.ma-pv-view').forEach(v => v.classList.remove('active'));
    document.getElementById(view === 'list' ? 'ma-pv-list-view' : 'ma-pv-detail-view').classList.add('active');
  },

  _closePreview() {
    const wrap = document.getElementById('ma-preview-wrap');
    if (wrap) wrap.remove();
  },

  _handleVariantImage(btn) {
    const row = btn.closest('.ma-price-row');
    this._cropTarget = row;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = (e) => { this._handleImage(e); input.remove(); };
    input.click();
  },

  _removeVariantImage(btn) {
    const row = btn.closest('.ma-price-row');
    row.querySelector('[data-price-field="image_url"]').value = '';
    row.querySelector('[data-price-field="image_thumbnail_url"]').value = '';
    const thumb = row.querySelector('[data-variant-thumb]');
    if (thumb) thumb.remove();
    btn.remove();
  },

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  },

  // ============ QR DOWNLOAD ============
  openQrModal() {
    if (this.state.isAjax) return;
    const rest = this._currentRestaurant();
    if (!rest) return;
    const name = rest.name || rest.slug;
    const publicUrl = rest.public_url || '';

    this._showModal(`
      <div class="ma-modal-backdrop" onclick="if(event.target===this)MenuAdminModule.closeModal()">
        <div class="ma-modal ma-modal-qr">
          <div class="ma-modal-header">
            <h3>QR de ${_esc(name)}</h3>
            <button class="ma-close" onclick="MenuAdminModule.closeModal()">×</button>
          </div>
          <div class="ma-modal-body">
            <div class="ma-qr-preview-wrap" id="ma-qr-preview-wrap">
              <div class="ma-qr-preview-loading">Generando…</div>
            </div>
            <p class="ma-qr-url" title="${_esc(publicUrl)}">${_esc(publicUrl)}</p>
            <div class="ma-qr-controls" id="ma-qr-controls">
              <label class="ma-qr-control" id="ma-qr-size-control">
                <span>Tamaño</span>
                <select id="ma-qr-size">
                  <option value="500">500 px (web)</option>
                  <option value="1000" selected>1000 px (mesa)</option>
                  <option value="2000">2000 px (póster)</option>
                </select>
              </label>
              <label class="ma-qr-control">
                <span>Formato</span>
                <select id="ma-qr-format" onchange="MenuAdminModule.onQrFormatChange()">
                  <option value="png" selected>PNG</option>
                  <option value="svg">SVG</option>
                  <option value="pdf">PDF (1 grande)</option>
                  <option value="pdf-grid">PDF (9 para cortar)</option>
                </select>
              </label>
              <label class="ma-qr-control">
                <span>Estilo</span>
                <select id="ma-qr-style" onchange="MenuAdminModule.updateQrPreview()">
                  <option value="classic" selected>Clásico (negro / blanco)</option>
                  <option value="branded">Branded (dorado / oscuro)</option>
                </select>
              </label>
            </div>
          </div>
          <div class="ma-modal-footer">
            <button class="btn btn-secondary" onclick="MenuAdminModule.closeModal()">Cerrar</button>
            <button class="btn btn-primary" onclick="MenuAdminModule.downloadQr()">📥 Descargar</button>
          </div>
        </div>
      </div>
    `);
    this.updateQrPreview();
  },

  onQrFormatChange() {
    const format = document.getElementById('ma-qr-format').value;
    const sizeControl = document.getElementById('ma-qr-size-control');
    const controls = document.getElementById('ma-qr-controls');
    const isGrid = format === 'pdf-grid';
    if (sizeControl) sizeControl.style.display = isGrid ? 'none' : '';
    if (controls) controls.classList.toggle('ma-qr-controls-2col', isGrid);
  },

  async updateQrPreview() {
    const wrap = document.getElementById('ma-qr-preview-wrap');
    if (!wrap) return;
    const styleSel = document.getElementById('ma-qr-style');
    const style = styleSel ? styleSel.value : 'classic';
    const id = this.state.currentRestaurantId;
    wrap.innerHTML = '<div class="ma-qr-preview-loading">Generando…</div>';
    try {
      const res = await fetch(`/api/admin/menu/restaurants/${encodeURIComponent(id)}/qr?format=png&size=600&style=${encodeURIComponent(style)}`, {
        headers: { Authorization: `Bearer ${App.token}` }
      });
      if (!res.ok) throw new Error('preview');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (this._qrPreviewBlobUrl) URL.revokeObjectURL(this._qrPreviewBlobUrl);
      this._qrPreviewBlobUrl = blobUrl;
      wrap.innerHTML = `<img class="ma-qr-preview ma-qr-preview-${_esc(style)}" alt="QR preview" src="${blobUrl}">`;
    } catch (_) {
      wrap.innerHTML = '<div class="ma-qr-preview-error">No se pudo generar el preview</div>';
    }
  },

  async downloadQr() {
    const id = this.state.currentRestaurantId;
    const rest = this._currentRestaurant();
    if (!rest) return;
    const size = document.getElementById('ma-qr-size').value;
    const format = document.getElementById('ma-qr-format').value;
    const style = document.getElementById('ma-qr-style').value;
    const safeSlug = String(rest.slug || '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const downloadName = format === 'pdf-grid'
      ? `QR-pizzeria-popular-${safeSlug}-grid.pdf`
      : `QR-pizzeria-popular-${safeSlug}.${format}`;
    try {
      const res = await fetch(`/api/admin/menu/restaurants/${encodeURIComponent(id)}/qr?format=${encodeURIComponent(format)}&size=${encodeURIComponent(size)}&style=${encodeURIComponent(style)}`, {
        headers: { Authorization: `Bearer ${App.token}` }
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch (_) {}
        showToast('Error: ' + msg);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showToast('QR descargado');
    } catch (_) {
      showToast('Error al descargar QR');
    }
  },

  // ============ GOOGLE REVIEWS REFRESH (manual trigger) ============
  async refreshGoogleReviews(btn) {
    if (!btn || btn.disabled) return;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Actualizando…';
    try {
      const r = await fetch('/api/admin/menu/refresh-google-reviews', {
        method: 'POST',
        headers: { Authorization: `Bearer ${App.token}` },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      const updated = Array.isArray(j.updated) ? j.updated : [];
      const summary = updated.length
        ? updated.map(u => `${u.name} ${u.rating ?? '—'}⭐ (${u.reviews_count ?? 0})`).join(' · ')
        : 'sin cambios';
      const errSuffix = j.errors_count ? ` · ${j.errors_count} con error` : '';
      showToast(`✅ ${updated.length}/${j.total_restaurants || 0} actualizados${errSuffix} — ${summary}`);
      console.log('refresh-google-reviews result:', j);
    } catch (err) {
      showToast('❌ ' + (err.message || 'Error al actualizar'));
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  },

  // ============ ANALYTICS DASHBOARD ============
  _analyticsState: { range: '30d', charts: {} },

  openAnalytics() {
    const body = document.getElementById('ma-body');
    if (!body) return;
    const isAjax = this.state.isAjax;
    const rest = this._currentRestaurant();
    const title = isAjax
      ? '📊 Analytics global'
      : `📊 Analytics — ${_esc((rest && rest.name) || '')}`;
    body.innerHTML = `
      <div class="ma-an-toolbar">
        <button class="btn btn-secondary btn-sm" onclick="MenuAdminModule.loadCategories()">← Volver al menú</button>
        <h3 class="ma-an-title">${title}</h3>
        <label class="ma-an-range">
          <span>Rango</span>
          <select id="ma-an-range" onchange="MenuAdminModule.refreshAnalytics()">
            <option value="today">Hoy</option>
            <option value="7d">7 días</option>
            <option value="30d" selected>30 días</option>
            <option value="90d">90 días</option>
          </select>
        </label>
      </div>
      <div id="ma-an-content"><div class="ma-loading">Cargando analytics…</div></div>
    `;
    document.getElementById('ma-an-range').value = this._analyticsState.range;
    this.refreshAnalytics();
  },

  async refreshAnalytics() {
    const isAjax = this.state.isAjax;
    const range = document.getElementById('ma-an-range').value;
    this._analyticsState.range = range;
    this._destroyAnalyticsCharts();
    const content = document.getElementById('ma-an-content');
    if (!content) return;
    content.innerHTML = '<div class="ma-loading">Cargando analytics…</div>';

    const url = isAjax
      ? `/api/admin/menu-analytics/global?range=${encodeURIComponent(range)}`
      : `/api/admin/menu-analytics/summary?restaurant_id=${encodeURIComponent(this.state.currentRestaurantId)}&range=${encodeURIComponent(range)}`;

    let data = null;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${App.token}` } });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      data = await res.json();
    } catch (err) {
      content.innerHTML = `<div class="ma-empty">No se pudieron cargar las analytics: ${_esc(err.message)}</div>`;
      return;
    }

    if (isAjax) this._renderAnalyticsGlobal(content, data);
    else this._renderAnalyticsLocal(content, data);
  },

  _destroyAnalyticsCharts() {
    const charts = this._analyticsState.charts || {};
    Object.keys(charts).forEach(k => {
      try { charts[k].destroy(); } catch (_) {}
    });
    this._analyticsState.charts = {};
  },

  _renderAnalyticsLocal(root, d) {
    const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
    const m = d.metrics || {};

    const topItemsHtml = (d.top_items && d.top_items.length)
      ? d.top_items.map((it, i) => `
          <li class="ma-an-row">
            <span class="ma-an-rank">${i + 1}</span>
            <span class="ma-an-row-name">${_esc(it.name)}</span>
            <span class="ma-an-row-count">${fmt(it.count)}</span>
          </li>`).join('')
      : '<li class="ma-an-empty">Sin datos en este rango</li>';

    const topCatsHtml = (d.top_categories && d.top_categories.length)
      ? d.top_categories.map((it, i) => `
          <li class="ma-an-row">
            <span class="ma-an-rank">${i + 1}</span>
            <span class="ma-an-row-name">${_esc(it.name)}</span>
            <span class="ma-an-row-count">${fmt(it.count)}</span>
          </li>`).join('')
      : '<li class="ma-an-empty">Sin datos en este rango</li>';

    const topSearchesHtml = (d.top_searches && d.top_searches.length)
      ? d.top_searches.map((it, i) => `
          <li class="ma-an-row">
            <span class="ma-an-rank">${i + 1}</span>
            <span class="ma-an-row-name ma-an-mono">${_esc(it.query)}</span>
            <span class="ma-an-row-count">${fmt(it.count)}</span>
          </li>`).join('')
      : '<li class="ma-an-empty">Sin búsquedas en este rango</li>';

    const dev = d.devices || { mobile: 0, desktop: 0, mobile_percent: 0, desktop_percent: 0 };

    // Embudo de la visita (4 etapas; hover = conteo + % de caída)
    const f = d.funnel || { scan: 0, category: 0, item: 0, action: 0 };
    const fSteps = [
      { lab: 'Escanean el QR', ico: '📲', n: f.scan },
      { lab: 'Ven una categoría', ico: '📂', n: f.category },
      { lab: 'Abren un plato', ico: '🍕', n: f.item },
      { lab: 'Tocan una acción', ico: '👆', n: f.action },
    ];
    const fBase = f.scan || 1;
    const funnelHtml = fSteps.map((s, i) => {
      const pct = Math.round((s.n / fBase) * 100);
      const prev = i ? fSteps[i - 1].n : s.n;
      const drop = (i && prev) ? Math.round((1 - s.n / prev) * 100) : 0;
      return `<div class="ma-fn-step" title="${_esc(s.lab)}: ${fmt(s.n)} (${pct}% del total)">
        <span class="ma-fn-lab">${s.ico} ${s.lab}</span>
        <span class="ma-fn-track"><span class="ma-fn-bar" style="width:${Math.max(pct, 4)}%">${fmt(s.n)}</span></span>
        <span class="ma-fn-pct">${i ? (drop > 0 ? '−' + drop + '%' : '·') : '100%'}</span>
      </div>`;
    }).join('');

    // Heatmap día×hora (cada celda con tooltip nativo al pasar el mouse)
    const hm = d.heatmap || { days: [], grid: [], max: 0 };
    const hmMax = hm.max || 1;
    let heatmapHtml = '<div class="ma-hm"><div class="ma-hm-row ma-hm-head"><span class="ma-hm-daylab"></span>';
    for (let h = 0; h < 24; h++) heatmapHtml += `<span class="ma-hm-h">${h % 6 === 0 ? h : ''}</span>`;
    heatmapHtml += '</div>';
    (hm.days || []).forEach((day, di) => {
      heatmapHtml += `<div class="ma-hm-row"><span class="ma-hm-daylab">${day}</span>`;
      for (let h = 0; h < 24; h++) {
        const v = (hm.grid[di] || [])[h] || 0;
        const bg = v ? `rgba(212,168,83,${(0.12 + 0.88 * (v / hmMax)).toFixed(2)})` : 'rgba(255,255,255,0.03)';
        heatmapHtml += `<span class="ma-hm-cell" style="background:${bg}" title="${day} ${h}:00 · ${fmt(v)} visita${v === 1 ? '' : 's'}"></span>`;
      }
      heatmapHtml += '</div>';
    });
    heatmapHtml += '</div>';

    root.innerHTML = `
      <div class="ma-an-cards">
        <div class="ma-an-card"><span class="ma-an-card-label">Visitas hoy</span><span class="ma-an-card-value">${fmt(m.visits_today)}</span></div>
        <div class="ma-an-card"><span class="ma-an-card-label">Esta semana</span><span class="ma-an-card-value">${fmt(m.visits_week)}</span></div>
        <div class="ma-an-card"><span class="ma-an-card-label">Este mes</span><span class="ma-an-card-value">${fmt(m.visits_month)}</span></div>
        <div class="ma-an-card"><span class="ma-an-card-label">Únicos (30d)</span><span class="ma-an-card-value">${fmt(m.unique_visitors_month)}</span></div>
      </div>

      <section class="ma-an-section">
        <h4>Visitas por día</h4>
        <div class="ma-an-chart-wrap"><canvas id="an-chart-visits"></canvas></div>
      </section>

      <div class="ma-an-grid">
        <section class="ma-an-section">
          <h4>Top 10 platos</h4>
          <ol class="ma-an-list">${topItemsHtml}</ol>
        </section>
        <section class="ma-an-section">
          <h4>Top 5 categorías</h4>
          <ol class="ma-an-list">${topCatsHtml}</ol>
        </section>
      </div>

      <div class="ma-an-grid">
        <section class="ma-an-section">
          <h4>Idiomas</h4>
          <div class="ma-an-chart-wrap ma-an-chart-wrap-sm"><canvas id="an-chart-langs"></canvas></div>
        </section>
        <section class="ma-an-section">
          <h4>Top búsquedas</h4>
          <ol class="ma-an-list">${topSearchesHtml}</ol>
        </section>
      </div>

      <div class="ma-an-grid">
        <section class="ma-an-section">
          <h4>Embudo de la visita</h4>
          <div class="ma-fn">${funnelHtml}</div>
        </section>
        <section class="ma-an-section">
          <h4>Dispositivos</h4>
          <div class="ma-an-devices">
            <div class="ma-an-device"><span class="ma-an-device-label">📱 Mobile</span><span class="ma-an-device-bar"><span class="ma-an-device-fill" style="width:${dev.mobile_percent}%"></span></span><span class="ma-an-device-pct">${dev.mobile_percent}%</span></div>
            <div class="ma-an-device"><span class="ma-an-device-label">🖥️ Desktop</span><span class="ma-an-device-bar"><span class="ma-an-device-fill" style="width:${dev.desktop_percent}%"></span></span><span class="ma-an-device-pct">${dev.desktop_percent}%</span></div>
            <div class="ma-an-device-meta">Total dispositivos únicos: ${fmt(dev.mobile + dev.desktop)}</div>
          </div>
        </section>
      </div>

      <section class="ma-an-section">
        <h4>Cuándo te visitan <span class="ma-an-sub">· día × hora (UTC) · pasá el mouse</span></h4>
        ${heatmapHtml}
      </section>
    `;

    this._drawVisitsChart(d.visits_by_day || []);
    this._drawLangsChart(d.languages || []);
  },

  _renderAnalyticsGlobal(root, d) {
    const fmt = (n) => Number(n || 0).toLocaleString('es-ES');
    const totals = d.totals || { visits: 0, unique_visitors: 0 };
    const rows = (d.restaurants || []).map((r, i) => `
      <tr>
        <td><b>${i + 1}</b></td>
        <td>${_esc(r.name || r.slug)}</td>
        <td class="ma-an-num">${fmt(r.visits)}</td>
        <td class="ma-an-num">${fmt(r.unique_visitors)}</td>
        <td>${r.top_item ? `${_esc(r.top_item.name)} <span class="ma-an-muted">(${fmt(r.top_item.count)})</span>` : '<span class="ma-an-muted">—</span>'}</td>
      </tr>
    `).join('');

    root.innerHTML = `
      <div class="ma-an-cards">
        <div class="ma-an-card"><span class="ma-an-card-label">Visitas totales</span><span class="ma-an-card-value">${fmt(totals.visits)}</span></div>
        <div class="ma-an-card"><span class="ma-an-card-label">Visitantes únicos</span><span class="ma-an-card-value">${fmt(totals.unique_visitors)}</span></div>
        <div class="ma-an-card"><span class="ma-an-card-label">Locales activos</span><span class="ma-an-card-value">${fmt((d.restaurants || []).filter(r => r.visits > 0).length)}</span></div>
        <div class="ma-an-card"><span class="ma-an-card-label">Locales totales</span><span class="ma-an-card-value">${fmt((d.restaurants || []).length)}</span></div>
      </div>
      <section class="ma-an-section">
        <h4>Comparativa por local</h4>
        ${rows
          ? `<table class="ma-an-table">
              <thead><tr><th>#</th><th>Local</th><th class="ma-an-num">Visitas</th><th class="ma-an-num">Únicos</th><th>Plato top</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          : '<div class="ma-empty">Sin datos en este rango</div>'}
      </section>
    `;
  },

  _drawVisitsChart(series) {
    if (!window.Chart) return;
    const ctx = document.getElementById('an-chart-visits');
    if (!ctx) return;
    const gold = '#d4a853';
    this._analyticsState.charts.visits = new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.map(p => p.date.slice(5)),
        datasets: [{
          label: 'Visitas',
          data: series.map(p => p.count),
          borderColor: gold,
          backgroundColor: 'rgba(212,168,83,0.15)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 2,
          pointBackgroundColor: gold,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af', maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#9ca3af', precision: 0 }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
        },
      },
    });
  },

  _drawLangsChart(langs) {
    if (!window.Chart) return;
    const ctx = document.getElementById('an-chart-langs');
    if (!ctx) return;
    const labels = langs.map(l => (l.lang || '?').toUpperCase());
    const values = langs.map(l => l.count);
    this._analyticsState.charts.langs = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: 'rgba(212,168,83,0.7)',
          borderColor: '#d4a853',
          borderWidth: 1,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.parsed.x} (${(langs[c.dataIndex] || {}).percent}%)` } },
        },
        scales: {
          x: { ticks: { color: '#9ca3af', precision: 0 }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
          y: { ticks: { color: '#e5e5e5' }, grid: { display: false } },
        },
      },
    });
  },

  _drawHoursChart(hourly) {
    if (!window.Chart) return;
    const ctx = document.getElementById('an-chart-hours');
    if (!ctx) return;
    this._analyticsState.charts.hours = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hourly.map(h => String(h.hour).padStart(2, '0') + 'h'),
        datasets: [{
          data: hourly.map(h => h.count),
          backgroundColor: 'rgba(212,168,83,0.55)',
          borderColor: '#d4a853',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af', maxTicksLimit: 12 }, grid: { display: false } },
          y: { ticks: { color: '#9ca3af', precision: 0 }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
        },
      },
    });
  },

  _t(jsonb) {
    if (!jsonb) return '';
    if (typeof jsonb === 'string') return jsonb;
    return jsonb.es || jsonb.en || Object.values(jsonb)[0] || '';
  },
  _fmtPrice(p) { return Number(p).toFixed(2).replace('.', ',') + ' €'; },
  _slugify(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
  _showModal(html) { this.closeModal(); const w = document.createElement('div'); w.id = 'ma-modal-wrap'; w.innerHTML = html; document.body.appendChild(w); },
  closeModal() { const w = document.getElementById('ma-modal-wrap'); if (w) w.remove(); }
};

function _esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
