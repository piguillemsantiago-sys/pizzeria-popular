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
    resetHeroIa();
    $('postModal').hidden = false;
  }
  function closePostModal() { $('postModal').hidden = true; }

  // ---- Hero con IA (Gemini): sugiere la escena desde el post, genera una foto de
  // portada LIMPIA (sin texto), la sube al Storage y la carga como hero_image. ----
  function resetHeroIa() {
    $('heroIaPanel').hidden = true;
    $('heroIaPrompt').value = '';
    $('heroIaError').textContent = '';
    $('heroIaPreview').hidden = true;
    $('heroIaImg').removeAttribute('src');
  }

  async function onHeroIaSugerir() {
    const f = $('postForm');
    const btn = $('heroIaSugerir');
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = '✨ Pensando…';
    $('heroIaError').textContent = '';
    try {
      const out = await api('/api/admin/posts/hero-ia/sugerir', 'POST', {
        titulo: f.titulo.value, subtitulo: f.subtitulo.value, contenido: f.contenido.value,
      });
      if (out && out.prompt) $('heroIaPrompt').value = out.prompt;
    } catch (e) {
      $('heroIaError').textContent = e.message || 'No pude sugerir la escena.';
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }

  async function onHeroIaGen() {
    const prompt = $('heroIaPrompt').value.trim();
    if (!prompt) { $('heroIaError').textContent = 'Escribí o sugerí una escena primero.'; return; }
    const btn = $('heroIaGen');
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generando… (~30 s)';
    $('heroIaError').textContent = '';
    try {
      const out = await api('/api/admin/posts/hero-ia', 'POST', { prompt });
      if (out && out.url) {
        $('postForm').hero_image.value = out.url;
        $('heroIaImg').src = out.url;
        $('heroIaPreview').hidden = false;
      }
    } catch (e) {
      $('heroIaError').textContent = e.message || 'No pude generar la imagen.';
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }

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
      $('anGoogleLocList').innerHTML = locs.map((l) => {
        const nu = l.nuevas7 != null ? l.nuevas7 : l.nuevas30;
        const nuTxt = nu == null ? '' : ' · ' + (nu >= 0 ? '+' : '') + fmtNum(nu) + (l.nuevas7 != null ? ' (7d)' : ' (30d)');
        const subir = (l.rating >= 5) ? 'en el tope ⭐'
          : (l.faltan != null ? '~' + fmtNum(l.faltan) + ' para ' + String(l.target).replace('.', ',') + '★' : '');
        const meta = (subir || nuTxt)
          ? '<small style="display:block;opacity:.6;font-weight:400;">' + subir + nuTxt + '</small>' : '';
        return '<div class="an-local">' +
          '<span class="an-local-name">' + esc(l.name) + ' <small>' + esc(l.city) + '</small></span>' +
          '<div class="an-local-track"><div class="an-local-fill" style="width:' +
            Math.round((l.reviews / maxR) * 100) + '%"></div></div>' +
          '<span class="an-local-val">' + l.rating + '★ · ' + fmtNum(l.reviews) + ' reseñas' + meta + '</span>' +
        '</div>';
      }).join('');
    }
  }

  function renderAnGoogleVoz(d) {
    const el = $('anGoogleVoz');
    if (!el) return;
    if (!d || !(d.porLocal || []).length) {
      el.innerHTML = '<p class="empty">Sin texto de reseñas para analizar todavía.</p>';
      return;
    }
    el.innerHTML = d.porLocal.map((l) => {
      const pos = (l.positivo || []).length
        ? '<div style="color:#3a9d5d;font-size:13px;margin:2px 0;">👍 ' + l.positivo.map(esc).join(' · ') + '</div>' : '';
      const neg = (l.negativo || []).length
        ? '<div style="color:#c0492f;font-size:13px;margin:2px 0;">👎 ' + l.negativo.map(esc).join(' · ') + '</div>'
        : '<div style="opacity:.45;font-size:12.5px;margin:2px 0;">👎 sin quejas en la muestra</div>';
      return '<div style="padding:8px 0;border-top:1px solid rgba(128,128,128,.18);">' +
        '<div style="font-weight:600;margin-bottom:2px;">' + esc(l.local) + '</div>' + pos + neg + '</div>';
    }).join('');
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
      const [web, igd, goog, metaD, carta, voz] = await Promise.all([
        api('/api/admin/analitica/web?mes=' + anMes),
        api('/api/admin/analitica/instagram?mes=' + anMes).catch(() => ({ configurado: false })),
        api('/api/admin/analitica/google').catch(() => ({ configurado: false })),
        api('/api/admin/analitica/meta').catch(() => ({ configurado: false })),
        api('/api/admin/menu-analytics/global?range=custom&from=' + encodeURIComponent(cr.from) + '&to=' + encodeURIComponent(cr.to)).catch(() => null),
        api('/api/admin/resenas/voz').catch(() => null),
      ]);
      renderAnWeb(web);
      renderAnIg(igd);
      renderAnGoogle(goog);
      renderAnGoogleVoz(voz);
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
  let genState = { formato: 'historia', modo: 'clasico', instruccion: '', placas: [], caption: '' };

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

  // ---- Brand Kit: la identidad de marca que ve la IA de imágenes ----
  const BK_CAMPOS = [['marca', 'bkMarca'], ['colores', 'bkColores'], ['tipografias', 'bkTipografias'],
    ['fotografia', 'bkFotografia'], ['tono', 'bkTono'], ['reglas', 'bkReglas']];
  async function openBkModal() {
    $('bkError').textContent = '';
    $('bkModal').hidden = false;
    BK_CAMPOS.forEach(([, id]) => { $(id).value = ''; $(id).placeholder = 'Cargando…'; });
    try {
      const out = await api('/api/admin/gen/brand-kit');
      BK_CAMPOS.forEach(([k, id]) => { $(id).value = (out.kit && out.kit[k]) || ''; $(id).placeholder = ''; });
    } catch (e) {
      $('bkError').textContent = e.message;
    }
  }
  async function onBkGuardar() {
    const body = {};
    BK_CAMPOS.forEach(([k, id]) => { body[k] = $(id).value; });
    const btn = $('bkGuardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    $('bkError').textContent = '';
    try {
      await api('/api/admin/gen/brand-kit', 'PUT', body);
      $('bkModal').hidden = true;
    } catch (e) {
      $('bkError').textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
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
          ' <small>' + esc(genState.formato) +
          (p.modoIA === 'completa' ? ' · 🧠 placa completa IA' : '') + '</small></h2>' +
        '<div class="gen-placa-grid">' +
          '<div class="gen-placa-foto">' +
          (p.modoIA === 'completa'
            // Placa completa IA: no hay foto del banco — Gemini diseña todo a
            // partir de la escena. Acá solo se muestra/edita la escena base.
            ? '<div class="gen-foto-empty">🧠 Gemini diseña la placa completa<br/><small>' +
                esc(String(p.iaPrompt || p.escenaIA || '').slice(0, 90)) + '…</small></div>' +
              // Foto real del local elegida del banco (pedido "ambientación real"):
              // viaja a Gemini como referencia del ambiente de la escena.
              (p.fotoUrl
                ? '<img src="' + esc(p.fotoUrl) + '" alt="" />' +
                  '<p class="gen-foto-motivo">📍 Ambientación del local' + (p.motivo ? ': ' + esc(p.motivo) : '') + '</p>' +
                  '<div class="gen-foto-btns">' +
                    '<button type="button" data-act="otra" data-i="' + i + '" title="Que la IA elija otra foto del local">🔄 Otra</button>' +
                    '<button type="button" data-act="quitar-ambiente" data-i="' + i + '" title="Componer sin foto del local (Gemini imagina el ambiente)">✕ Quitar</button>' +
                  '</div>'
                : '') +
              '<div class="gen-foto-btns">' +
                '<button type="button" data-act="ia" data-i="' + i + '">🖼 Escena</button>' +
              '</div>'
            : (p.fotoUrl
                ? '<img src="' + esc(p.fotoUrl) + '" alt="" />'
                : (p.iaPrompt
                  ? '<div class="gen-foto-empty">🤖 IA:<br/>' + esc(p.iaPrompt.slice(0, 60)) + '…</div>'
                  : '<div class="gen-foto-empty">Sin foto</div>')) +
              (p.motivo ? '<p class="gen-foto-motivo">✨ ' + esc(p.motivo) + '</p>' : '') +
              '<div class="gen-foto-btns">' +
                '<button type="button" data-act="otra" data-i="' + i + '" title="Que la IA elija otra foto del banco">🔄 Otra</button>' +
                '<button type="button" data-act="drive" data-i="' + i + '">📁 Cambiar</button>' +
                '<button type="button" data-act="ia" data-i="' + i + '">🤖 IA</button>' +
              '</div>') +
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
    if ($('genFormato').value === 'portada') return; // la portada tiene su propio flujo
    const instruccion = $('genInput').value.trim();
    if (!instruccion) return;
    if ($('genModo').value === 'completa' && !genGemini) {
      alert('El modo "Placa completa IA" necesita la IA de imágenes activa (falta GEMINI_API_KEY en el servidor).');
      return;
    }
    const btn = $('genCopyBtn');
    btn.disabled = true;
    btn.textContent = 'Pensando… (~20 s)';
    try {
      genState.formato = $('genFormato').value;
      genState.modo = $('genModo').value;
      genState.instruccion = instruccion;
      const esCompleta = genState.modo === 'completa';
      btn.textContent = esCompleta ? 'Escribiendo el copy… (~20 s)' : 'Eligiendo texto y fotos… (~30 s)';
      const out = await api('/api/admin/gen/copy', 'POST', { instruccion, formato: genState.formato, modo: genState.modo });
      genState.placas = (out.placas || []).map((p) => ({
        titulo: p.titulo || '', acento: p.acento || '', bajada: p.bajada || '',
        cta: p.cta || '', lugar: p.lugar || '', estilo: p.estilo || 'clasico',
        fotoUrl: p.fotoUrl || null, driveId: p.driveId || null,
        bancoId: p.bancoId || null, descartadas: p.bancoId ? [p.bancoId] : [],
        iaPrompt: null, motivo: p.motivo || '', logo: 'iso-blanco',
        escenaIA: p.escenaIA || '',
        escenaPistas: Array.isArray(p.escenaPistas) ? p.escenaPistas : [],
        banderas: Array.isArray(p.banderas) ? p.banderas : [],
        evento: p.evento || '',
        modoIA: esCompleta ? 'completa' : undefined,
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
      // En placa completa IA la foto es referencia de AMBIENTACIÓN: se le pide
      // al elector una toma del local, no un primer plano de comida.
      const esCompleta = p.modoIA === 'completa';
      const r = await api('/api/admin/gen/reelegir', 'POST', {
        instruccion: genState.instruccion + (esCompleta
          ? '\n(Elegí una foto de las INSTALACIONES del local como referencia de ambientación — NO primeros planos de comida. La foto tiene que mostrar el MISMO tipo de espacio que esta escena: si la escena es un salón interior, elegí SOLO interiores (salón, mesas, barra, horno), NUNCA la fachada ni la calle; si es exterior, fachada o terraza.' +
            (p.escenaIA ? ' Escena: ' + String(p.escenaIA).slice(0, 160) + '…' : '') + ')'
          : ''),
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
    } else if (btn.dataset.act === 'quitar-ambiente') {
      // Saca la foto de ambientación: Gemini imagina el ambiente solo. La firma
      // del cache cambia, así que el próximo componer regenera la placa.
      const p = genState.placas[i];
      p.fotoUrl = null; p.driveId = null; p.bancoId = null; p.motivo = '';
      renderGenPlacas();
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
    // Placa completa IA: la escena es la BASE del diseño (el redactor experto del
    // server arma el prompt final) → sin radios de modo ni "afinar" (ya es experto).
    const esCompleta = p && p.modoIA === 'completa';
    $('iaModeRow').style.display = esCompleta ? 'none' : '';
    $('iaAfinarRow').style.display = esCompleta ? 'none' : '';
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
    p.iaPlacaUrl = null; // ídem para la placa completa IA
    p.fotoUrl = null;
    p.driveId = null;
    p.motivo = '';
    closeIaModal();
    renderGenPlacas();
  }

  // Afinar prompt: manda el borrador + chips marcados + texto a mano a un experto que
  // los reteje en un prompt pulido para Gemini, y lo escribe de vuelta en el textarea.
  // Como los elementos quedan integrados, limpiamos chips y texto a mano (ya están adentro).
  async function onAfinarPrompt() {
    const i = iaModalIdx;
    if (i < 0) return;
    const p = genState.placas[i] || {};
    const chips = Array.prototype.slice.call(
      document.querySelectorAll('#iaPistas .ia-pista.on')
    ).map((b) => b.dataset.pista);
    const extra = $('iaExtraInput').value.trim();
    const destacar = chips.concat(extra ? [extra] : []).filter(Boolean);
    const contexto = [p.titulo, p.acento, p.bajada].filter(Boolean).join(' · ');
    const btn = $('iaAfinar');
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = '✨ Afinando…';
    $('iaModalError').textContent = '';
    try {
      const out = await api('/api/admin/gen/prompt-experto', 'POST', {
        borrador: $('iaPromptInput').value,
        destacar: destacar,
        contexto: contexto,
        formato: genState.formato,
      });
      if (out && out.prompt) {
        $('iaPromptInput').value = out.prompt;
        // Ya están integrados en el prompt: desmarcamos chips y vaciamos el texto a mano.
        document.querySelectorAll('#iaPistas .ia-pista.on').forEach((b) => b.classList.remove('on'));
        $('iaExtraInput').value = '';
      }
    } catch (e) {
      $('iaModalError').textContent = e.message || 'No pude afinar el prompt.';
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }

  function onGenPlacaInput(e) {
    const inp = e.target.closest('[data-campo]');
    if (!inp) return;
    genState.placas[parseInt(inp.dataset.i, 10)][inp.dataset.campo] = inp.value;
  }

  // ---- Portada para Reel (modo aparte: no pasa por el flujo de placas) ----
  let genPFrameData = null; // dataURL del frame subido para "limpiar"
  let genPortadaCopy = null; // copy de la última portada editorial (para editar/rehacer)

  // Al elegir el formato "Portada", ocultamos el flujo de placas y mostramos el panel
  // de portada (y viceversa). La caja de ajuste de placas no aplica a la portada.
  function onGenFormatoChange() {
    const esPortada = $('genFormato').value === 'portada';
    ['genModo', 'genChips', 'genInput', 'genHint', 'genCopyBtn'].forEach((id) => {
      const el = $(id); if (el) el.hidden = esPortada;
    });
    $('genPortada').hidden = !esPortada;
    const aj = document.querySelector('#genResultBlock .gen-ajuste');
    if (aj) aj.hidden = esPortada;
    if (esPortada) {
      $('genPlacas').innerHTML = ''; $('genActions').hidden = true;
      if ($('genPCopyBox')) $('genPCopyBox').hidden = true;      // caja de textos: recién tras generar
      if ($('genPTituloWrap')) $('genPTituloWrap').hidden = true; // título: solo cuando hay captura (limpiar)
      // Enfocar la caja de pegado: sin foco en un elemento editable, Ctrl+V no dispara.
      const d = $('genPDrop'); if (d) setTimeout(() => d.focus(), 0);
    }
    $('genResultBlock').hidden = true; // no mezclar una portada con placas de otro modo
  }

  // La captura cargada cambia el botón a "limpiar" (auto). Sin captura, el botón "genera".
  async function setGenPFrame(file) {
    try {
      genPFrameData = await resizeImage(file); // reusa el resize del panel (máx 2000px, jpeg)
      $('genPFrameImg').src = genPFrameData;
      $('genPFramePrev').hidden = false;
      if ($('genPTituloWrap')) $('genPTituloWrap').hidden = false; // el título aplica al limpiar
      if ($('genPCopyBox')) $('genPCopyBox').hidden = true;        // los textos editoriales no aplican al limpiar
      $('genPGo').textContent = '🧽 Limpiar esta captura y usar de portada';
    } catch (err) { alert('No pude leer la imagen: ' + (err.message || err)); }
  }

  function clearGenPFrame() {
    genPFrameData = null;
    $('genPFrameImg').src = '';
    $('genPFramePrev').hidden = true;
    if ($('genPTituloWrap')) $('genPTituloWrap').hidden = true;
    if ($('genPTitulo')) $('genPTitulo').value = '';
    $('genPGo').textContent = '🎬 Generar portada desde el tema';
  }

  function onGenPFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) setGenPFrame(file);
  }

  // Saca la primera imagen del portapapeles (índice, no for..of: DataTransferItemList
  // no siempre es iterable con for..of en todos los motores).
  function extractPastedImage(e) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type && it.type.indexOf('image') === 0) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
    return null;
  }

  // Pegar una captura con Ctrl+V (solo cuando el panel de portada está visible; si el
  // portapapeles no trae imagen, dejamos pasar el pegado normal). El evento burbujea
  // desde la caja editable (genPDrop) hasta document, donde está enganchado.
  function onGenPPaste(e) {
    if ($('genPortada').hidden) return;
    const file = extractPastedImage(e);
    if (file) { e.preventDefault(); setGenPFrame(file); }
  }

  // Un solo botón, decide solo: si hay captura la LIMPIA; si no, GENERA desde el tema.
  function onGenPortadaAuto() {
    if (genPFrameData) return onGenPortada('limpiar');
    if ($('genPTema').value.trim()) return onGenPortada('generar');
    alert('Pegá o subí una captura para limpiarla, o escribí un tema para generar una nueva.');
  }

  function fillGenPCopy(copy) {
    if (!copy) return;
    if ($('genPCTitulo')) $('genPCTitulo').value = copy.titulo || '';
    if ($('genPCResaltar')) $('genPCResaltar').value = copy.resaltar || '';
    if ($('genPCSubtitulo')) $('genPCSubtitulo').value = copy.subtitulo || '';
  }

  // modo 'generar' (editorial PRO + logo real) o 'limpiar' (frame). usarCampos =
  // rehacer una portada editorial con los textos editados (reusa el hero/color previos).
  async function onGenPortada(modo, usarCampos) {
    if (!genGemini) {
      alert('La portada para reel necesita la IA de imágenes activa (falta GEMINI_API_KEY en el servidor).');
      return;
    }
    const body = { modo };
    if (modo === 'generar') {
      body.color = $('genPColor').value.trim();
      if (usarCampos && genPortadaCopy) {
        body.campos = Object.assign({}, genPortadaCopy, {
          titulo: $('genPCTitulo').value.trim() || genPortadaCopy.titulo,
          resaltar: $('genPCResaltar').value.trim() || genPortadaCopy.resaltar,
          subtitulo: $('genPCSubtitulo').value.trim(),
        });
      } else {
        const tema = $('genPTema').value.trim();
        if (!tema) { alert('Contame el tema de la portada.'); return; }
        body.tema = tema;
      }
    } else {
      const titulo = $('genPTitulo') ? $('genPTitulo').value.trim() : '';
      if (titulo) {
        body.titulo = titulo; // título opcional, se dibuja con texto exacto encima
        if ($('genPDiseno')) body.diseno = $('genPDiseno').value; // diseño de marca elegido
      }
      if (!genPFrameData) { alert('Subí primero un frame del reel.'); return; }
      body.frameB64 = genPFrameData;
    }
    const btn = usarCampos ? $('genPRehacer') : $('genPGo');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = modo === 'limpiar' ? 'Limpiando el frame… (~25 s)' : 'Pintando la portada… (~30 s)';
    try {
      const out = await api('/api/admin/gen/portada', 'POST', body);
      $('genResults').innerHTML =
        '<a class="gen-result" href="' + esc(out.url) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(out.url) + '" alt="Portada para reel" loading="lazy" />' +
          '<span>Portada ⬇</span>' +
        '</a>';
      const aj = document.querySelector('#genResultBlock .gen-ajuste');
      if (aj) aj.hidden = true;
      $('genResultBlock').hidden = false;
      // La portada editorial devuelve el copy usado → mostrar los campos editables.
      if (out.copy) {
        genPortadaCopy = out.copy;
        fillGenPCopy(out.copy);
        if ($('genPCopyBox')) $('genPCopyBox').hidden = false;
      } else if ($('genPCopyBox')) {
        $('genPCopyBox').hidden = true;
      }
      $('genResultBlock').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  async function onGenComponer() {
    const sinFoto = genState.placas.findIndex((p) => p.modoIA !== 'completa' && !p.fotoUrl && !p.iaPrompt);
    if (sinFoto !== -1) {
      alert('La placa ' + (sinFoto + 1) + ' no tiene foto. Elegila del banco (📁) o generala con IA (🤖).');
      return;
    }
    const btn = $('genComponerBtn');
    btn.disabled = true;
    const hayCompleta = genState.placas.some((p) => p.modoIA === 'completa');
    btn.textContent = hayCompleta
      ? 'Diseñando con IA y verificando… (~40 s por placa)'
      : 'Componiendo… (~' + (genState.placas.length * 8) + ' s)';
    try {
      const out = await api('/api/admin/gen/piezas', 'POST', {
        formato: genState.formato,
        placas: genState.placas.map((p) => ({
          titulo: p.titulo, acento: p.acento, bajada: p.bajada, cta: p.cta, lugar: p.lugar,
          banderas: (p.banderas && p.banderas.length) ? p.banderas : undefined,
          evento: p.evento || undefined,
          estilo: p.estilo || undefined,
          driveId: p.driveId || undefined,
          fotoUrl: p.fotoUrl || undefined, iaPrompt: p.iaPrompt || undefined,
          iaModo: p.iaModo || undefined, iaRef: p.iaRef || undefined,
          logo: p.logo || undefined,
          adj: p.adj || undefined,
          iaFotoUrl: p.iaFotoUrl || undefined, // cache: reusar la imagen IA ya generada
          // Modo placa completa IA: escena + notas de diseño + cache de la placa cruda.
          modoIA: p.modoIA || undefined,
          escenaIA: p.escenaIA || undefined,
          notasDiseno: p.notasDiseno || undefined,
          iaPlacaUrl: p.iaPlacaUrl || undefined,
          iaPlacaFirma: p.iaPlacaFirma || undefined,
        })),
      });
      // Guardar los caches que devolvió el server (imagen de fondo IA / placa
      // completa IA), para que el próximo recomponer/ajuste NO regenere de más.
      if (out.placas) out.placas.forEach((p, i) => {
        if (!genState.placas[i] || !p) return;
        if (p.iaFotoUrl) genState.placas[i].iaFotoUrl = p.iaFotoUrl;
        if (p.iaPlacaUrl) { genState.placas[i].iaPlacaUrl = p.iaPlacaUrl; genState.placas[i].iaPlacaFirma = p.iaPlacaFirma; }
        // Avisos de la verificación IA: si el server regeneró trae la lista (aunque
        // sea vacía); si usó el cache no viene y se conserva la del último render.
        if (p.avisosIA != null) genState.placas[i].avisosIA = p.avisosIA;
      });
      $('genResults').innerHTML = (out.urls || []).map((u, i) => {
        const avisos = (genState.placas[i] && genState.placas[i].avisosIA) || [];
        return '<a class="gen-result" href="' + esc(u) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(u) + '" alt="Placa ' + (i + 1) + '" loading="lazy" />' +
          '<span>Placa ' + (i + 1) + ' ⬇</span>' +
          (avisos.length ? '<span class="gen-result-aviso">' + esc(avisos.join(' · ')) + '</span>' : '') +
        '</a>';
      }).join('');
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

  /* ==================== RESEÑAS GOOGLE (sección Google Maps) ==================== */
  let resenasLoaded = false;
  const GM_LOCAL_NAMES = {
    'luceros': 'Luceros', 'playa-san-juan': 'Playa San Juan', 'russafa': 'Russafa',
    'santa-clara': 'Santa Clara', 'boadilla': 'Boadilla', 'benidorm': 'Benidorm',
  };
  function gmStars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function gmFmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  async function loadResenas() {
    resenasLoaded = true;
    let stars = 0;
    let lastGen = null;   // { local_id, texto, estrellas, cliente_nombre, fecha, idioma_detectado, variantes, modelo_usado }
    let hOffset = 0;
    const H_LIMIT = 50;
    let lastItems = [];
    let detail = null;    // reseña abierta en el modal

    const fFecha = $('gmFFecha');
    if (fFecha && !fFecha.value) fFecha.value = new Date().toISOString().slice(0, 10);

    // Llamada a la API con toast en error (api() ya adjunta el Bearer de Supabase).
    async function call(path, method, body) {
      try { return await api(path, method, body); }
      catch (e) { showToast('Error: ' + (e.message || 'servidor')); throw e; }
    }

    // ---- Métricas ----
    async function loadMetrics() {
      const local = $('gmLocal').value;
      const q = local ? '?local_id=' + local : '';
      try {
        const m = await call('/api/admin/resenas/metricas' + q, 'GET');
        $('gmTotal').textContent = m.total_mes;
        $('gmResp').textContent = m.respondidas_mes + ' / ' + m.pendientes_mes;
        $('gmMedia').textContent = m.puntuacion_media_mes ? m.puntuacion_media_mes.toFixed(2) : '—';
        $('gmTiempo').textContent = m.tiempo_medio_respuesta_horas ? m.tiempo_medio_respuesta_horas + ' h' : '—';
        const d = m.distribucion_estrellas || {};
        $('gmDistrib').textContent = `5★:${d[5] || 0}  4★:${d[4] || 0}  3★:${d[3] || 0}  2★:${d[2] || 0}  1★:${d[1] || 0}`;
      } catch (e) { /* toast ya */ }
    }

    // ---- Panel: reseñas por local (rating, total, nuevas 7d, faltan para subir) ----
    async function loadPanel() {
      const body = $('gmPanelBody');
      if (!body) return;
      try {
        const d = await call('/api/admin/analitica/google', 'GET');
        if (!d || !d.configurado || !(d.locales || []).length) {
          body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;opacity:.6;">Todavía no hay datos de Google. Se cargan solos.</td></tr>';
          return;
        }
        body.innerHTML = d.locales.map((l) => {
          const nu = l.nuevas7 != null ? l.nuevas7 : l.nuevas30;
          const nuTxt = nu == null ? '<span style="opacity:.5;">—</span>'
            : (nu > 0 ? '<b style="color:#3a9d5d;">+' + nu + '</b>'
              : (nu < 0 ? '<b style="color:#c0492f;">' + nu + '</b>' : '0'));
          const subir = (l.rating >= 5) ? '🏆 tope'
            : (l.faltan != null ? '~' + fmtNum(l.faltan) + ' → ' + String(l.target).replace('.', ',') + '★'
              : '<span style="opacity:.5;">—</span>');
          return '<tr>' +
            '<td>' + esc(l.name) + ' <small style="opacity:.6;">' + esc(l.city) + '</small></td>' +
            '<td><b>' + l.rating + '★</b></td>' +
            '<td>' + fmtNum(l.reviews) + '</td>' +
            '<td>' + nuTxt + '</td>' +
            '<td><span style="opacity:.85;">' + subir + '</span></td>' +
          '</tr>';
        }).join('');
      } catch (e) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;opacity:.6;">No se pudo cargar.</td></tr>';
      }
    }

    // ---- "Lo que dice la gente" — por local (positivos / negativos del texto de reseñas) ----
    async function loadVoz() {
      const body = $('gmVozBody');
      if (!body) return;
      try {
        const d = await call('/api/admin/resenas/voz', 'GET');
        const locs = (d && d.porLocal) || [];
        if (!locs.length) {
          body.innerHTML = '<p style="opacity:.6;">Todavía no hay reseñas con texto para analizar.</p>';
          return;
        }
        body.innerHTML = locs.map((l) => {
          const pos = (l.positivo || []).length
            ? '<div style="color:#3a9d5d;font-size:13px;margin:3px 0;line-height:1.6;">👍 ' + l.positivo.map(esc).join(' · ') + '</div>' : '';
          const neg = (l.negativo || []).length
            ? '<div style="color:#c0492f;font-size:13px;margin:3px 0;line-height:1.6;">👎 ' + l.negativo.map(esc).join(' · ') + '</div>'
            : '<div style="opacity:.45;font-size:12.5px;margin:3px 0;">👎 sin quejas en la muestra</div>';
          return '<div style="padding:11px 0;border-top:1px solid rgba(128,128,128,.18);">' +
            '<div style="font-weight:700;margin-bottom:3px;">' + esc(l.local) + '</div>' + pos + neg + '</div>';
        }).join('');
      } catch (e) {
        body.innerHTML = '<p style="opacity:.6;">No se pudo cargar.</p>';
      }
    }

    // ---- Estrellas ----
    function paintStars() {
      document.querySelectorAll('#gmFStars .rg-star').forEach((s) =>
        s.classList.toggle('active', parseInt(s.dataset.v, 10) <= stars));
    }
    $('gmFStars').addEventListener('click', (e) => {
      if (!e.target.classList.contains('rg-star')) return;
      stars = parseInt(e.target.dataset.v, 10);
      paintStars();
    });
    $('gmFTexto').addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = (e.target.scrollHeight + 2) + 'px';
    });
    $('gmLocal').addEventListener('change', () => {
      const v = $('gmLocal').value;
      if (v && !$('gmFLocal').value) $('gmFLocal').value = v;
      loadMetrics(); loadHistorial();
    });

    // ---- Generar variantes ----
    $('gmGenerar').addEventListener('click', async () => {
      const local_id = $('gmFLocal').value || $('gmLocal').value;
      const texto = $('gmFTexto').value.trim();
      const cliente = $('gmFCliente').value.trim();
      const fecha = $('gmFFecha').value;
      if (!local_id) { showToast('Elegí un local'); return; }
      if (!texto) { showToast('Pegá el texto de la reseña'); return; }
      if (!stars) { showToast('Marcá las estrellas'); return; }
      if (!fecha) { showToast('Elegí la fecha de la reseña'); return; }

      const btn = $('gmGenerar');
      btn.disabled = true;
      $('gmVariantsWrap').style.display = 'none';
      $('gmLoading').style.display = 'block';
      try {
        const r = await call('/api/admin/resenas/generar', 'POST',
          { local_id, texto, estrellas: stars, cliente_nombre: cliente || null });
        lastGen = {
          local_id, texto, estrellas: stars, cliente_nombre: cliente || null, fecha,
          idioma_detectado: r.idioma_detectado, variantes: r.variantes, modelo_usado: r.modelo_usado,
        };
        renderVariants(r.variantes, r.idioma_detectado);
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; $('gmLoading').style.display = 'none'; }
    });

    function renderVariants(variantes, idioma) {
      const wrap = $('gmVariants');
      wrap.innerHTML = variantes.map((v, i) => `
        <div class="rg-variant" data-i="${i}">
          <div class="rg-variant-head"><span>Opción ${i + 1}</span><span class="rg-variant-tag">${esc(idioma || 'es')}</span></div>
          <textarea class="rg-variant-text" data-i="${i}">${esc(v)}</textarea>
          <div class="rg-variant-actions">
            <button class="rg-btn-ghost" data-act="copy" data-i="${i}">📋 Copiar</button>
            <button class="rg-btn" data-act="use" data-i="${i}">Usar esta</button>
          </div>
        </div>`).join('');
      $('gmVariantsWrap').style.display = 'block';
      wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => handleVariant(b)));
    }

    async function handleVariant(btn) {
      const i = parseInt(btn.dataset.i, 10);
      const ta = $('gmVariants').querySelector(`.rg-variant-text[data-i="${i}"]`);
      const text = ta.value;
      if (btn.dataset.act === 'copy') {
        try { await navigator.clipboard.writeText(text); const o = btn.innerHTML; btn.innerHTML = '✓ Copiado'; setTimeout(() => { btn.innerHTML = o; }, 2000); }
        catch (e) { showToast('No se pudo copiar'); }
        return;
      }
      // act === 'use'
      if (!lastGen) return;
      const original = lastGen.variantes[i];
      const editado = text !== original ? text : null;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        try { await navigator.clipboard.writeText(text); } catch (e) {}
        await call('/api/admin/resenas/guardar', 'POST', {
          local_id: lastGen.local_id, texto_original: lastGen.texto, estrellas: lastGen.estrellas,
          cliente_nombre: lastGen.cliente_nombre, fecha_resena: lastGen.fecha,
          idioma_detectado: lastGen.idioma_detectado, variantes_generadas: lastGen.variantes,
          respuesta_elegida: original, respuesta_editada: editado, modelo_usado: lastGen.modelo_usado,
        });
        showToast('Guardado y copiado al portapapeles');
        $('gmFTexto').value = ''; $('gmFCliente').value = ''; stars = 0; paintStars();
        $('gmVariantsWrap').style.display = 'none'; lastGen = null;
        loadMetrics(); loadHistorial();
      } catch (e) { btn.disabled = false; btn.textContent = 'Usar esta'; }
    }

    // ---- Histórico ----
    function buildQs() {
      const local = $('gmHLocal').value || $('gmLocal').value;
      const p = new URLSearchParams();
      if (local) p.set('local_id', local);
      if ($('gmHEstrellas').value) p.set('estrellas', $('gmHEstrellas').value);
      if ($('gmHEstado').value) p.set('estado', $('gmHEstado').value);
      if ($('gmHDesde').value) p.set('desde', $('gmHDesde').value);
      if ($('gmHHasta').value) { const d = new Date($('gmHHasta').value); d.setHours(23, 59, 59, 999); p.set('hasta', d.toISOString()); }
      p.set('limit', H_LIMIT); p.set('offset', hOffset);
      return '?' + p.toString();
    }

    async function loadHistorial() {
      $('gmHBody').innerHTML = '<tr><td colspan="7" class="rg-empty">Cargando…</td></tr>';
      try {
        const r = await call('/api/admin/resenas/historial' + buildQs(), 'GET');
        lastItems = r.items;
        $('gmHCount').textContent = r.total;
        if (!r.items.length) {
          $('gmHBody').innerHTML = '<tr><td colspan="7" class="rg-empty">Sin reseñas</td></tr>';
        } else {
          $('gmHBody').innerHTML = r.items.map((it, idx) => `
            <tr>
              <td>${gmFmtDate(it.fecha_resena)}</td>
              <td>${esc(GM_LOCAL_NAMES[it.local_id] || it.local_id)}</td>
              <td>${esc(it.cliente_nombre || '—')}</td>
              <td><span class="rg-stars-mini">${gmStars(it.estrellas)}</span></td>
              <td><div class="rg-truncate" title="${esc(it.texto_original)}">${esc(it.texto_original)}</div></td>
              <td><span class="rg-badge rg-badge-${esc(it.estado)}">${esc(it.estado)}</span></td>
              <td><button class="rg-btn-ghost" data-idx="${idx}">Ver</button></td>
            </tr>`).join('');
          $('gmHBody').querySelectorAll('button').forEach((b) =>
            b.addEventListener('click', () => openDetail(lastItems[parseInt(b.dataset.idx, 10)])));
        }
        const start = r.total === 0 ? 0 : hOffset + 1;
        const end = Math.min(hOffset + H_LIMIT, r.total);
        $('gmHRango').textContent = `${start}–${end} de ${r.total}`;
        $('gmHPrev').disabled = hOffset === 0;
        $('gmHNext').disabled = end >= r.total;
      } catch (e) {
        $('gmHBody').innerHTML = '<tr><td colspan="7" class="rg-empty">Error al cargar</td></tr>';
      }
    }

    $('gmHAplicar').addEventListener('click', () => { hOffset = 0; loadHistorial(); });
    $('gmHLimpiar').addEventListener('click', () => {
      $('gmHLocal').value = ''; $('gmHEstrellas').value = ''; $('gmHEstado').value = '';
      $('gmHDesde').value = ''; $('gmHHasta').value = ''; hOffset = 0; loadHistorial();
    });
    $('gmHPrev').addEventListener('click', () => { if (hOffset > 0) { hOffset = Math.max(0, hOffset - H_LIMIT); loadHistorial(); } });
    $('gmHNext').addEventListener('click', () => { hOffset += H_LIMIT; loadHistorial(); });

    // ---- Modal detalle / editar (issue 8: Ver permite regenerar/editar) ----
    function openDetail(it) {
      detail = it;
      $('gmDTitle').textContent = `${gmStars(it.estrellas)}  ·  Popular ${GM_LOCAL_NAMES[it.local_id] || it.local_id}`;
      $('gmDMeta').textContent = `${gmFmtDate(it.fecha_resena)}  ·  ${it.cliente_nombre || 'Anónimo'}  ·  ${it.idioma_detectado || '—'}  ·  ${it.estado}`;
      $('gmDOriginal').textContent = it.texto_original;
      $('gmDRespTextarea').value = it.respuesta_editada || it.respuesta_elegida || '';
      $('gmDVariants').innerHTML = '';
      $('gmModal').classList.add('open');
    }
    function closeDetail() { $('gmModal').classList.remove('open'); detail = null; }
    $('gmDClose').addEventListener('click', closeDetail);
    $('gmModal').addEventListener('click', (e) => { if (e.target.id === 'gmModal') closeDetail(); });

    $('gmDRegenerar').addEventListener('click', async () => {
      if (!detail) return;
      const btn = $('gmDRegenerar');
      const o = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
      try {
        const r = await call('/api/admin/resenas/generar', 'POST', {
          local_id: detail.local_id, texto: detail.texto_original,
          estrellas: detail.estrellas, cliente_nombre: detail.cliente_nombre || null,
        });
        $('gmDVariants').innerHTML = r.variantes.map((v, i) => `
          <div class="rg-variant" data-i="${i}">
            <div class="rg-variant-head"><span>Opción ${i + 1}</span><span class="rg-variant-tag">${esc(r.idioma_detectado || 'es')}</span></div>
            <textarea class="rg-variant-text" data-i="${i}">${esc(v)}</textarea>
            <div class="rg-variant-actions"><button class="rg-btn-ghost" data-i="${i}">Usar en respuesta</button></div>
          </div>`).join('');
        $('gmDVariants').querySelectorAll('button').forEach((b) =>
          b.addEventListener('click', () => {
            const ta = $('gmDVariants').querySelector(`.rg-variant-text[data-i="${b.dataset.i}"]`);
            $('gmDRespTextarea').value = ta.value;
          }));
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = o; }
    });

    $('gmDGuardar').addEventListener('click', async () => {
      if (!detail) return;
      const nueva = $('gmDRespTextarea').value.trim();
      if (!nueva) { showToast('La respuesta no puede quedar vacía'); return; }
      const btn = $('gmDGuardar');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await call('/api/admin/resenas/' + detail.id, 'PUT', { respuesta_editada: nueva, estado: 'respondida' });
        try { await navigator.clipboard.writeText(nueva); } catch (e) {}
        showToast('Cambios guardados y copiados');
        closeDetail(); loadMetrics(); loadHistorial();
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });

    // Carga inicial
    loadPanel();
    loadVoz();
    loadMetrics();
    loadHistorial();
  }

  /* ==================== PAUTA ==================== */
  let pautaLoaded = false;
  let pautaData = null;

  async function loadPauta() {
    pautaLoaded = true;
    try {
      renderPauta(await api('/api/admin/pauta'));
    } catch (e) {
      pautaLoaded = false;
      $('pautaNotice').hidden = false;
      $('pautaNotice').textContent = 'No se pudo cargar la pauta: ' + e.message;
    }
  }

  function renderPauta(d) {
    const notice = $('pautaNotice'), body = $('pautaBody');
    if (!d || !d.configurado) {
      notice.hidden = false;
      notice.innerHTML = 'Meta Ads no está conectado. Falta cargar el token de la API de Marketing (<code>META_ADS_TOKEN</code>) en el servidor.';
      body.hidden = true; return;
    }
    if (d.sinDatos || !d.campañas || !d.campañas.length) {
      notice.hidden = false;
      notice.textContent = 'Conectado, pero todavía no hay datos guardados. Tocá «Actualizar» para traer el primer snapshot.';
      body.hidden = true; return;
    }
    notice.hidden = true; body.hidden = false;
    pautaData = d;
    $('pautaFecha').textContent = 'Datos al ' + d.dia;
    poblarSelector();
  }

  // Llena el selector. Por defecto solo campañas activas; con el check, todas.
  function poblarSelector() {
    if (!pautaData) return;
    const verTodas = $('pautaVerTodas') && $('pautaVerTodas').checked;
    const sel = $('pautaCampSel');
    const items = pautaData.campañas
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => verTodas || c.activa !== false);
    sel.innerHTML = items.map(({ c, i }) =>
      `<option value="${i}">${esc(c.name)}${c.activa === false ? ' · pausada' : ''}</option>`).join('');
    renderCampaña(items.length ? +sel.value : -1);
  }

  function renderCampaña(idx) {
    const c = pautaData && pautaData.campañas[idx];
    if (!c) return;
    const t = c.total;
    $('ptSpend').textContent = '€' + fmtNum(Math.round(t.spend));
    $('ptReach').textContent = fmtNum(t.reach);
    $('ptImpr').textContent = fmtNum(t.impressions);
    $('ptLink').textContent = fmtNum(t.link_clicks);
    $('ptLanding').textContent = fmtNum(t.landing_views);
    $('ptFind').textContent = fmtNum(t.find_location);
    $('pautaLocales').innerHTML = c.locales.map(renderLocalPauta).join('') ||
      '<p class="pauta-hint">Sin conjuntos por local en esta campaña.</p>';
  }

  // "Russafa_milanesa", "Santa Clara_ñoqui - Copia" → "Milanesa" / "Ñoqui".
  function limpiarCreativo(name) {
    const base = String(name || '').replace(/\s*-\s*copia\s*$/i, '').split('_').pop().trim();
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : '—';
  }

  function renderLocalPauta(l) {
    const t = l.total;
    const maxLink = Math.max(0, ...l.creativos.map((x) => x.link_clicks));
    const rows = l.creativos.map((cr) => {
      const lead = cr.link_clicks === maxLink && maxLink > 0;
      return `<tr class="${lead ? 'lead' : ''}">
        <td>${esc(limpiarCreativo(cr.name))}${lead ? ' ★' : ''}</td>
        <td>€${fmtNum(Math.round(cr.spend))}</td>
        <td>${fmtNum(cr.link_clicks)}</td>
        <td>${fmtNum(cr.landing_views)}</td>
        <td>${fmtNum(cr.find_location)}</td>
        <td>${cr.ctr}%</td>
        <td>€${cr.cpl}</td>
      </tr>`;
    }).join('');
    return `<div class="pauta-local">
      <div class="pauta-local-head">
        <h3>${esc(l.name)}</h3>
        <span>€${fmtNum(Math.round(t.spend))} · ${fmtNum(t.reach)} personas · ${fmtNum(t.link_clicks)} clics · ${fmtNum(t.landing_views)} entraron</span>
      </div>
      <table class="pauta-table">
        <thead><tr><th>Imagen</th><th>Invertido</th><th>Clics al menú</th><th>Entraron</th><th>Cómo llegar</th><th>CTR enlace</th><th>€/clic</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7">—</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  async function onPautaRefresh() {
    const btn = $('pautaRefresh');
    btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Actualizando…';
    try {
      await api('/api/admin/pauta/snapshot', 'POST', {});
      pautaLoaded = false;
      await loadPauta();
    } catch (e) {
      $('pautaNotice').hidden = false;
      $('pautaNotice').textContent = 'No se pudo actualizar: ' + e.message +
        '\n\nMeta limita las llamadas en modo desarrollo. Probá de nuevo en un rato.';
    } finally { btn.disabled = false; btn.textContent = prev; }
  }

  /* ==================== SECCIONES (sidebar) ==================== */
  const SECTION_LABELS = {
    'cal-mkt': 'Calendario', 'planificacion': 'Planificación',
    'google-maps': 'Google Maps',
    'inteligencia': 'Inteligencia', 'analitica': 'Analítica', 'pauta': 'Pauta',
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
    if (section === 'pauta' && !pautaLoaded) loadPauta();
    if (section === 'generador' && !genLoaded) loadGen();
    if (section === 'google-maps' && !resenasLoaded) loadResenas();
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
    // Reseñas (Google Maps) es solo-dueño: ocultar para quien no sea full admin.
    if (!me.isFullAdmin) {
      const gmBtn = document.querySelector('.dash-nav-item[data-section="google-maps"]');
      if (gmBtn) gmBtn.hidden = true;
      const gmSec = document.getElementById('section-google-maps');
      if (gmSec) gmSec.remove();
      // Pauta también es solo-dueño (datos de inversión publicitaria).
      const ptBtn = document.querySelector('.dash-nav-item[data-section="pauta"]');
      if (ptBtn) ptBtn.hidden = true;
      const ptSec = document.getElementById('section-pauta');
      if (ptSec) ptSec.remove();
    }
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
    $('heroIaToggle').addEventListener('click', () => { $('heroIaPanel').hidden = !$('heroIaPanel').hidden; });
    $('heroIaSugerir').addEventListener('click', onHeroIaSugerir);
    $('heroIaGen').addEventListener('click', onHeroIaGen);

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
    $('genFormato').addEventListener('change', onGenFormatoChange);
    $('genPGo').addEventListener('click', onGenPortadaAuto);
    if ($('genPRehacer')) $('genPRehacer').addEventListener('click', () => onGenPortada('generar', true));
    $('genPFrameX').addEventListener('click', clearGenPFrame);
    $('genPFile').addEventListener('change', onGenPFile);
    document.addEventListener('paste', onGenPPaste);
    // La caja de pegado es contenteditable solo para recibir el paste: bloqueamos el
    // tipeo (todo lo que no sea un atajo Ctrl/Cmd) para que no se ensucie.
    $('genPDrop').addEventListener('keydown', (e) => { if (!(e.ctrlKey || e.metaKey)) e.preventDefault(); });
    $('genPTema').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onGenPortadaAuto(); } });
    $('genChips').addEventListener('click', onGenChip);
    $('genInput').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('genForm').requestSubmit(); }
    });
    $('genSyncBtn').addEventListener('click', onGenSync);
    $('genBrandBtn').addEventListener('click', openBkModal);
    $('bkCancel').addEventListener('click', () => { $('bkModal').hidden = true; });
    $('bkGuardar').addEventListener('click', onBkGuardar);
    $('genComponerBtn').addEventListener('click', onGenComponer);
    // El caption editado a mano tiene que volver al estado: sin esto, un ajuste
    // posterior manda el caption viejo y pisa la edición del usuario.
    $('genCaption').addEventListener('input', () => { genState.caption = $('genCaption').value; });
    $('genPlacas').addEventListener('click', onGenPlacaClick);
    $('genPlacas').addEventListener('input', onGenPlacaInput);
    $('genPlacas').addEventListener('change', onGenPlacaInput);
    $('iaCancel').addEventListener('click', closeIaModal);
    $('iaGenerar').addEventListener('click', confirmIaModal);
    $('iaAfinar').addEventListener('click', onAfinarPrompt);
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
    $('anIgRefresh').addEventListener('click', (e) => { e.stopPropagation(); onIgRefresh(); });
    $('anMetaRefresh').addEventListener('click', (e) => { e.stopPropagation(); onMetaRefresh(); });
    $('anCartaGoto').addEventListener('click', () => switchSection('menu'));

    // Pauta (solo dueño; la sección se elimina arriba si no es full admin)
    if (me.isFullAdmin) {
      $('pautaRefresh').addEventListener('click', onPautaRefresh);
      $('pautaCampSel').addEventListener('change', (e) => renderCampaña(+e.target.value));
      $('pautaVerTodas').addEventListener('change', poblarSelector);
    }
    // Acordeón de Analítica: cada cabecera abre/cierra su tarjeta.
    document.querySelectorAll('#section-analitica .an-acc-head').forEach((h) =>
      h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
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
