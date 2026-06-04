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
    $('pepeRecent').innerHTML = list.map((r) =>
      '<div class="pepe-msg">' +
        '<p class="pepe-msg-u">' + esc(r.user_msg) + '</p>' +
        (r.bot_reply ? '<p class="pepe-msg-b">' + esc(r.bot_reply) + '</p>' : '') +
      '</div>').join('');
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
      renderPepeRecent(d.recientes);
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
    'inteligencia': 'Inteligencia', 'generador': 'Generador', 'web': 'Web',
  };
  function switchSection(section) {
    document.querySelectorAll('.dash-nav-item').forEach((b) =>
      b.classList.toggle('active', b.dataset.section === section));
    document.querySelectorAll('.dash-section').forEach((s) => {
      s.hidden = s.id !== 'section-' + section;
    });
    const crumb = $('dashCrumb');
    if (crumb) crumb.textContent = SECTION_LABELS[section] || '';
  }

  /* ==================== ARRANQUE ==================== */
  (async function init() {
    let cfg;
    try {
      cfg = await fetch('/api/admin/config').then((r) => r.json());
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    } catch (e) {
      $('loading').textContent = 'No se pudo iniciar el panel.';
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = '/admin/login/'; return; }

    let me;
    try { me = await api('/api/admin/me'); }
    catch (e) { location.href = '/admin/login/'; return; }
    $('adminEmail').textContent = me.email || '';
    $('loading').hidden = true;
    $('panel').hidden = false;

    // Secciones (sidebar del dashboard)
    document.querySelectorAll('.dash-nav-item').forEach((b) =>
      b.addEventListener('click', () => switchSection(b.dataset.section)));
    switchSection('web');

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

    // Salir
    $('logoutBtn').addEventListener('click', async () => {
      await sb.auth.signOut();
      location.href = '/admin/login/';
    });

    try {
      await loadPromos();
      await loadPosts();
    } catch (e) {
      $('promoList').innerHTML = '<p class="empty">Error al cargar: ' + esc(e.message) + '</p>';
    }
  })();
})();
