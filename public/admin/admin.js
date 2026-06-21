/* ============================================================
   admin.js — Panel de administración Pizzería Popular
   Pestañas: Promociones + Blog. CRUD contra /api/admin/*.
   ============================================================ */
(function () {
  'use strict';

  let sb = null;
  let promos = [];
  let posts = [];
  let editingPromoId = null;
  let editingPostId = null;

  const $ = (id) => document.getElementById(id);

  // ---- Llamada autenticada a la API ----
  async function api(path, method, body) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/admin/login/'; throw new Error('sin sesión'); }
    const res = await fetch(path, {
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      location.href = '/admin/login/';
      throw new Error('no autorizado');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Error del servidor.');
    return json;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ============================================================
  // Puente para el módulo de Menú Digital (public/admin/menu.js).
  // menu.js es un script aparte (objeto global MenuAdminModule) que consume
  // estos helpers del host. Se replica el contrato del sistema origen:
  //  · API.{get,post,put,del} NUNCA tira: devuelve null en error y avisa con
  //    toast (el módulo hace `if (!r) …`). Va sobre api() → token fresco.
  //  · App.token se mantiene sincronizado con la sesión Supabase (los fetch
  //    directos de QR/analytics del módulo lo usan). App.showAreas es no-op.
  //  · showToast: el panel no tenía → se define acá.
  // ============================================================
  let menuLoaded = false;
  function showToast(message) {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = message;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
  const API = {
    async _wrap(p) { try { return await p; } catch (e) { showToast('Error: ' + (e.message || 'servidor')); return null; } },
    get(url) { return this._wrap(api(url, 'GET')); },
    post(url, body) { return this._wrap(api(url, 'POST', body)); },
    put(url, body) { return this._wrap(api(url, 'PUT', body)); },
    del(url) { return this._wrap(api(url, 'DELETE')); },
  };
  window.API = API;
  window.showToast = showToast;
  window.App = { token: null, showAreas() {}, logout() { location.href = '/admin/login/'; } };
  window.PPAdmin = { esc, api, sb: null };

  /* ==================== PROMOCIONES ==================== */
  function renderPromos() {
    const list = $('promoList');
    if (!promos.length) {
      list.innerHTML = '<p class="empty">No hay promociones todavía. Creá la primera.</p>';
      return;
    }
    list.innerHTML = promos.map((p, i) => `
      <div class="promo-row ${p.activa ? '' : 'inactiva'}">
        <img class="promo-thumb" src="${esc(p.imagen_url || '/images/extracted/logo.png')}" alt="" />
        <div class="promo-meta">
          <h3>${esc(p.titulo)}</h3>
          <p>${esc(p.subtitulo || '')}</p>
          <div class="promo-tags">
            <span class="tag ${p.activa ? 'tag-on' : 'tag-off'}">${p.activa ? 'Activa' : 'Oculta'}</span>
            <span class="tag tag-lang">${esc((p.idioma || 'es').toUpperCase())}</span>
          </div>
        </div>
        <div class="promo-actions">
          <button data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button data-act="down" data-i="${i}" ${i === promos.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-act="toggle" data-id="${p.id}">${p.activa ? 'Ocultar' : 'Mostrar'}</button>
          <button data-act="edit" data-id="${p.id}">Editar</button>
          <button data-act="del" data-id="${p.id}" class="danger">Borrar</button>
        </div>
      </div>`).join('');
  }

  async function loadPromos() {
    promos = await api('/api/admin/promos');
    renderPromos();
  }

  function openPromoModal(promo) {
    editingPromoId = promo ? promo.id : null;
    $('modalTitle').textContent = promo ? 'Editar promo' : 'Nueva promo';
    $('modalError').textContent = '';
    const f = $('promoForm');
    f.titulo.value = promo ? (promo.titulo || '') : '';
    f.subtitulo.value = promo ? (promo.subtitulo || '') : '';
    f.descripcion.value = promo ? (promo.descripcion || '') : '';
    f.condiciones.value = promo ? (promo.condiciones || '') : '';
    f.badge.value = promo ? (promo.badge || '') : '';
    f.imagen_url.value = promo ? (promo.imagen_url || '') : '';
    f.boton_texto.value = promo ? (promo.boton_texto || 'Reservar mesa') : 'Reservar mesa';
    f.boton_accion.value = promo ? (promo.boton_accion || 'reservar') : 'reservar';
    f.idioma.value = promo ? (promo.idioma || 'es') : 'es';
    f.orden.value = promo ? (promo.orden != null ? promo.orden : 0) : (promos.length + 1);
    f.activa.checked = promo ? !!promo.activa : true;
    $('modal').hidden = false;
  }
  function closePromoModal() { $('modal').hidden = true; }

  async function savePromoModal(e) {
    e.preventDefault();
    const f = $('promoForm');
    const payload = {
      titulo: f.titulo.value.trim(),
      subtitulo: f.subtitulo.value.trim() || null,
      descripcion: f.descripcion.value.trim() || null,
      condiciones: f.condiciones.value.trim() || null,
      badge: f.badge.value.trim() || null,
      imagen_url: f.imagen_url.value.trim() || null,
      boton_texto: f.boton_texto.value.trim() || null,
      boton_accion: f.boton_accion.value,
      idioma: f.idioma.value,
      orden: parseInt(f.orden.value, 10) || 0,
      activa: f.activa.checked,
    };
    if (!payload.titulo) { $('modalError').textContent = 'El título es obligatorio.'; return; }
    $('saveBtn').disabled = true;
    try {
      if (editingPromoId) await api('/api/admin/promos/' + editingPromoId, 'PATCH', payload);
      else await api('/api/admin/promos', 'POST', payload);
      closePromoModal();
      await loadPromos();
    } catch (err) {
      $('modalError').textContent = err.message;
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  async function onPromoListClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      if (act === 'edit') {
        openPromoModal(promos.find((p) => p.id === btn.dataset.id));
      } else if (act === 'toggle') {
        const p = promos.find((x) => x.id === btn.dataset.id);
        await api('/api/admin/promos/' + p.id, 'PATCH', { activa: !p.activa });
        await loadPromos();
      } else if (act === 'del') {
        const p = promos.find((x) => x.id === btn.dataset.id);
        if (!confirm('¿Borrar la promo "' + p.titulo + '"?')) return;
        await api('/api/admin/promos/' + p.id, 'DELETE');
        await loadPromos();
      } else if (act === 'up' || act === 'down') {
        const i = parseInt(btn.dataset.i, 10);
        const j = act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= promos.length) return;
        const a = promos[i], b = promos[j];
        await api('/api/admin/promos/' + a.id, 'PATCH', { orden: b.orden });
        await api('/api/admin/promos/' + b.id, 'PATCH', { orden: a.orden });
        await loadPromos();
      }
    } catch (err) { alert(err.message); }
  }

  /* ==================== BLOG ==================== */
  function postUrl(p) {
    return (p.idioma === 'en' ? '/en/blog/' : '/blog/') + p.slug + '/';
  }

  function estadoInfo(e) {
    if (e === 'publicado') return { label: 'Publicado', cls: 'tag-on' };
    if (e === 'pendiente') return { label: 'Pendiente', cls: 'tag-pend' };
    return { label: 'En preparación', cls: 'tag-borrador' };
  }

  function renderPosts() {
    const list = $('postList');
    if (!posts.length) {
      list.innerHTML = '<p class="empty">No hay posts todavía.</p>';
      return;
    }
    list.innerHTML = posts.map((p) => {
      const pub = p.estado === 'publicado';
      const est = estadoInfo(p.estado);
      return `
      <div class="promo-row ${pub ? '' : 'inactiva'}">
        <img class="promo-thumb" src="${esc(p.hero_image || '/images/extracted/logo.png')}" alt="" />
        <div class="promo-meta">
          <h3>${esc(p.titulo)}</h3>
          <p>/${esc(p.slug)}/ · ${esc(p.fecha || '')}</p>
          <div class="promo-tags">
            <span class="tag ${est.cls}">${est.label}</span>
            <span class="tag tag-lang">${esc((p.idioma || 'es').toUpperCase())}</span>
          </div>
        </div>
        <div class="promo-actions">
          <select class="estado-select" data-id="${p.id}">
            <option value="preparacion"${p.estado === 'preparacion' ? ' selected' : ''}>En preparación</option>
            <option value="pendiente"${p.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option>
            <option value="publicado"${p.estado === 'publicado' ? ' selected' : ''}>Publicado</option>
          </select>
          <a href="${pub ? esc(postUrl(p)) : '/admin/preview/' + p.id + '/'}" target="_blank" rel="noopener">${pub ? 'Ver' : 'Previsualizar'}</a>
          <button data-act="edit" data-id="${p.id}">Editar</button>
          <button data-act="del" data-id="${p.id}" class="danger">Borrar</button>
        </div>
      </div>`;
    }).join('');
  }

  async function loadPosts() {
    posts = await api('/api/admin/posts');
    renderPosts();
  }

  function openPostModal(post) {
    editingPostId = post ? post.id : null;
    $('postModalTitle').textContent = post ? 'Editar post' : 'Nuevo post';
    $('postModalError').textContent = '';
    const f = $('postForm');
    f.titulo.value = post ? (post.titulo || '') : '';
    f.slug.value = post ? (post.slug || '') : '';
    f.idioma.value = post ? (post.idioma || 'es') : 'es';
    f.eyebrow.value = post ? (post.eyebrow || '') : 'Novedades';
    f.subtitulo.value = post ? (post.subtitulo || '') : '';
    f.fecha.value = post ? (post.fecha || '') : new Date().toISOString().slice(0, 10);
    f.estado.value = post ? (post.estado || 'preparacion') : 'preparacion';
    f.hero_image.value = post ? (post.hero_image || '') : '';
    f.meta_desc.value = post ? (post.meta_desc || '') : '';
    f.keyword.value = post ? (post.keyword || '') : '';
    f.contenido.value = post ? (post.contenido || '') : '';
    $('postModal').hidden = false;
  }
  function closePostModal() { $('postModal').hidden = true; }

  async function savePostModal(e) {
    e.preventDefault();
    const f = $('postForm');
    const payload = {
      titulo: f.titulo.value.trim(),
      slug: f.slug.value.trim().toLowerCase(),
      idioma: f.idioma.value,
      eyebrow: f.eyebrow.value.trim() || null,
      subtitulo: f.subtitulo.value.trim() || null,
      fecha: f.fecha.value || null,
      estado: f.estado.value,
      hero_image: f.hero_image.value.trim() || null,
      meta_desc: f.meta_desc.value.trim() || null,
      keyword: f.keyword.value.trim() || null,
      contenido: f.contenido.value || null,
    };
    if (!payload.titulo || !payload.slug) {
      $('postModalError').textContent = 'Título y slug son obligatorios.';
      return;
    }
    $('postSaveBtn').disabled = true;
    try {
      if (editingPostId) await api('/api/admin/posts/' + editingPostId, 'PATCH', payload);
      else await api('/api/admin/posts', 'POST', payload);
      closePostModal();
      await loadPosts();
    } catch (err) {
      $('postModalError').textContent = err.message;
    } finally {
      $('postSaveBtn').disabled = false;
    }
  }

  async function onPostListClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const p = posts.find((x) => x.id === btn.dataset.id);
    if (!p) return;
    try {
      if (act === 'edit') {
        openPostModal(p);
      } else if (act === 'del') {
        if (!confirm('¿Borrar el post "' + p.titulo + '"?')) return;
        await api('/api/admin/posts/' + p.id, 'DELETE');
        await loadPosts();
      }
    } catch (err) { alert(err.message); }
  }

  async function onPostEstadoChange(e) {
    const sel = e.target.closest('.estado-select');
    if (!sel) return;
    try {
      await api('/api/admin/posts/' + sel.dataset.id, 'PATCH', { estado: sel.value });
      await loadPosts();
    } catch (err) { alert(err.message); }
  }

  /* ==================== ASISTENTE IA ==================== */
  let assistantHistory = [];

  function asAddMsg(text, cls) {
    const log = $('assistantLog');
    const div = document.createElement('div');
    div.className = 'as-msg ' + cls;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function describeAction(item) {
    const d = item.datos || {};
    const titById = (id) => {
      const p = promos.find((x) => x.id === id);
      return p ? '«' + p.titulo + '»' : 'id ' + id;
    };
    if (item.accion === 'crear_promo') return 'Crear promo «' + (d.titulo || '?') + '»';
    if (item.accion === 'editar_promo') {
      const campos = Object.keys(d).filter((k) => k !== 'id').join(', ') || 'sin cambios';
      return 'Editar ' + titById(d.id) + ' — ' + campos;
    }
    if (item.accion === 'borrar_promo') return 'Borrar ' + titById(d.id);
    if (item.accion === 'reordenar_promos') return 'Reordenar las promociones';
    return item.accion;
  }

  async function asApply(plan) {
    try {
      const res = await api('/api/admin/assistant/apply', 'POST', { plan });
      asAddMsg('✓ ' + (res.results || []).join('  ·  '), 'as-bot');
      assistantHistory.push({ role: 'assistant', content: '(cambios aplicados)' });
      await loadPromos();
    } catch (err) {
      asAddMsg('Error al aplicar: ' + err.message, 'as-bot');
    }
  }

  function renderPlan(plan) {
    const log = $('assistantLog');
    const box = document.createElement('div');
    box.className = 'as-plan';
    box.innerHTML = '<p class="as-plan-title">Voy a hacer esto:</p><ul>' +
      plan.map((it) => '<li>' + esc(describeAction(it)) + '</li>').join('') + '</ul>';
    const actions = document.createElement('div');
    actions.className = 'as-plan-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.className = 'as-confirm';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    confirmBtn.addEventListener('click', () => { actions.remove(); asApply(plan); });
    cancelBtn.addEventListener('click', () => {
      actions.remove();
      asAddMsg('Cambios cancelados.', 'as-bot');
    });
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    box.appendChild(actions);
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
  }

  async function onAssistantSubmit(e) {
    e.preventDefault();
    const input = $('assistantInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    asAddMsg(text, 'as-user');
    $('assistantSend').disabled = true;
    const thinking = asAddMsg('Pensando…', 'as-bot as-thinking');
    try {
      const res = await api('/api/admin/assistant', 'POST', {
        message: text, history: assistantHistory,
      });
      thinking.remove();
      assistantHistory.push({ role: 'user', content: text });
      if (res.reply) {
        asAddMsg(res.reply, 'as-bot');
        assistantHistory.push({ role: 'assistant', content: res.reply });
      }
      if (res.plan && res.plan.length) {
        renderPlan(res.plan);
      } else if (!res.reply) {
        asAddMsg('No entendí qué cambio hacer. Probá reformularlo.', 'as-bot');
      }
    } catch (err) {
      thinking.remove();
      asAddMsg('Error: ' + err.message, 'as-bot');
    } finally {
      $('assistantSend').disabled = false;
    }
  }

  /* ==================== ASISTENTE DE BLOG ==================== */
  let blogAsHistory = [];
  let blogPhotos = []; // { url, loading, error, name }

  function blogAsAddMsg(text, cls) {
    const log = $('blogAsLog');
    const div = document.createElement('div');
    div.className = 'as-msg ' + cls;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  // Redimensiona una imagen en el navegador antes de subirla.
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 2000;
          let w = img.width, h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderBlogPhotos() {
    $('blogAsPhotos').innerHTML = blogPhotos.map((p, i) =>
      '<div class="as-photo">' +
      (p.loading ? '<span class="as-photo-state">…</span>'
        : p.error ? '<span class="as-photo-state">✗</span>'
          : '<img src="' + esc(p.url) + '" alt="" />') +
      '<button type="button" data-i="' + i + '" aria-label="Quitar">✕</button></div>'
    ).join('');
  }

  async function onBlogFiles(e) {
    const files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      const ph = { url: null, loading: true, error: false, name: file.name };
      blogPhotos.push(ph);
      renderBlogPhotos();
      try {
        const dataUrl = await resizeImage(file);
        const res = await api('/api/admin/upload', 'POST', { filename: file.name, dataUrl });
        ph.url = res.url; ph.loading = false;
      } catch (err) {
        ph.error = true; ph.loading = false;
      }
      renderBlogPhotos();
    }
  }

  function onBlogPhotoRemove(e) {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    blogPhotos.splice(parseInt(btn.dataset.i, 10), 1);
    renderBlogPhotos();
  }

  function describeBlogAction(item) {
    const d = item.datos || {};
    if (item.accion === 'redactar_post') {
      return 'Crear post «' + (d.titulo || '?') + '» (' + (d.idioma || '?') + ')';
    }
    if (item.accion === 'editar_post') {
      const p = posts.find((x) => x.id === d.id);
      return 'Editar post ' + (p ? '«' + p.titulo + '»' : 'id ' + d.id);
    }
    if (item.accion === 'borrar_post') {
      const p = posts.find((x) => x.id === d.id);
      return 'Borrar post ' + (p ? '«' + p.titulo + '»' : 'id ' + d.id);
    }
    return item.accion;
  }

  async function blogAsApply(plan) {
    try {
      const res = await api('/api/admin/blog-assistant/apply', 'POST', { plan });
      blogAsAddMsg('✓ ' + (res.results || []).join('  ·  '), 'as-bot');
      blogAsAddMsg('Listo. Los posts quedaron "en preparación" — revisalos en la lista de abajo y cuando estén OK pasalos a "Pendiente".', 'as-bot');
      blogAsHistory.push({ role: 'assistant', content: '(posts creados)' });
      blogPhotos = [];
      renderBlogPhotos();
      await loadPosts();
    } catch (err) {
      blogAsAddMsg('Error al aplicar: ' + err.message, 'as-bot');
    }
  }

  function renderBlogPlan(plan) {
    const log = $('blogAsLog');
    const box = document.createElement('div');
    box.className = 'as-plan';
    box.innerHTML = '<p class="as-plan-title">Voy a crear esto:</p><ul>' +
      plan.map((it) => '<li>' + esc(describeBlogAction(it)) + '</li>').join('') + '</ul>';
    const actions = document.createElement('div');
    actions.className = 'as-plan-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirmar';
    confirmBtn.className = 'as-confirm';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancelar';
    confirmBtn.addEventListener('click', () => { actions.remove(); blogAsApply(plan); });
    cancelBtn.addEventListener('click', () => {
      actions.remove();
      blogAsAddMsg('Cancelado.', 'as-bot');
    });
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    box.appendChild(actions);
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
  }

  async function onBlogAsSubmit(e) {
    e.preventDefault();
    const input = $('blogAsInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    blogAsAddMsg(text, 'as-user');
    $('blogAsSend').disabled = true;
    const thinking = blogAsAddMsg('Generando el post… (puede tardar ~30 s)', 'as-bot as-thinking');
    const photos = blogPhotos.filter((p) => p.url).map((p) => ({ url: p.url }));
    try {
      const res = await api('/api/admin/blog-assistant', 'POST', {
        message: text, history: blogAsHistory, photos,
      });
      thinking.remove();
      blogAsHistory.push({ role: 'user', content: text });
      if (res.reply) {
        blogAsAddMsg(res.reply, 'as-bot');
        blogAsHistory.push({ role: 'assistant', content: res.reply });
      }
      if (res.plan && res.plan.length) renderBlogPlan(res.plan);
      else if (!res.reply) blogAsAddMsg('No pude generar el post. Probá reformular el pedido.', 'as-bot');
    } catch (err) {
      thinking.remove();
      blogAsAddMsg('Error: ' + err.message, 'as-bot');
    } finally {
      $('blogAsSend').disabled = false;
    }
  }

  /* ==================== SELECTOR DE GOOGLE DRIVE ==================== */
  let driveStack = [];   // [{id, name}] — navegación de carpetas
  let driveSel = {};     // { fileId: nombre } imágenes marcadas
  let drivePickCb = null; // callback opcional: quien abre el modal recibe las URLs

  function openDriveModal() {
    driveStack = [{ id: '', name: 'Inicio' }];
    driveSel = {};
    $('driveError').textContent = '';
    $('driveModal').hidden = false;
    loadDriveFolder();
  }
  function closeDriveModal() { $('driveModal').hidden = true; }

  async function loadDriveFolder() {
    const cur = driveStack[driveStack.length - 1];
    $('drivePath').textContent = driveStack.map((f) => f.name).join('  /  ');
    $('driveBack').disabled = driveStack.length <= 1;
    $('driveBrowser').innerHTML = '<p class="drive-loading">Cargando…</p>';
    try {
      const q = cur.id ? '?folder=' + encodeURIComponent(cur.id) : '';
      const data = await api('/api/admin/drive/list' + q);
      let html = '';
      for (const f of data.folders) {
        html += '<div class="drive-item drive-folder" data-folder="' + esc(f.id) +
          '" data-name="' + esc(f.name) + '">📁 ' + esc(f.name) + '</div>';
      }
      for (const img of data.images) {
        html += '<label class="drive-item drive-img"><input type="checkbox" data-id="' +
          esc(img.id) + '"' + (driveSel[img.id] ? ' checked' : '') + ' /> 🖼️ ' +
          esc(img.name) + '</label>';
      }
      $('driveBrowser').innerHTML = html ||
        '<p class="drive-loading">Esta carpeta está vacía.</p>';
    } catch (err) {
      $('driveBrowser').innerHTML = '<p class="drive-loading">' + esc(err.message) + '</p>';
    }
  }

  function onDriveClick(e) {
    const folder = e.target.closest('.drive-folder');
    if (folder) {
      driveStack.push({ id: folder.dataset.folder, name: folder.dataset.name });
      loadDriveFolder();
    }
  }
  function onDriveChange(e) {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    if (cb.checked) driveSel[cb.dataset.id] = true;
    else delete driveSel[cb.dataset.id];
  }
  function driveBack() {
    if (driveStack.length > 1) { driveStack.pop(); loadDriveFolder(); }
  }

  async function driveImport() {
    const ids = Object.keys(driveSel);
    if (!ids.length) { $('driveError').textContent = 'Marcá al menos una imagen.'; return; }
    $('driveImportBtn').disabled = true;
    $('driveError').textContent = 'Importando ' + ids.length + ' imagen(es)…';
    try {
      const res = await api('/api/admin/drive/import', 'POST', { ids });
      if (drivePickCb) {
        // Otro módulo (ej. Generador) pidió las fotos: se las paso a él.
        const cb = drivePickCb; drivePickCb = null;
        cb(res.urls || []);
        closeDriveModal();
        return;
      }
      for (const url of res.urls || []) {
        blogPhotos.push({ url: url, loading: false, error: false });
      }
      renderBlogPhotos();
      closeDriveModal();
      blogAsAddMsg('Importé ' + (res.urls || []).length +
        ' foto(s) de Google Drive. Ya las puedo usar en el post.', 'as-bot');
    } catch (err) {
      $('driveError').textContent = err.message;
    } finally {
      $('driveImportBtn').disabled = false;
    }
  }

  /* ==================== CALENDARIO ==================== */
  let calRef = new Date();
  calRef.setDate(1);

  function renderCalendar() {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const year = calRef.getFullYear();
    const month = calRef.getMonth();
    $('calMonth').textContent = meses[month] + ' ' + year;
    const startDow = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
    const days = new Date(year, month + 1, 0).getDate();
    const dows = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let html = dows.map((d) => '<div class="cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < startDow; i++) html += '<div class="cal-cell cal-empty"></div>';
    for (let day = 1; day <= days; day++) {
      const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const dayPosts = posts.filter((p) => (p.fecha || '').slice(0, 10) === ds);
      html += '<div class="cal-cell"><span class="cal-day">' + day + '</span>' +
        dayPosts.map((p) => {
          const cls = p.estado === 'publicado' ? 'dot-pub'
            : p.estado === 'pendiente' ? 'dot-pend' : 'dot-prep';
          return '<div class="cal-post ' + cls + '" title="' + esc(p.titulo) + '">' +
            esc(p.titulo) + (p.local ? ' · ' + esc(p.local) : '') +
            ' <span class="cal-lang">' + esc((p.idioma || '').toUpperCase()) + '</span></div>';
        }).join('') + '</div>';
    }
    $('calendar').innerHTML = html;
  }

  /* ==================== PEPE — ESTADÍSTICAS DEL CHAT ==================== */
  let pepeLoaded = false;
  let lastPepeRecos = []; // recomendaciones para Pepe del último análisis
  let pepeKb = [];        // base de conocimiento cargada (para editar en línea)

  function renderPepeChart(porDia) {
    const max = Math.max(1, ...porDia.map((d) => d.count));
    $('pepeChart').innerHTML = porDia.map((d) =>
      '<div class="chart-col" title="' + esc(d.fecha) + ': ' + d.count + ' consultas">' +
        '<span class="chart-num">' + d.count + '</span>' +
        '<div class="chart-track"><div class="chart-bar" style="height:' +
          Math.round((d.count / max) * 100) + '%"></div></div>' +
        '<span class="chart-lbl">' + esc(d.label) + '</span>' +
      '</div>').join('');
  }

  function renderPepeRepeated(list) {
    if (!list || !list.length) {
      $('pepeRepeated').innerHTML = '<p class="empty">Todavía no hay consultas repetidas.</p>';
      return;
    }
    $('pepeRepeated').innerHTML = list.map((r) =>
      '<div class="pepe-q"><span class="pepe-q-count">' + r.count + '×</span>' +
      '<span class="pepe-q-text">' + esc(r.texto) + '</span></div>').join('');
  }

  function renderPepeRecent(list) {
    if (!list || !list.length) {
      $('pepeRecent').innerHTML = '<p class="empty">Todavía no hay consultas.</p>';
      return;
    }
    $('pepeRecent').innerHTML = list.map((c) => {
      const turnos = c.turnos.map((t) =>
        '<div class="pepe-msg">' +
          '<p class="pepe-msg-u">' + esc(t.user_msg) + '</p>' +
          (t.bot_reply ? '<p class="pepe-msg-b">' + esc(t.bot_reply) + '</p>' : '') +
        '</div>').join('');
      const n = c.turnos.length;
      const fecha = new Date(c.fin).toLocaleString('es-ES',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return '<div class="pepe-conv">' +
        '<div class="pepe-conv-head">' +
          '<span class="pepe-conv-meta">' + esc(fecha) + '</span>' +
          '<span class="pepe-conv-count">' + n + (n === 1 ? ' mensaje' : ' mensajes') + '</span>' +
        '</div>' + turnos +
      '</div>';
    }).join('');
  }

  function renderPepeInsight(ins) {
    const box = $('pepeInsight');
    if (!ins) {
      box.innerHTML = '<p class="empty">Todavía no hay análisis. Tocá «Analizar con IA» para generar recomendaciones.</p>';
      return;
    }
    if (ins.vacio) {
      box.innerHTML = '<p class="empty">Cuando la gente empiece a usar el chat, acá vas a ver el análisis y las recomendaciones.</p>';
      return;
    }
    let html = '';
    if (ins.generatedAt) {
      html += '<p class="pepe-when">Generado el ' +
        new Date(ins.generatedAt).toLocaleString('es-ES') + '</p>';
    }
    if (ins.resumen) html += '<p class="pepe-resumen">' + esc(ins.resumen) + '</p>';
    if (ins.temas && ins.temas.length) {
      const max = Math.max(1, ...ins.temas.map((t) => t.cantidad || 0));
      html += '<h3>Temas más consultados</h3><div class="pepe-temas">' +
        ins.temas.map((t) =>
          '<div class="pepe-tema">' +
            '<div class="pepe-tema-top"><span>' + esc(t.tema) + '</span>' +
            '<span class="pepe-tema-n">' + (t.cantidad || 0) + '</span></div>' +
            '<div class="pepe-tema-track"><div class="pepe-tema-bar" style="width:' +
              Math.round(((t.cantidad || 0) / max) * 100) + '%"></div></div>' +
            (t.ejemplo ? '<p class="pepe-tema-ej">Ej: ' + esc(t.ejemplo) + '</p>' : '') +
          '</div>').join('') +
        '</div>';
    }
    const webRecos = ins.recomendaciones_web || ins.recomendaciones || [];
    if (webRecos.length) {
      html += '<h3>🌐 Recomendaciones para la web</h3><ul class="pepe-recos">' +
        webRecos.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>';
    }
    lastPepeRecos = ins.recomendaciones_pepe || [];
    if (lastPepeRecos.length) {
      html += '<h3>🧠 Recomendaciones para Pepe</h3><ul class="pepe-recos pepe-recos-pepe">' +
        lastPepeRecos.map((r, i) =>
          '<li><span>' + esc(r) + '</span>' +
          '<button class="pepe-teach" data-teach="' + i + '">➕ Enseñar a Pepe</button></li>'
        ).join('') + '</ul>';
    }
    box.innerHTML = html || '<p class="empty">El análisis no devolvió datos.</p>';
  }

  async function loadPepeStats() {
    try {
      const d = await api('/api/admin/chat/stats');
      $('stPersonas').textContent = d.personas || 0;
      $('stPersonasHoy').textContent = d.personasHoy || 0;
      $('stPersonas7').textContent = d.personas7 || 0;
      $('stMensajes').textContent = d.total || 0;
      renderPepeChart(d.porDia || []);
      renderPepeRepeated(d.recurrentes);
      renderPepeRecent(d.conversaciones);
      renderPepeInsight(d.insight);
      $('pepeLoading').hidden = true;
      $('pepeContent').hidden = false;
      pepeLoaded = true;
      loadPepeKnowledge();
    } catch (err) {
      $('pepeLoading').textContent = 'Error al cargar: ' + err.message;
    }
  }

  /* ==================== CEREBRO DE PEPE (base de conocimiento) ==================== */
  function renderPepeKnowledge(list) {
    pepeKb = list || [];
    const box = $('pepeKbList');
    if (!pepeKb.length) {
      box.innerHTML = '<p class="empty">Pepe todavía no tiene conocimiento extra. Agregá el primero arriba.</p>';
      return;
    }
    box.innerHTML = pepeKb.map((k) =>
      '<div class="pepe-kb-item' + (k.activo ? '' : ' off') + '" data-id="' + k.id + '">' +
        '<span class="pepe-kb-text">' + esc(k.contenido) + '</span>' +
        (k.origen === 'ia' ? '<span class="tag tag-lang">IA</span>' : '') +
        '<div class="pepe-kb-actions">' +
          '<button data-act="toggle" data-id="' + k.id + '">' + (k.activo ? 'Activo' : 'Inactivo') + '</button>' +
          '<button data-act="edit" data-id="' + k.id + '">Editar</button>' +
          '<button data-act="del" data-id="' + k.id + '" class="danger">Borrar</button>' +
        '</div>' +
      '</div>').join('');
  }

  async function loadPepeKnowledge() {
    try {
      renderPepeKnowledge(await api('/api/admin/pepe/knowledge'));
    } catch (err) {
      $('pepeKbList').innerHTML = '<p class="empty">Error al cargar el conocimiento: ' + esc(err.message) + '</p>';
    }
  }

  async function onPepeKbSubmit(e) {
    e.preventDefault();
    const input = $('pepeKbInput');
    const text = input.value.trim();
    if (!text) return;
    $('pepeKbAdd').disabled = true;
    try {
      await api('/api/admin/pepe/knowledge', 'POST', { contenido: text });
      input.value = '';
      await loadPepeKnowledge();
    } catch (err) { alert(err.message); }
    finally { $('pepeKbAdd').disabled = false; }
  }

  async function onPepeKbClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const item = btn.closest('.pepe-kb-item');
    const id = btn.dataset.id || (item && item.dataset.id);
    try {
      if (act === 'toggle') {
        const activo = btn.textContent.trim() === 'Activo';
        await api('/api/admin/pepe/knowledge/' + id, 'PATCH', { activo: !activo });
        await loadPepeKnowledge();
      } else if (act === 'del') {
        if (!confirm('¿Borrar este conocimiento de Pepe?')) return;
        await api('/api/admin/pepe/knowledge/' + id, 'DELETE');
        await loadPepeKnowledge();
      } else if (act === 'edit') {
        const k = pepeKb.find((x) => String(x.id) === String(id));
        item.innerHTML =
          '<input class="pepe-kb-edit" type="text" />' +
          '<div class="pepe-kb-actions">' +
            '<button data-act="save" data-id="' + id + '" class="kb-save">Guardar</button>' +
            '<button data-act="cancel">Cancelar</button>' +
          '</div>';
        const inp = item.querySelector('.pepe-kb-edit');
        inp.value = k ? k.contenido : '';
        inp.focus();
      } else if (act === 'cancel') {
        renderPepeKnowledge(pepeKb);
      } else if (act === 'save') {
        const text = item.querySelector('.pepe-kb-edit').value.trim();
        if (!text) return;
        await api('/api/admin/pepe/knowledge/' + id, 'PATCH', { contenido: text });
        await loadPepeKnowledge();
      }
    } catch (err) { alert(err.message); }
  }

  // Carga una recomendación de la IA directo al cerebro de Pepe.
  async function teachPepe(text, btn) {
    if (!text) return;
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Agregando…';
    try {
      await api('/api/admin/pepe/knowledge', 'POST', { contenido: text, origen: 'ia' });
      btn.textContent = '✓ Enseñado';
      if ($('pepeKbList')) await loadPepeKnowledge();
    } catch (err) {
      btn.textContent = orig; btn.disabled = false; alert(err.message);
    }
  }

  async function onPepeAnalyze() {
    const btn = $('pepeAnalyzeBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Analizando… (~20 s)';
    try {
      const ins = await api('/api/admin/chat/analyze', 'POST', {});
      renderPepeInsight(ins);
    } catch (err) {
      alert('Error al analizar: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  /* ==================== INTELIGENCIA ==================== */
  let intelLoaded = false;
  let intelInformes = [];

  function fmtDelta(n) {
    if (n == null) return '';
    if (n > 0) return ' <span class="delta delta-up">+' + n + '</span>';
    if (n < 0) return ' <span class="delta delta-down">' + n + '</span>';
    return ' <span class="delta">=</span>';
  }

  function renderIntelOverview(d) {
    $('inRating').textContent = d.ratings ? d.ratings.promedio + ' ★' : '—';
    $('inReviews').textContent = d.ratings ? d.ratings.total : '—';
    $('inPersonas7').textContent = d.pepe ? d.pepe.personas7 : '—';
    $('inPosts').textContent = d.blog ? d.blog.publicados : '—';
    if (d.ratings && d.ratings.updatedAt) {
      $('inUpdated').textContent = 'Google · actualizado el ' +
        new Date(d.ratings.updatedAt).toLocaleDateString('es-ES') + ' (se refresca solo los domingos)';
    }

    // Reseñas por local, con variación vs el último informe guardado.
    const prevPorLocal = (d.ultimoInforme && d.ultimoInforme.data &&
      d.ultimoInforme.data.metricas && d.ultimoInforme.data.metricas.reviewsPorLocal) || null;
    const locs = d.ratings ? d.ratings.locales : [];
    $('intelLocals').innerHTML = locs.length ? locs.map((l) => {
      const delta = prevPorLocal && prevPorLocal[l.slug] != null ? l.reviews - prevPorLocal[l.slug] : null;
      return '<div class="intel-local">' +
        '<span class="intel-local-name">' + esc(l.name) + ' <small>' + esc(l.city) + '</small></span>' +
        '<span class="intel-local-rating">' + l.rating + ' ★</span>' +
        '<span class="intel-local-reviews">' + l.reviews + ' reseñas' +
          (delta != null ? fmtDelta(delta) : '') + '</span>' +
        '</div>';
    }).join('') : '<p class="empty">Sin datos de Google todavía.</p>';

    // Contenido en marcha
    const b = d.blog || {};
    let cont = '<p class="intel-line">' + (b.publicados || 0) + ' publicados · ' +
      (b.pendientes || 0) + ' pendientes · ' + (b.preparacion || 0) + ' en preparación</p>';
    if (b.proximos && b.proximos.length) {
      cont += '<ul class="pepe-recos">' + b.proximos.map((p) =>
        '<li>' + esc(p.titulo) + ' <small>(' + esc(p.idioma) +
        (p.fecha ? ' · sale ' + esc(p.fecha) : '') + ')</small></li>').join('') + '</ul>';
    }
    $('intelContenido').innerHTML = cont;

    $('intelPromos').innerHTML = (d.promosActivas && d.promosActivas.length)
      ? '<ul class="pepe-recos">' + d.promosActivas.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      : '<p class="empty">No hay promos activas.</p>';
  }

  function renderInforme(row) {
    const box = $('intelInforme');
    if (!row) {
      box.innerHTML = '<p class="empty">Todavía no hay informes. Tocá «Generar informe ahora» para crear el primero; después salen solos cada lunes.</p>';
      return;
    }
    const inf = (row.data && row.data.informe) || {};
    let html = '<p class="pepe-when">Generado el ' +
      new Date(row.created_at).toLocaleString('es-ES') +
      (row.enviado ? ' · enviado por mail ✓' : '') + '</p>';
    if (inf.resumen) html += '<p class="pepe-resumen">' + esc(inf.resumen) + '</p>';
    const sec = (t, arr) => (arr && arr.length)
      ? '<h3>' + t + '</h3><ul class="pepe-recos">' +
        arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>'
      : '';
    html += sec('⭐ Reputación', inf.reputacion);
    html += sec('💬 Audiencia (Pepe)', inf.audiencia);
    html += sec('📝 Contenido', inf.contenido);
    html += sec('✅ Acciones para esta semana', inf.acciones);
    box.innerHTML = html;
  }

  function renderIntelHist(activeId) {
    const box = $('intelHist');
    box.innerHTML = intelInformes.length < 2 ? '' : intelInformes.map((r) =>
      '<button class="intel-chip' + (String(r.id) === String(activeId) ? ' active' : '') +
      '" data-id="' + r.id + '">' +
      new Date(r.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) +
      '</button>').join('');
  }

  async function loadIntel() {
    try {
      const d = await api('/api/admin/intel/overview');
      renderIntelOverview(d);
      try { intelInformes = await api('/api/admin/intel/informes'); }
      catch (e) { intelInformes = []; }
      const first = intelInformes[0] || null;
      renderIntelHist(first ? first.id : null);
      renderInforme(first);
      $('intelLoading').hidden = true;
      $('intelContent').hidden = false;
      intelLoaded = true;
    } catch (err) {
      $('intelLoading').textContent = 'Error al cargar: ' + err.message;
    }
  }

  async function onIntelGenerate() {
    const btn = $('intelGenBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generando… (~30 s)';
    try {
      const row = await api('/api/admin/intel/informes', 'POST', {});
      intelInformes.unshift(row);
      renderIntelHist(row.id);
      renderInforme(row);
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  /* ==================== ANALÍTICA (web + Instagram) ==================== */
  let anLoaded = false;
  let anMes = null; // 'YYYY-MM' — null = mes actual

  function anMesActual() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function fmtNum(n) {
    return (n == null) ? '–' : Number(n).toLocaleString('es-ES');
  }
  function anMesLabel(mes) {
    const [y, m] = mes.split('-').map(Number);
    const txt = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }
  // Rango ISO (desde/hasta) de un mes 'YYYY-MM' para los endpoints de la carta.
  function anMesRango(mes) {
    const [y, m] = mes.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    return { from: mes + '-01T00:00:00', to: mes + '-' + String(ultimo).padStart(2, '0') + 'T23:59:59' };
  }

  // Bloque "Carta · Menú Digital" en la sección Analítica (mensual, todos los locales).
  function renderAnCarta(d) {
    const tot = (d && d.totals) ? d.totals : { visits: 0, unique_visitors: 0 };
    const locs = (d && d.restaurants) ? d.restaurants : [];
    const activos = locs.filter((l) => l.visits > 0);
    $('anCartaVisitas').textContent = fmtNum(tot.visits);
    $('anCartaUnicos').textContent = fmtNum(tot.unique_visitors);
    $('anCartaNlocales').textContent = fmtNum(activos.length);
    $('anCartaTop').textContent = activos.length ? activos[0].name : '–';
    if (!activos.length) {
      $('anCartaList').innerHTML = '<p class="empty">Sin aperturas de la carta este mes.</p>';
      return;
    }
    const max = Math.max(1, ...activos.map((l) => l.visits));
    $('anCartaList').innerHTML = activos.map((l) => {
      const plato = l.top_item ? (' · 🍕 ' + esc(l.top_item.name)) : '';
      return '<div class="an-local">' +
        '<span class="an-local-name">' + esc(l.name) + '</span>' +
        '<div class="an-local-track"><div class="an-local-fill" style="width:' +
          Math.round((l.visits / max) * 100) + '%"></div></div>' +
        '<span class="an-local-val">' + fmtNum(l.visits) + ' aperturas' + plato + '</span>' +
      '</div>';
    }).join('');
  }

  // Gráfico de barras genérico (reutiliza el estilo del chart de Pepe).
  function renderBars(elId, items, valueKey) {
    if (!items.length) { $(elId).innerHTML = '<p class="empty">Sin datos este mes.</p>'; return; }
    const max = Math.max(1, ...items.map((d) => d[valueKey] || 0));
    $(elId).innerHTML = items.map((d) => {
      const v = d[valueKey] || 0;
      return '<div class="chart-col" title="' + esc(d.label) + ': ' + v + '">' +
        '<span class="chart-num">' + v + '</span>' +
        '<div class="chart-track"><div class="chart-bar" style="height:' +
          Math.round((v / max) * 100) + '%"></div></div>' +
        '<span class="chart-lbl">' + esc(d.label) + '</span>' +
      '</div>';
    }).join('');
  }

  function setDelta(id, actual, previo) {
    const el = $(id);
    if (previo == null || previo === 0) { el.textContent = ''; el.className = 'an-delta'; return; }
    const pct = Math.round(((actual - previo) / previo) * 100);
    el.textContent = (pct >= 0 ? '+' : '') + pct + '% vs mes anterior';
    el.className = 'an-delta' + (pct > 0 ? ' up' : pct < 0 ? ' down' : '');
  }

  function renderListaConteo(elId, items, vacio) {
    $(elId).innerHTML = (items && items.length)
      ? items.map((x) => '<div class="pepe-q"><span class="pepe-q-count">' + x.count + '</span>' +
          '<span class="pepe-q-text">' + esc(x.nombre) + '</span></div>').join('')
      : '<p class="empty">' + vacio + '</p>';
  }

  function renderAnWeb(d) {
    $('anWebVisitas').textContent = fmtNum(d.visitas);
    $('anWebVisitantes').textContent = fmtNum(d.visitantes);
    $('anWebForm').textContent = fmtNum(d.formulario);
    $('anWebWa').textContent = fmtNum(d.whatsapp);
    $('anWebReserva').textContent = fmtNum(d.reserva);
    $('anWebIg').textContent = fmtNum(d.instagram);
    const prev = d.previo || {};
    setDelta('anWebVisitasDelta', d.visitas, prev.visitas);
    setDelta('anWebVisitantesDelta', d.visitantes, prev.visitantes);

    // Tasa de conversión.
    $('anWebConv').innerHTML = '<span class="an-conv-num">' + (d.conversion != null ? d.conversion : 0) + '%</span>' +
      '<span class="an-conv-txt">de los visitantes hizo una acción ' +
      '(reservar, WhatsApp o formulario) · ' + fmtNum(d.conversionAcciones || 0) + ' personas</span>';

    // Interés por local (WhatsApp + reservas).
    const locs = d.locales || [];
    if (!locs.length) {
      $('anWebLocales').innerHTML = '<p class="empty">Todavía no hay clicks por local (se mide desde ahora).</p>';
    } else {
      const maxL = Math.max(1, ...locs.map((l) => l.total));
      $('anWebLocales').innerHTML = locs.map((l) =>
        '<div class="an-local">' +
          '<span class="an-local-name">' + esc(l.local) + '</span>' +
          '<div class="an-local-track"><div class="an-local-fill" style="width:' +
            Math.round((l.total / maxL) * 100) + '%"></div></div>' +
          '<span class="an-local-val">💬 ' + fmtNum(l.whatsapp) + ' · 🗓 ' + fmtNum(l.reserva) + '</span>' +
        '</div>').join('');
    }

    renderBars('anWebChart', d.porDia || [], 'count');
    renderBars('anWebHoras', (d.porHora || []).map((h) => ({
      label: String(h.hora).padStart(2, '0'), count: h.count,
    })), 'count');
    renderListaConteo('anWebPaginas', d.paginas, 'Sin datos este mes.');
    renderListaConteo('anWebFuentes', d.fuentes, 'Todavía no hay visitas este mes.');

    renderShareBar('anWebDispositivos', (d.dispositivos || {}).movil, (d.dispositivos || {}).escritorio,
      '📱 Móvil', '🖥 Escritorio');
    renderShareBar('anWebIdioma', (d.idioma || {}).es, (d.idioma || {}).en,
      '🇪🇸 Español', '🇬🇧 Inglés');
  }

  // Barra de proporción A vs B (móvil/escritorio, ES/EN).
  function renderShareBar(elId, a, b, labelA, labelB) {
    a = a || 0; b = b || 0;
    const tot = a + b;
    if (!tot) { $(elId).innerHTML = '<p class="empty">Se empieza a medir desde ahora.</p>'; return; }
    const pa = Math.round((a / tot) * 100);
    $(elId).innerHTML =
      '<div class="an-dev-bar"><div class="an-dev-movil" style="width:' + pa + '%"></div></div>' +
      '<div class="an-dev-legend"><span>' + labelA + ' ' + pa + '%</span>' +
      '<span>' + labelB + ' ' + (100 - pa) + '%</span></div>';
  }

  function renderAnIgTop(d) {
    const media = (d && d.media) || [];
    if (!media.length) {
      $('anIgTop').innerHTML = '<p class="empty">Sin publicaciones este mes.</p>';
      return;
    }
    $('anIgTop').innerHTML = media.map((p) => {
      const met = ['❤️ ' + fmtNum(p.likes)];
      if (p.comentarios) met.push('💬 ' + fmtNum(p.comentarios));
      if (p.alcance != null) met.push('👁 ' + fmtNum(p.alcance));
      if (p.guardados != null) met.push('🔖 ' + fmtNum(p.guardados));
      return '<a class="an-media" href="' + esc(p.permalink) + '" target="_blank" rel="noopener">' +
        '<div class="an-media-thumb"' + (p.img ? ' style="background-image:url(\'' + esc(p.img) + '\')"' : '') + '>' +
          (p.tipo === 'VIDEO' ? '<span class="an-media-play">▶</span>' : '') + '</div>' +
        '<p class="an-media-cap">' + esc(p.caption || '(sin texto)') + '</p>' +
        '<p class="an-media-met">' + met.join(' · ') + '</p>' +
      '</a>';
    }).join('');
  }

  function renderAnIg(d) {
    const noConf = !d || !d.configurado;
    $('anIgNotice').hidden = !noConf;
    $('anIgCards').style.opacity = noConf ? '.45' : '1';
    $('anIgChartWrap').hidden = noConf;
    $('anIgTopWrap').hidden = noConf;
    $('anIgRefresh').hidden = noConf;
    if (noConf) {
      $('anIgState').textContent = '— no conectado';
      $('anIgNotice').innerHTML = 'Instagram todavía no está conectado. Para ver seguidores, ' +
        'alcance, interacciones y guardados hay que cargar el token de la Graph API de Meta ' +
        '(<code>IG_USER_ID</code> e <code>IG_TOKEN</code>) en el servidor.';
      ['anIgFollowers', 'anIgReach', 'anIgInter', 'anIgSaves'].forEach((id) => $(id).textContent = '–');
      $('anIgDelta').textContent = '';
      return;
    }
    $('anIgState').textContent = '';
    $('anIgFollowers').textContent = fmtNum(d.seguidores);
    $('anIgReach').textContent = fmtNum(d.alcance);
    $('anIgInter').textContent = fmtNum(d.interacciones);
    $('anIgSaves').textContent = fmtNum(d.guardados);
    const delta = d.nuevosSeguidores;
    $('anIgDelta').textContent = (delta == null) ? ''
      : (delta >= 0 ? '+' : '') + fmtNum(delta) + ' nuevos este mes';
    $('anIgDelta').className = 'an-delta' + (delta > 0 ? ' up' : delta < 0 ? ' down' : '');
    renderBars('anIgChart', d.porDia || [], 'nuevos');
  }

  function renderAnGoogle(d) {
    const noConf = !d || !d.configurado;
    if (noConf) {
      $('anGoogleState').textContent = '— sin datos';
      ['anGoogleProm', 'anGoogleTotal', 'anGoogleMejor', 'anGoogleLocales'].forEach((id) => $(id).textContent = '–');
      $('anGoogleLocList').innerHTML = '<p class="empty">Todavía no hay datos de Google. Se cargan automáticamente.</p>';
      return;
    }
    $('anGoogleState').textContent = d.updatedAt
      ? 'actualizado ' + new Date(d.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      : '';
    $('anGoogleProm').textContent = (d.promedio != null ? d.promedio : '–') + '★';
    $('anGoogleTotal').textContent = fmtNum(d.total);

    // Reseñas nuevas en los últimos 30 días.
    const nu = d.nuevas30;
    $('anGoogleNuevas').textContent = (nu == null) ? '' : (nu >= 0 ? '+' : '') + fmtNum(nu) + ' en 30 días';
    $('anGoogleNuevas').className = 'an-delta' + (nu > 0 ? ' up' : nu < 0 ? ' down' : '');

    // Variación de la valoración media.
    const pd = (d.promedioPrev != null && d.promedio != null)
      ? Math.round((d.promedio - d.promedioPrev) * 10) / 10 : null;
    $('anGooglePromDelta').textContent = (!pd) ? '' : (pd > 0 ? '+' : '') + pd;
    $('anGooglePromDelta').className = 'an-delta' + (pd > 0 ? ' up' : pd < 0 ? ' down' : '');

    // Local mejor valorado.
    $('anGoogleMejor').textContent = d.mejor ? d.mejor.rating + '★' : '–';
    $('anGoogleMejorLbl').textContent = d.mejor ? 'Mejor: ' + d.mejor.name : 'Local mejor valorado';

    $('anGoogleLocales').textContent = (d.locales || []).length;

    // Reseñas por local (barra por nº de reseñas + valoración).
    const locs = d.locales || [];
    if (!locs.length) {
      $('anGoogleLocList').innerHTML = '<p class="empty">Sin locales.</p>';
    } else {
      const maxR = Math.max(1, ...locs.map((l) => l.reviews));
      $('anGoogleLocList').innerHTML = locs.map((l) =>
        '<div class="an-local">' +
          '<span class="an-local-name">' + esc(l.name) + ' <small>' + esc(l.city) + '</small></span>' +
          '<div class="an-local-track"><div class="an-local-fill" style="width:' +
            Math.round((l.reviews / maxR) * 100) + '%"></div></div>' +
          '<span class="an-local-val">' + l.rating + '★ · ' + fmtNum(l.reviews) + ' reseñas</span>' +
        '</div>').join('');
    }
  }

  function renderAnMeta(d) {
    const ids = ['anMetaSpend', 'anMetaReach', 'anMetaImpr', 'anMetaClicks', 'anMetaCtr', 'anMetaCpc'];
    const noConf = !d || !d.configurado;
    $('anMetaRefresh').hidden = noConf;
    if (noConf) {
      $('anMetaState').textContent = '— no conectado';
      $('anMetaNotice').hidden = false;
      $('anMetaNotice').innerHTML = 'Meta Ads no está conectado. Falta cargar el token de la API de Marketing ' +
        '(<code>META_ADS_TOKEN</code>) en el servidor.';
      ids.forEach((id) => $(id).textContent = '–');
      return;
    }
    if (d.sinDatos) {
      $('anMetaState').textContent = '— sin datos aún';
      $('anMetaNotice').hidden = false;
      $('anMetaNotice').innerHTML = 'Conectado, pero todavía no hay un snapshot guardado. ' +
        'Tocá «↻ Actualizar» (o esperá al snapshot automático de la madrugada).';
      ids.forEach((id) => $(id).textContent = '–');
      return;
    }
    $('anMetaNotice').hidden = true;
    $('anMetaState').textContent = d.dia
      ? 'al ' + new Date(d.dia).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      : '';
    const sym = d.moneda === 'USD' ? '$' : '€';
    $('anMetaSpend').textContent = sym + fmtNum(Math.round(d.spend));
    $('anMetaReach').textContent = fmtNum(d.reach);
    $('anMetaImpr').textContent = fmtNum(d.impressions);
    $('anMetaClicks').textContent = fmtNum(d.clicks);
    $('anMetaCtr').textContent = (d.ctr != null ? d.ctr : 0) + '%';
    $('anMetaCpc').textContent = sym + (d.cpc != null ? d.cpc : 0);
  }

  async function loadAnalitica() {
    anMes = anMes || anMesActual();
    $('anMonth').textContent = anMesLabel(anMes);
    $('anNext').disabled = anMes >= anMesActual();
    $('anLoading').hidden = false;
    $('anContent').hidden = true;
    try {
      const cr = anMesRango(anMes);
      const [web, igd, goog, metaD, carta] = await Promise.all([
        api('/api/admin/analitica/web?mes=' + anMes),
        api('/api/admin/analitica/instagram?mes=' + anMes).catch(() => ({ configurado: false })),
        api('/api/admin/analitica/google').catch(() => ({ configurado: false })),
        api('/api/admin/analitica/meta').catch(() => ({ configurado: false })),
        api('/api/admin/menu-analytics/global?range=custom&from=' + encodeURIComponent(cr.from) + '&to=' + encodeURIComponent(cr.to)).catch(() => null),
      ]);
      renderAnWeb(web);
      renderAnIg(igd);
      renderAnGoogle(goog);
      renderAnMeta(metaD);
      renderAnCarta(carta);
      $('anLoading').hidden = true;
      $('anContent').hidden = false;
      anLoaded = true;
      // Mejores publicaciones: se cargan aparte (la API tarda un poco).
      if (igd && igd.configurado) {
        $('anIgTop').innerHTML = '<p class="empty">Cargando publicaciones…</p>';
        api('/api/admin/analitica/instagram/top?mes=' + anMes)
          .then(renderAnIgTop)
          .catch(() => { $('anIgTop').innerHTML = '<p class="empty">No se pudieron cargar las publicaciones.</p>'; });
      }
    } catch (err) {
      $('anLoading').textContent = 'Error al cargar: ' + err.message;
    }
  }

  function anShift(delta) {
    const [y, m] = anMes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (next > anMesActual()) return;
    anMes = next;
    loadAnalitica();
  }

  async function onIgRefresh() {
    const btn = $('anIgRefresh');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Actualizando…';
    try {
      await api('/api/admin/analitica/instagram/snapshot', 'POST', {});
      await loadAnalitica();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  async function onMetaRefresh() {
    const btn = $('anMetaRefresh');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Actualizando…';
    try {
      await api('/api/admin/analitica/meta/snapshot', 'POST', {});
      await loadAnalitica();
    } catch (err) {
      alert('No se pudo actualizar: ' + err.message +
        '\n\nMeta limita las llamadas en modo desarrollo. Probá de nuevo en un rato.');
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  /* ==================== GENERADOR ==================== */
  let genLoaded = false;
  let genGemini = false;
  let genState = { formato: 'historia', instruccion: '', placas: [], caption: '' };

  async function loadGen() {
    try {
      const st = await api('/api/admin/gen/status?t=' + Date.now());
      genGemini = !!st.gemini;
      $('genGeminiTag').hidden = genGemini;
      $('genBancoTag').textContent = 'Banco: ' + (st.banco || 0) + ' fotos' +
        (st.referencia ? ' · ' + st.referencia + ' de referencia' : '');
      genLoaded = true;
    } catch (e) { /* no crítico */ }
  }

  async function onGenSync() {
    const btn = $('genSyncBtn');
    btn.disabled = true;
    btn.textContent = 'Sincronizando…';
    $('genBancoTag').textContent = 'Banco: indexando fotos nuevas…';
    try {
      const r = await api('/api/admin/gen/sync-banco', 'POST', {});
      $('genBancoTag').textContent = 'Banco: ' + r.indexadas + ' fotos';
      alert('Banco actualizado: ' + r.nuevas + ' foto(s) nueva(s) indexada(s). Total: ' + r.indexadas + '.' +
        (r.fallidas ? ' (' + r.fallidas + ' no se pudieron leer)' : ''));
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Sincronizar banco';
    }
  }

  const GEN_LOGOS = [
    ['iso-blanco', 'Iso P blanca (recomendado)'],
    ['iso-fuego', 'Iso P fuego'],
    ['iso-rojo', 'Iso P roja'],
    ['iso-verde', 'Iso P verde'],
    ['wordmark-blanco', 'Marca blanca (wordmark)'],
    ['wordmark-oscuro', 'Marca oscura'],
  ];
  function logoSelect(i, sel) {
    sel = sel || 'iso-blanco';
    return '<select data-campo="logo" data-i="' + i + '">' +
      GEN_LOGOS.map(([v, t]) =>
        '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select>';
  }

  const GEN_ESTILOS = [
    ['clasico', 'Clásico (título → pincel)'],
    ['editorial', 'Editorial (serif a la izquierda)'],
    ['titular', 'Titular (palabra gigante)'],
    ['sandwich', 'Anuncio (serif + cursiva grande)'],
    ['producto', 'Producto (serif abajo + botón)'],
  ];
  function estiloSelect(i, sel) {
    sel = sel || 'clasico';
    return '<select data-campo="estilo" data-i="' + i + '">' +
      GEN_ESTILOS.map(([v, t]) =>
        '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + t + '</option>').join('') +
      '</select>';
  }

  function renderGenPlacas() {
    const box = $('genPlacas');
    if (!genState.placas.length) {
      box.innerHTML = '';
      $('genActions').hidden = true;
      return;
    }
    box.innerHTML = genState.placas.map((p, i) =>
      '<div class="gen-placa pepe-block">' +
        '<h2>Placa ' + (i + 1) + ' de ' + genState.placas.length +
          ' <small>' + esc(genState.formato) + '</small></h2>' +
        '<div class="gen-placa-grid">' +
          '<div class="gen-placa-foto">' +
            (p.fotoUrl
              ? '<img src="' + esc(p.fotoUrl) + '" alt="" />'
              : (p.iaPrompt
                ? '<div class="gen-foto-empty">🤖 IA:<br/>' + esc(p.iaPrompt.slice(0, 60)) + '…</div>'
                : '<div class="gen-foto-empty">Sin foto</div>')) +
            (p.motivo ? '<p class="gen-foto-motivo">✨ ' + esc(p.motivo) + '</p>' : '') +
            '<div class="gen-foto-btns">' +
              '<button type="button" data-act="otra" data-i="' + i + '" title="Que la IA elija otra foto del banco">🔄 Otra</button>' +
              '<button type="button" data-act="drive" data-i="' + i + '">📁 Cambiar</button>' +
              '<button type="button" data-act="ia" data-i="' + i + '">🤖 IA</button>' +
            '</div>' +
          '</div>' +
          '<div class="gen-placa-campos">' +
            '<label>Título<input type="text" data-campo="titulo" data-i="' + i + '" value="' + esc(p.titulo || '') + '" /></label>' +
            '<label>Acento dorado <small>(cursiva)</small><input type="text" data-campo="acento" data-i="' + i + '" value="' + esc(p.acento || '') + '" placeholder="ej: felicidad, te esperamos" /></label>' +
            '<label>Bajada<input type="text" data-campo="bajada" data-i="' + i + '" value="' + esc(p.bajada || '') + '" /></label>' +
            '<label>Botón (CTA)<input type="text" data-campo="cta" data-i="' + i + '" value="' + esc(p.cta || '') + '" /></label>' +
            '<label>Ubicación <small>(opcional)</small><input type="text" data-campo="lugar" data-i="' + i + '" value="' + esc(p.lugar || '') + '" placeholder="ej: Av. Niza 9, Alicante" /></label>' +
            '<label>Estilo' + estiloSelect(i, p.estilo) + '</label>' +
            '<label>Logo' + logoSelect(i, p.logo) + '</label>' +
          '</div>' +
        '</div>' +
      '</div>').join('');
    $('genActions').hidden = false;
  }

  // Guía de contexto: la plantilla deja el esqueleto a completar; los ejemplos
  // cargan un caso entero listo para editar.
  const GEN_EJEMPLOS = {
    plantilla: 'Promo/novedad: \nLocal: \nCuándo: \nTono: \nLlamado a la acción: ',
    promo: 'Promo: 2×1 en pizzas\nLocal: Valencia\nCuándo: todos los lunes\nTono: divertido y cercano\nLlamado a la acción: vení con un amigo',
    partido: 'Qué: invitamos a ver el partido de Argentina\nLocal: San Juan\nCuándo: el domingo a las 18 h\nTono: festivo, mucho aguante\nLlamado a la acción: reservá tu mesa por DM',
    busqueda: 'Qué: búsqueda laboral, buscamos pizzero/a con experiencia\nLocal: Valencia\nTono: claro y directo\nLlamado a la acción: sumate al equipo, escribinos por DM',
  };
  function onGenChip(e) {
    const chip = e.target.closest('.gen-chip');
    if (!chip) return;
    const txt = GEN_EJEMPLOS[chip.dataset.fill];
    if (!txt) return;
    const ta = $('genInput');
    if (ta.value.trim() && !confirm('Esto reemplaza lo que escribiste. ¿Seguir?')) return;
    ta.value = txt;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  async function onGenCopy(e) {
    e.preventDefault();
    const instruccion = $('genInput').value.trim();
    if (!instruccion) return;
    const btn = $('genCopyBtn');
    btn.disabled = true;
    btn.textContent = 'Pensando… (~20 s)';
    try {
      genState.formato = $('genFormato').value;
      genState.instruccion = instruccion;
      btn.textContent = 'Eligiendo texto y fotos… (~30 s)';
      const out = await api('/api/admin/gen/copy', 'POST', { instruccion, formato: genState.formato });
      genState.placas = (out.placas || []).map((p) => ({
        titulo: p.titulo || '', acento: p.acento || '', bajada: p.bajada || '',
        cta: p.cta || '', lugar: p.lugar || '', estilo: p.estilo || 'clasico',
        fotoUrl: p.fotoUrl || null, driveId: p.driveId || null,
        bancoId: p.bancoId || null, descartadas: p.bancoId ? [p.bancoId] : [],
        iaPrompt: null, motivo: p.motivo || '', logo: 'iso-blanco',
        escenaIA: p.escenaIA || '',
        escenaPistas: Array.isArray(p.escenaPistas) ? p.escenaPistas : [],
        banderas: Array.isArray(p.banderas) ? p.banderas : [],
      }));
      genState.caption = out.caption || '';
      $('genCaption').value = genState.caption;
      $('genCaptionBlock').hidden = !genState.caption;
      $('genResultBlock').hidden = true;
      renderGenPlacas();
      if (out.bancoAviso) alert(out.bancoAviso);
      if (out.avisos && out.avisos.length) {
        alert('Avisos antes de componer (revisalos):\n\n• ' + out.avisos.join('\n• '));
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generar copy';
    }
  }

  async function onGenOtra(i, btn) {
    const p = genState.placas[i];
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Buscando…';
    try {
      const r = await api('/api/admin/gen/reelegir', 'POST', {
        instruccion: genState.instruccion,
        formato: genState.formato,
        placa: { titulo: p.titulo, bajada: p.bajada, cta: p.cta },
        excluir: p.descartadas || [],
      });
      p.fotoUrl = r.fotoUrl;
      p.driveId = r.driveId;
      p.bancoId = r.bancoId;
      p.iaPrompt = null;
      p.motivo = r.motivo || '';
      p.descartadas = (p.descartadas || []).concat(r.bancoId ? [r.bancoId] : []);
      renderGenPlacas();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function onGenPlacaClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = parseInt(btn.dataset.i, 10);
    if (btn.dataset.act === 'otra') {
      onGenOtra(i, btn);
    } else if (btn.dataset.act === 'drive') {
      drivePickCb = (urls) => {
        if (urls.length) {
          genState.placas[i].fotoUrl = urls[0];
          genState.placas[i].driveId = null; // foto cambiada a mano: usar la URL
          genState.placas[i].iaPrompt = null;
          genState.placas[i].motivo = '';
          // Si eligió varias, reparte en las placas siguientes sin foto.
          let k = i + 1;
          for (const u of urls.slice(1)) {
            while (k < genState.placas.length && genState.placas[k].fotoUrl) k++;
            if (k >= genState.placas.length) break;
            genState.placas[k].fotoUrl = u;
            genState.placas[k].driveId = null;
            genState.placas[k].iaPrompt = null;
            genState.placas[k].motivo = '';
          }
          renderGenPlacas();
        }
      };
      openDriveModal();
    } else if (btn.dataset.act === 'ia') {
      if (!genGemini) {
        alert('La generación de imágenes con IA todavía no está activa: falta cargar GEMINI_API_KEY en el .env del servidor.');
        return;
      }
      openIaModal(i);
    }
  }

  // ---- Modal de generación con IA: textarea grande (el prompt experto, editable)
  // + elección de modo (foto de referencia / libre). Reemplaza el prompt()/confirm()
  // nativos, que no muestran el prompt largo. ----
  let iaModalIdx = -1;
  function openIaModal(i) {
    iaModalIdx = i;
    const p = genState.placas[i];
    const sugerido = (p && p.escenaIA) ||
      ('Foto realista de pizza al horno de leña de una pizzería argentina: ' +
      'mesa de madera, luz cálida, ambiente acogedor. Sin texto ni logos, con una zona lisa ' +
      'para poner texto encima.');
    $('iaPromptInput').value = sugerido;
    // Pistas: elementos sugeridos por la IA para ESTA placa. Se tocan para sumarlos a
    // la escena (no escribís un prompt técnico). Se redibujan limpios en cada apertura.
    const pistas = (p && Array.isArray(p.escenaPistas)) ? p.escenaPistas : [];
    const cont = $('iaPistas');
    if (pistas.length) {
      cont.innerHTML = pistas.map((s) =>
        '<button type="button" class="ia-pista" data-pista="' + esc(s) + '">' + esc(s) + '</button>'
      ).join('');
      $('iaPistasWrap').style.display = '';
    } else {
      cont.innerHTML = '';
      $('iaPistasWrap').style.display = 'none';
    }
    $('iaExtraInput').value = '';
    const tieneFoto = !!(p.driveId || p.fotoUrl);
    $('iaModoFotoLabel').style.display = tieneFoto ? '' : 'none';
    if (tieneFoto) $('iaModoFoto').checked = true; else $('iaModoLibre').checked = true;
    $('iaModalError').textContent = '';
    $('iaModal').hidden = false;
    $('iaPromptInput').focus();
  }
  function closeIaModal() { $('iaModal').hidden = true; iaModalIdx = -1; }
  function confirmIaModal() {
    const i = iaModalIdx;
    if (i < 0) return;
    const txt = $('iaPromptInput').value.trim();
    if (!txt) { $('iaModalError').textContent = 'Escribí la escena a generar.'; return; }
    const p = genState.placas[i];
    const sel = document.querySelector('input[name="iaModo"]:checked');
    const tieneFoto = !!(p.driveId || p.fotoUrl);
    // Capturamos la referencia ANTES de limpiar la foto (solo si el modo es "foto").
    const conRef = sel && sel.value === 'foto' && tieneFoto;
    p.iaRef = conRef ? { driveId: p.driveId || null, fotoUrl: p.fotoUrl || null } : null;
    p.iaModo = conRef ? 'foto' : 'libre';
    // Elementos elegidos (chips tocados + texto libre) → se suman al prompt como
    // instrucción explícita. El server ya envuelve con "sin texto/logos" y la estética.
    const chips = Array.prototype.slice.call(
      document.querySelectorAll('#iaPistas .ia-pista.on')
    ).map((b) => b.dataset.pista);
    const extra = $('iaExtraInput').value.trim();
    const destacar = chips.concat(extra ? [extra] : []).filter(Boolean);
    p.iaPrompt = destacar.length
      ? txt + '\n\nDestacá especialmente en la escena: ' + destacar.join(', ') + '.'
      : txt;
    p.iaFotoUrl = null; // nueva escena IA → invalidar la imagen cacheada (se regenera)
    p.fotoUrl = null;
    p.driveId = null;
    p.motivo = '';
    closeIaModal();
    renderGenPlacas();
  }

  function onGenPlacaInput(e) {
    const inp = e.target.closest('[data-campo]');
    if (!inp) return;
    genState.placas[parseInt(inp.dataset.i, 10)][inp.dataset.campo] = inp.value;
  }

  async function onGenComponer() {
    const sinFoto = genState.placas.findIndex((p) => !p.fotoUrl && !p.iaPrompt);
    if (sinFoto !== -1) {
      alert('La placa ' + (sinFoto + 1) + ' no tiene foto. Elegila del banco (📁) o generala con IA (🤖).');
      return;
    }
    const btn = $('genComponerBtn');
    btn.disabled = true;
    btn.textContent = 'Componiendo… (~' + (genState.placas.length * 8) + ' s)';
    try {
      const out = await api('/api/admin/gen/piezas', 'POST', {
        formato: genState.formato,
        placas: genState.placas.map((p) => ({
          titulo: p.titulo, acento: p.acento, bajada: p.bajada, cta: p.cta, lugar: p.lugar,
          banderas: (p.banderas && p.banderas.length) ? p.banderas : undefined,
          estilo: p.estilo || undefined,
          driveId: p.driveId || undefined,
          fotoUrl: p.fotoUrl || undefined, iaPrompt: p.iaPrompt || undefined,
          iaModo: p.iaModo || undefined, iaRef: p.iaRef || undefined,
          logo: p.logo || undefined,
          adj: p.adj || undefined,
          iaFotoUrl: p.iaFotoUrl || undefined, // cache: reusar la imagen IA ya generada
        })),
      });
      // Guardar la iaFotoUrl cacheada que devolvió el server, para que el próximo
      // recomponer/ajuste NO regenere la imagen (la pizza queda fija).
      if (out.placas) out.placas.forEach((p, i) => {
        if (genState.placas[i] && p && p.iaFotoUrl) genState.placas[i].iaFotoUrl = p.iaFotoUrl;
      });
      $('genResults').innerHTML = (out.urls || []).map((u, i) =>
        '<a class="gen-result" href="' + esc(u) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(u) + '" alt="Placa ' + (i + 1) + '" loading="lazy" />' +
          '<span>Placa ' + (i + 1) + ' ⬇</span>' +
        '</a>').join('');
      $('genResultBlock').hidden = false;
      $('genResultBlock').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🎨 Componer piezas';
    }
  }

  // Ajuste conversacional sobre el resultado: el usuario pide cambios y se rehace.
  async function onGenAjustar() {
    const instruccion = $('genAjusteInput').value.trim();
    if (!instruccion) return;
    if (!genState.placas.length) return;
    const btn = $('genAjusteBtn');
    btn.disabled = true;
    btn.textContent = 'Ajustando…';
    try {
      const out = await api('/api/admin/gen/ajustar', 'POST', {
        instruccion,
        formato: genState.formato,
        caption: genState.caption,
        placas: genState.placas,
      });
      genState.placas = out.placas || genState.placas;
      if (out.caption != null) {
        genState.caption = out.caption;
        $('genCaption').value = out.caption;
        $('genCaptionBlock').hidden = !out.caption;
      }
      renderGenPlacas();
      $('genAjusteInput').value = '';
      // Rehace las piezas con los cambios aplicados.
      await onGenComponer();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Aplicar y rehacer';
    }
  }

  /* ==================== PESTAÑAS ==================== */
  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === tab));
    $('view-promos').hidden = tab !== 'promos';
    $('view-blog').hidden = tab !== 'blog';
    $('view-calendario').hidden = tab !== 'calendario';
    $('view-pepe').hidden = tab !== 'pepe';
    if (tab === 'calendario') renderCalendar();
    if (tab === 'pepe' && !pepeLoaded) loadPepeStats();
  }

  /* ==================== SECCIONES (sidebar) ==================== */
  const SECTION_LABELS = {
    'cal-mkt': 'Calendario', 'planificacion': 'Planificación',
    'inteligencia': 'Inteligencia', 'analitica': 'Analítica',
    'generador': 'Generador', 'web': 'Web', 'menu': 'Menú Digital',
  };
  function switchSection(section) {
    document.querySelectorAll('.dash-nav-item').forEach((b) =>
      b.classList.toggle('active', b.dataset.section === section));
    document.querySelectorAll('.dash-section').forEach((s) => {
      s.hidden = s.id !== 'section-' + section;
    });
    const crumb = $('dashCrumb');
    if (crumb) crumb.textContent = SECTION_LABELS[section] || '';
    if (section === 'inteligencia' && !intelLoaded) loadIntel();
    if (section === 'analitica' && !anLoaded) loadAnalitica();
    if (section === 'generador' && !genLoaded) loadGen();
    if (section === 'menu' && !menuLoaded) { menuLoaded = true; MenuAdminModule.load(); }
  }

  /* ==================== ARRANQUE ==================== */
  (async function init() {
    let cfg;
    try {
      cfg = await fetch('/api/admin/config').then((r) => r.json());
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      window.PPAdmin.sb = sb;
      // El módulo de Menú hace fetch directo (QR/analytics) con App.token; lo
      // mantenemos fresco — Supabase auto-refresca y emite el evento.
      sb.auth.onAuthStateChange((_evt, session) => { window.App.token = session ? session.access_token : null; });
    } catch (e) {
      $('loading').textContent = 'No se pudo iniciar el panel.';
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/admin/login/'; return; }
    window.App.token = session.access_token;

    let me;
    try { me = await api('/api/admin/me'); }
    catch (e) { location.href = '/admin/login/'; return; }
    $('adminEmail').textContent = me.email || '';
    $('loading').hidden = true;
    $('panel').hidden = false;

    // Salir (vale para todos los perfiles, también el gerente solo-menú)
    $('logoutBtn').addEventListener('click', async () => {
      await sb.auth.signOut();
      location.href = '/admin/login/';
    });

    // Secciones (sidebar del dashboard)
    document.querySelectorAll('.dash-nav-item').forEach((b) =>
      b.addEventListener('click', () => switchSection(b.dataset.section)));

    // Visibilidad por permiso (ver /api/admin/me):
    //  · isFullAdmin (role 'dueno') → ve todo el panel.
    //  · con acceso al menú pero sin ser dueño → gerente SOLO-menú: se oculta y
    //    se elimina el resto de secciones, y se corta el init antes de cablear
    //    nodos que ya no existen (evita el null.addEventListener).
    //  · sin acceso al menú → se oculta la entrada "Menú Digital".
    const hasMenu = !!(me.menu && me.menu.hasAccess);
    const onlyMenu = hasMenu && !me.isFullAdmin;
    document.querySelectorAll('.dash-nav-item').forEach((b) => {
      const sec = b.dataset.section;
      if (sec === 'menu' && !hasMenu) { b.hidden = true; return; }
      if (onlyMenu && sec !== 'menu') {
        b.hidden = true;
        const s = document.getElementById('section-' + sec);
        if (s) s.remove();
      }
    });
    // Gerente solo-menú: sin secciones "Próximamente", ocultar también el separador.
    if (onlyMenu) document.querySelectorAll('.dash-nav-sep').forEach((el) => { el.hidden = true; });
    switchSection(onlyMenu ? 'menu' : 'web');
    if (onlyMenu) return; // gerente solo-menú: no hay más que cablear

    // Pestañas (sub-secciones de Web)
    document.querySelectorAll('.admin-tab').forEach((t) =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)));

    // Promos
    $('newPromoBtn').addEventListener('click', () => openPromoModal(null));
    $('cancelBtn').addEventListener('click', closePromoModal);
    $('promoForm').addEventListener('submit', savePromoModal);
    $('promoList').addEventListener('click', onPromoListClick);
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closePromoModal(); });

    // Blog
    $('newPostBtn').addEventListener('click', () => openPostModal(null));
    $('postCancelBtn').addEventListener('click', closePostModal);
    $('postForm').addEventListener('submit', savePostModal);
    $('postList').addEventListener('click', onPostListClick);
    $('postList').addEventListener('change', onPostEstadoChange);
    $('postModal').addEventListener('click', (e) => { if (e.target.id === 'postModal') closePostModal(); });

    // Asistente IA (promos)
    $('assistantForm').addEventListener('submit', onAssistantSubmit);

    // Asistente de Blog
    $('blogAsForm').addEventListener('submit', onBlogAsSubmit);
    $('blogAsFiles').addEventListener('change', onBlogFiles);
    $('blogAsPhotos').addEventListener('click', onBlogPhotoRemove);

    // Selector de Google Drive
    $('driveBtn').addEventListener('click', openDriveModal);
    $('driveCancel').addEventListener('click', closeDriveModal);
    $('driveBack').addEventListener('click', driveBack);
    $('driveImportBtn').addEventListener('click', driveImport);
    $('driveBrowser').addEventListener('click', onDriveClick);
    $('driveBrowser').addEventListener('change', onDriveChange);
    $('driveModal').addEventListener('click', (e) => { if (e.target.id === 'driveModal') closeDriveModal(); });

    // Calendario
    $('calPrev').addEventListener('click', () => {
      calRef.setMonth(calRef.getMonth() - 1); renderCalendar();
    });
    $('calNext').addEventListener('click', () => {
      calRef.setMonth(calRef.getMonth() + 1); renderCalendar();
    });

    // Pepe — estadísticas del chat
    $('pepeAnalyzeBtn').addEventListener('click', onPepeAnalyze);

    // Cerebro de Pepe (base de conocimiento)
    $('pepeKbForm').addEventListener('submit', onPepeKbSubmit);
    $('pepeKbList').addEventListener('click', onPepeKbClick);
    $('pepeInsight').addEventListener('click', (e) => {
      const b = e.target.closest('.pepe-teach');
      if (!b) return;
      teachPepe(lastPepeRecos[parseInt(b.dataset.teach, 10)], b);
    });

    // Generador
    $('genForm').addEventListener('submit', onGenCopy);
    $('genChips').addEventListener('click', onGenChip);
    $('genInput').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('genForm').requestSubmit(); }
    });
    $('genSyncBtn').addEventListener('click', onGenSync);
    $('genComponerBtn').addEventListener('click', onGenComponer);
    $('genPlacas').addEventListener('click', onGenPlacaClick);
    $('genPlacas').addEventListener('input', onGenPlacaInput);
    $('genPlacas').addEventListener('change', onGenPlacaInput);
    $('iaCancel').addEventListener('click', closeIaModal);
    $('iaGenerar').addEventListener('click', confirmIaModal);
    $('iaPistas').addEventListener('click', (e) => {
      const b = e.target.closest('.ia-pista');
      if (b) b.classList.toggle('on');
    });
    $('genAjusteBtn').addEventListener('click', onGenAjustar);
    $('genAjusteInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onGenAjustar(); }
    });

    // Inteligencia
    $('intelGenBtn').addEventListener('click', onIntelGenerate);

    // Analítica
    $('anPrev').addEventListener('click', () => anShift(-1));
    $('anNext').addEventListener('click', () => anShift(1));
    $('anIgRefresh').addEventListener('click', onIgRefresh);
    $('anMetaRefresh').addEventListener('click', onMetaRefresh);
    $('anCartaGoto').addEventListener('click', () => switchSection('menu'));
    $('intelHist').addEventListener('click', (e) => {
      const b = e.target.closest('.intel-chip');
      if (!b) return;
      const row = intelInformes.find((r) => String(r.id) === String(b.dataset.id));
      renderIntelHist(row ? row.id : null);
      renderInforme(row || null);
    });

    try {
      await loadPromos();
      await loadPosts();
    } catch (e) {
      $('promoList').innerHTML = '<p class="empty">Error al cargar: ' + esc(e.message) + '</p>';
    }
  })();
})();
