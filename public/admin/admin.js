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
    if (!res.ok) throw new Error(json.error || (res.status === 504 || res.status === 502
      ? 'La espera se cortó porque tardó demasiado (el motor pudo haber seguido trabajando). Tocá el botón de nuevo para reintentar.'
      : 'Error del servidor.'));
    return json;
  }

  // Los trabajos largos del generador corren de fondo en el servidor: el POST
  // devuelve { jobId } al instante y acá se pregunta cada 4s hasta que termina.
  // Ningún timeout de conexión puede matar la generación: la conexión larga no
  // existe más. Tolera hasta 3 fallos de red seguidos (wifi parpadeando).
  async function apiJob(path, body) {
    const out = await api(path, 'POST', body);
    if (!out.jobId) return out; // compatibilidad: respuesta directa
    let fallos = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000));
      let j;
      try { j = await api('/api/admin/gen/job/' + out.jobId); fallos = 0; }
      catch (e) { if (++fallos >= 3) throw e; continue; }
      if (j.estado === 'listo') return j.resultado;
      if (j.estado === 'error') throw new Error(j.error || 'La generación falló.');
    }
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
      $('genAvanzado').hidden = true;
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
    $('genAvanzado').hidden = false; // plegado: el que quiera afinar, lo abre
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
      const out = await apiJob('/api/admin/gen/copy', { instruccion, formato: genState.formato, modo: genState.modo });
      genState.placas = (out.placas || []).map((p) => ({
        titulo: p.titulo || '', acento: p.acento || '', bajada: p.bajada || '',
        cta: p.cta || '', lugar: p.lugar || '', estilo: p.estilo || 'clasico',
        fotoUrl: p.fotoUrl || null, driveId: p.driveId || null,
        fotoProductoUrl: p.fotoProductoUrl || null,
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
      // Flujo de un paso (13/7): el copy pasa directo a componer — el dueño ve
      // la placa terminada, no el formulario (queda plegado en Ajustes avanzados).
      btn.textContent = 'Copy listo — componiendo las piezas…';
      await onGenComponer();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🎬 Generar placas';
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
      $('genPlacas').innerHTML = ''; $('genActions').hidden = true; $('genAvanzado').hidden = true;
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
      const out = await apiJob('/api/admin/gen/portada', body);
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
      alert('La placa ' + (sinFoto + 1) + ' no tiene foto. Abrí «🔧 Ajustes avanzados» y elegila del banco (📁) o generala con IA (🤖).');
      return;
    }
    const btn = $('genComponerBtn');
    btn.disabled = true;
    const hayCompleta = genState.placas.some((p) => p.modoIA === 'completa');
    btn.textContent = hayCompleta
      ? 'Diseñando con IA y verificando… (~40 s por placa)'
      : 'Componiendo… (~' + (genState.placas.length * 8) + ' s)';
    try {
      const out = await apiJob('/api/admin/gen/piezas', {
        formato: genState.formato,
        placas: genState.placas.map((p) => ({
          titulo: p.titulo, acento: p.acento, bajada: p.bajada, cta: p.cta, lugar: p.lugar,
          banderas: (p.banderas && p.banderas.length) ? p.banderas : undefined,
          evento: p.evento || undefined,
          estilo: p.estilo || undefined,
          driveId: p.driveId || undefined,
          fotoUrl: p.fotoUrl || undefined, iaPrompt: p.iaPrompt || undefined,
          fotoProductoUrl: p.fotoProductoUrl || undefined, // referencia de producto real (modo IA)
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
          _edicionIA: p._edicionIA || undefined, // edición quirúrgica: editar la placa existente
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
        delete genState.placas[i]._edicionIA; // consumida por este componer
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
      btn.textContent = '🎨 Recomponer con mis cambios';
    }
  }

  // Ajuste conversacional sobre el resultado: el usuario pide cambios y se rehace.
  async function onGenAjustar() {
    const instruccion = $('genAjusteInput').value.trim();
    if (!instruccion) return;
    if (!genState.placas.length) return;
    const btn = $('genAjusteBtn');
    btn.disabled = true;
    // Cronómetro con fase: un ajuste completo (textos + imagen PRO + control)
    // tarda minutos — sin esto parece colgado y el usuario pierde la confianza.
    const t0 = Date.now();
    let fase = 'Ajustando textos';
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      btn.textContent = fase + '… ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
    btn.textContent = fase + '…';
    try {
      const out = await apiJob('/api/admin/gen/ajustar', {
        instruccion,
        formato: genState.formato,
        caption: genState.caption,
        placas: genState.placas,
      });
      fase = 'Regenerando la imagen (2-4 min, el control puede reintentarla)';
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
      clearInterval(tick);
      btn.disabled = false;
      btn.textContent = 'Aplicar y rehacer';
    }
  }

  /* ============ GENERADOR DE HISTORIAS v2 (14/7) ============
     El dueño da la información (idea o textual); el motor nuevo (gen2) dirige,
     pinta, controla y pone el logo por código. Retoques quirúrgicos sobre la
     imagen existente. El generador viejo quedó oculto (#genViejo). */
  const gen2State = { tipo: 'informativo', url: null, textos: [] };

  function gen2Cron(btn, fase) {
    const t0 = Date.now();
    btn.disabled = true;
    btn.textContent = fase + '…';
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      btn.textContent = fase + '… ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
    return (label) => { clearInterval(tick); btn.disabled = false; btn.textContent = label; };
  }

  function gen2Render(out) {
    gen2State.url = out.url;
    gen2State.textos = out.textos || [];
    $('gen2Img').src = out.url;
    $('gen2Link').href = out.url;
    const avisos = out.avisos || [];
    $('gen2Avisos').hidden = !avisos.length;
    $('gen2Avisos').textContent = avisos.join(' · ');
    $('gen2Result').hidden = false;
    $('gen2Result').scrollIntoView({ behavior: 'smooth' });
  }

  async function onGen2Generar() {
    const texto = $('gen2Texto').value.trim();
    if (!texto) { alert('Contame qué querés comunicar (con fecha, hora y local si aplica).'); return; }
    const modo = (document.querySelector('input[name="gen2Modo"]:checked') || {}).value || 'idea';
    const fin = gen2Cron($('gen2Btn'), 'Dirigiendo, pintando y revisando (2-4 min)');
    try {
      const out = await apiJob('/api/admin/gen2/historia', { tipo: gen2State.tipo, modo, texto });
      gen2Render(out);
    } catch (err) {
      alert(err.message);
    } finally {
      fin('🎬 Generar historia');
    }
  }

  async function onGen2Retoque() {
    const instruccion = $('gen2Retoque').value.trim();
    if (!instruccion || !gen2State.url) return;
    const fin = gen2Cron($('gen2RetoqueBtn'), 'Retocando (1-3 min)');
    try {
      const out = await apiJob('/api/admin/gen2/retoque', {
        url: gen2State.url, instruccion, textos: gen2State.textos,
      });
      gen2Render(out);
      $('gen2Retoque').value = '';
    } catch (err) {
      alert(err.message);
    } finally {
      fin('Aplicar retoque');
    }
  }

  /* ==== Generador de portadas de reel (15/7): modelos fijos del dueño.
     La IA pinta, el código posiciona (tipografías, logo, zona segura 3:4). */
  const portadaState = { modelo: 'auto', foto: null };

  function portadaCargarArchivo(f) {
    if (!f || !f.type || !f.type.startsWith('image/')) return;
    const lector = new FileReader();
    lector.onload = () => {
      // Achicar en el navegador: alcanza con 1440px de ancho y viaja liviano.
      const img = new Image();
      img.onload = () => {
        const esc = Math.min(1, 1440 / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * esc);
        c.height = Math.round(img.height * esc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        portadaState.foto = c.toDataURL('image/jpeg', 0.92);
        $('portadaPrevImg').src = portadaState.foto;
        $('portadaPrev').hidden = false;
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(f);
  }

  function onPortadaFoto() {
    portadaState.foto = null;
    $('portadaPrev').hidden = true;
    portadaCargarArchivo(($('portadaFoto').files || [])[0]);
  }

  // Pegar la captura con Ctrl+V en cualquier lado de la pestaña del generador.
  function onPortadaPaste(e) {
    if (!$('portadaBtn')) return;
    const items = (e.clipboardData || {}).items || [];
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        e.preventDefault();
        portadaCargarArchivo(it.getAsFile());
        $('portadas').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }

  async function onPortadaGenerar() {
    const texto = $('portadaTexto').value.trim();
    if (!portadaState.foto) { alert('Subí el frame o la captura del reel.'); return; }
    if (!texto) { alert('Escribí el texto de la portada (ej: "flan mixto").'); return; }
    const fin = gen2Cron($('portadaBtn'), 'Limpiando, componiendo y revisando (1-3 min)');
    try {
      const out = await apiJob('/api/admin/gen2/portada', {
        modelo: portadaState.modelo, texto, foto: portadaState.foto,
      });
      $('portadaImg').src = out.url;
      $('portadaLink').href = out.url;
      const avisos = out.avisos || [];
      $('portadaAvisos').hidden = !avisos.length;
      $('portadaAvisos').textContent = avisos.join(' · ');
      $('portadaResult').hidden = false;
      $('portadaResult').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert(err.message);
    } finally {
      fin('🎬 Generar portada');
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

  // Ajusta un textarea al alto real de su contenido (con tope, para no empujar
  // los botones fuera de pantalla si alguien pega un texto larguísimo).
  function gmAutoAlto(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(340, Math.max(96, ta.scrollHeight + 2)) + 'px';
  }

  // Franja de publicación de una novedad, siempre en hora de España.
  function gmFmtFranja(iso) {
    if (!iso) return 'sin fecha';
    return new Date(iso).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
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

    // ---- Rango global de fechas (afecta métricas e insights) ----
    function rangoQs() {
      const p = new URLSearchParams();
      const local = $('gmLocal').value;
      if (local) p.set('local_id', local);
      if ($('gmRDesde').value) p.set('desde', $('gmRDesde').value);
      else p.set('desde', '2015-01-01'); // "Todo": sin preset activo = histórico completo
      if ($('gmRHasta').value) p.set('hasta', $('gmRHasta').value);
      return '?' + p.toString();
    }
    document.querySelectorAll('#section-google-maps .rg-preset').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#section-google-maps .rg-preset').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const days = parseInt(b.dataset.days, 10);
        if (days > 0) {
          const d = new Date(Date.now() - days * 24 * 3600 * 1000);
          $('gmRDesde').value = d.toISOString().slice(0, 10);
          $('gmRHasta').value = '';
        } else {
          $('gmRDesde').value = ''; $('gmRHasta').value = '';
        }
        aplicarRangoGlobal();
      }));
    // El rango global discrimina TODA la sección: métricas, salud por local,
    // pendientes, insights y también el histórico (le copia las fechas).
    function aplicarRangoGlobal() {
      $('gmHDesde').value = $('gmRDesde').value;
      $('gmHHasta').value = $('gmRHasta').value;
      hOffset = 0;
      resetMenciones();
      loadMetrics(); loadInsights(); loadPanel(); loadPend(); loadHistorial(); loadRendimiento();
    }

    $('gmRAplicar').addEventListener('click', () => {
      document.querySelectorAll('#section-google-maps .rg-preset').forEach((x) => x.classList.remove('active'));
      aplicarRangoGlobal();
    });

    // ---- Métricas del período ----
    async function loadMetrics() {
      try {
        const m = await call('/api/admin/resenas/metricas' + rangoQs(), 'GET');
        $('gmTotal').textContent = m.total_mes;
        $('gmResp').textContent = m.respondidas_mes + ' / ' + m.pendientes_mes;
        $('gmTasa').textContent = m.tasa_respuesta != null ? m.tasa_respuesta + '%' : '—';
        $('gmMedia').textContent = m.puntuacion_media_mes ? m.puntuacion_media_mes.toFixed(2).replace('.', ',') : '—';
        $('gmTiempo').textContent = m.tiempo_medio_respuesta_horas ? String(m.tiempo_medio_respuesta_horas).replace('.', ',') + ' h' : '—';
        const d = m.distribucion_estrellas || {};
        $('gmDistrib').textContent = `5★:${d[5] || 0}  4★:${d[4] || 0}  3★:${d[3] || 0}  2★:${d[2] || 0}  1★:${d[1] || 0}`;
      } catch (e) { /* toast ya */ }
    }

    // ---- Pendientes de responder (lo accionable del día) ----
    async function loadPend() {
      const body = $('gmPendBody');
      if (!body) return;
      try {
        const local = $('gmLocal').value;
        const qs = '?estado=pendiente&limit=6' + (local ? '&local_id=' + local : '') +
          ($('gmRDesde').value ? '&desde=' + $('gmRDesde').value : '') +
          ($('gmRHasta').value ? '&hasta=' + $('gmRHasta').value : '');
        const r = await call('/api/admin/resenas/historial' + qs, 'GET');
        $('gmPendCount').textContent = r.total;
        if (!r.items.length) {
          body.innerHTML = '<div class="rg-empty">Sin pendientes. 🎉</div>';
          return;
        }
        body.innerHTML = r.items.map((it, idx) => {
          const borrador = it.google_review_id && (it.respuesta_editada || it.respuesta_elegida);
          const accion = borrador
            ? `<textarea class="rg-textarea" data-pend-txt="${idx}" style="margin-top:8px;">${esc(borrador)}</textarea>
               <div class="act"><button class="rg-btn" data-pub="${idx}">📤 Publicar</button><button class="rg-btn-ghost" data-idx="${idx}">Más opciones</button></div>`
            : `<div class="act"><button class="${it.estrellas <= 3 ? 'rg-btn' : 'rg-btn-ghost'}" data-idx="${idx}">Responder</button></div>`;
          return `
          <div class="gm-pcard${it.estrellas <= 3 ? ' neg' : ''}">
            <div class="who"><span><span class="rg-stars-mini">${gmStars(it.estrellas)}</span> · ${esc(GM_LOCAL_NAMES[it.local_id] || it.local_id)}</span><span>${gmFmtDate(it.fecha_resena)}</span></div>
            <div class="txt">${esc(it.texto_original || '(reseña sin texto, solo estrellas)')}</div>
            ${accion}
          </div>`;
        }).join('');
        body.querySelectorAll('button[data-idx]').forEach((b) =>
          b.addEventListener('click', () => openDetail(r.items[parseInt(b.dataset.idx, 10)])));
        body.querySelectorAll('button[data-pub]').forEach((b) =>
          b.addEventListener('click', async () => {
            const i = parseInt(b.dataset.pub, 10);
            const it = r.items[i];
            const texto = body.querySelector('[data-pend-txt="' + i + '"]').value.trim();
            if (!texto) { showToast('La respuesta no puede quedar vacía'); return; }
            if (!confirm('La respuesta se publica en la ficha PÚBLICA de Google. ¿Publicar?')) return;
            b.disabled = true; b.textContent = 'Publicando…';
            try {
              await call('/api/admin/resenas/' + it.id, 'PUT', { respuesta_editada: texto });
              await call('/api/admin/resenas/' + it.id + '/publicar', 'POST');
              showToast('✓ Respuesta publicada en Google');
              loadPend(); loadMetrics(); loadHistorial();
            } catch (e) { b.disabled = false; b.textContent = '📤 Publicar'; }
          }));
      } catch (e) {
        body.innerHTML = '<div class="rg-empty">No se pudo cargar.</div>';
      }
    }

    // ---- Salud por local: tarjetas (estimación pública + exactos del histórico) ----
    function spark(evolucion) {
      if (!evolucion || evolucion.length < 2) return '';
      // SVG normalizado al rango del propio local (escala absoluta aplanaría todo).
      const v = evolucion.map((p) => p.media);
      const W = 64, H = 22, P = 3;
      const mn = Math.min(...v), mx = Math.max(...v), r = (mx - mn) || 1;
      const pts = v.map((n, i) => {
        const x = P + i * (W - 2 * P) / (v.length - 1);
        const y = H - P - ((n - mn) / r) * (H - 2 * P);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      const last = pts[pts.length - 1].split(',');
      const title = evolucion.map((p) => p.mes + ': ' + p.media + '★ (' + p.n + ')').join('\n');
      return '<svg width="64" height="22" viewBox="0 0 64 22" style="vertical-align:middle;"><title>' + esc(title) + '</title>' +
        '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#b97f1c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>' +
        '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.2" fill="#b97f1c"/></svg>';
    }

    // Rango REAL elegido por el usuario (sin el default 2015 de rangoQs):
    // solo manda desde/hasta si hay algo cargado en los inputs.
    function rangoRealQs() {
      const p = new URLSearchParams();
      if ($('gmRDesde').value) p.set('desde', $('gmRDesde').value);
      if ($('gmRHasta').value) p.set('hasta', $('gmRHasta').value);
      const s = p.toString();
      return s ? '?' + s : '';
    }

    // ---- Rendimiento oficial (Performance API) ----
    const GM_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    function mesTxt(iso) {  // '2026-04' → 'abr 2026'
      const [a, m] = String(iso).split('-');
      return GM_MESES[parseInt(m, 10) - 1] + ' ' + a;
    }
    function mesesTxt(desde, hasta) {
      return desde === hasta ? mesTxt(desde) : mesTxt(desde) + ' – ' + mesTxt(hasta);
    }

    async function loadRendimiento() {
      const cards = $('gmPerfCards'), kwBody = $('gmPerfKwBody');
      if (!cards) return;
      try {
        const p = new URLSearchParams();
        if ($('gmLocal').value) p.set('local_id', $('gmLocal').value);
        if ($('gmRDesde').value) p.set('desde', $('gmRDesde').value);
        if ($('gmRHasta').value) p.set('hasta', $('gmRHasta').value);
        const d = await api('/api/admin/google/rendimiento' + (p.toString() ? '?' + p.toString() : ''));
        const pct = (parte, todo) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
        const card = (label, val, sub) =>
          '<div class="rg-metric"><div class="rg-metric-label">' + label + '</div>' +
          '<div class="rg-metric-value">' + fmtNum(val) + '</div>' +
          (sub ? '<div class="rg-metric-sub">' + sub + '</div>' : '') + '</div>';
        const partes = [
          card('👀 Vistas del perfil', d.vistas_perfil,
            pct(d.vistas_maps, d.vistas_perfil) + '% Maps · ' + pct(d.vistas_busqueda, d.vistas_perfil) + '% Búsqueda · ' + pct(d.vistas_movil, d.vistas_perfil) + '% móvil'),
          card('📞 Llamadas', d.llamadas, null),
          card('🧭 Cómo llegar', d.como_llegar, null),
          card('🌐 Clicks a la web', d.clicks_web, null),
          card('💬 Chats', d.chats, null),
          card('📅 Reservas', d.reservas, null),
        ];
        if (d.pedidos_comida > 0) partes.push(card('🛵 Pedidos de comida', d.pedidos_comida, null));
        if (d.clicks_menu > 0) partes.push(card('📖 Clicks al menú', d.clicks_menu, null));
        cards.innerHTML = partes.join('');
        const quien = d.locales.length > 1 ? 'todos los locales' : (GM_LOCAL_NAMES[d.locales[0]] || d.locales[0]);
        // Google solo publica búsquedas por mes cerrado → el período puede ser
        // más corto que el rango elegido; decirlo para que no confunda.
        $('gmPerfKwNota').textContent = '(' + quien + (d.busquedas_desde ? ' · ' + mesesTxt(d.busquedas_desde, d.busquedas_hasta) : '') + ')';
        kwBody.innerHTML = (d.busquedas && d.busquedas.length)
          ? '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + d.busquedas.map((k) =>
              '<span style="background:var(--rg-input);border:1px solid var(--rg-border);border-radius:16px;padding:5px 12px;font-size:12.5px;">' +
              esc(k.termino) + ' <b style="color:var(--gold);">' + (k.aproximado ? '~' : '') + fmtNum(k.veces) + '</b></span>').join('') + '</div>'
          : '<div class="rg-empty">Sin datos de búsquedas todavía.</div>';
      } catch (e) {
        cards.innerHTML = '<div class="rg-empty" style="grid-column:1/-1;">No se pudo cargar el rendimiento.</div>';
        kwBody.innerHTML = '';
      }
    }

    async function loadPanel() {
      const body = $('gmPanelBody');
      if (!body) return;
      try {
        const [d, sal] = await Promise.all([
          call('/api/admin/analitica/google', 'GET'),
          api('/api/admin/resenas/salud' + rangoRealQs()).catch(() => null),
        ]);
        if (!d || !d.configurado || !(d.locales || []).length) {
          body.innerHTML = '<div class="rg-empty">Todavía no hay datos de Google. Se cargan solos.</div>';
          return;
        }
        const salud = (sal && sal.locales) || {};
        const enRango = !!(sal && sal.rango);
        const localSel = $('gmLocal').value;
        const visibles = localSel ? d.locales.filter((l) => l.slug === localSel) : d.locales;
        body.innerHTML = visibles.map((l) => {
          const s = salud[l.slug] || {};
          const nu = l.nuevas7 != null ? l.nuevas7 : l.nuevas30;
          const nuTxt = nu == null ? ''
            : (nu > 0 ? '<span><b>+' + nu + '</b> esta semana</span>'
              : '<span><b style="color:#c73a2e;">' + nu + '</b> esta semana</span>');

          const chip = (s.exacto && s.tasa_respuesta != null)
            ? '<span class="gm-chip ' + (s.tasa_respuesta >= 80 ? 'ok' : 'warn') + '">' + s.tasa_respuesta + '% resp.</span>'
            : (enRango ? '' : '<span class="gm-chip est">estimado</span>');

          const rating = s.exacto
            ? '<div class="gm-crating">' + s.media.toFixed(2).replace('.', ',') + '<small>★</small></div>'
            : (enRango
              ? '<div class="gm-crating dim">—</div>'
              : '<div class="gm-crating dim">' + String(l.rating).replace('.', ',') + '<small>★</small></div>');

          const total = fmtNum(s.exacto ? s.total : (enRango ? 0 : l.reviews)) + (enRango ? ' reseñas en el período' : ' reseñas');

          let barra = '';
          if (enRango) {
            barra = ''; // el "camino a X★" es del histórico completo, no de un rango
          } else if (s.exacto && s.faltan_5 == null) {
            barra = '<div class="gm-cbar"><div class="lbl"><span>🏆 En el tope</span><span></span></div>' +
              '<div class="gm-ctrack"><div class="gm-cfill" style="width:100%"></div></div></div>';
          } else if (s.exacto) {
            const pct = Math.max(4, Math.min(96, Math.round(((s.media - (s.target - 0.1)) / 0.1) * 100)));
            barra = '<div class="gm-cbar"><div class="lbl"><span>Camino a <b>' + String(s.target).replace('.', ',') + '★</b></span>' +
              '<span>faltan ' + fmtNum(s.faltan_5) + ' de 5★</span></div>' +
              '<div class="gm-ctrack"><div class="gm-cfill" style="width:' + pct + '%"></div></div></div>';
          } else if (l.faltan != null) {
            barra = '<div class="gm-cbar"><div class="lbl"><span>Camino a <b>' + String(l.target).replace('.', ',') + '★</b></span>' +
              '<span>~' + fmtNum(l.faltan) + ' (estimado)</span></div>' +
              '<div class="gm-ctrack"><div class="gm-cfill dim" style="width:50%"></div></div></div>';
          }

          return '<div class="gm-card">' +
            '<div class="gm-chead"><div><div class="gm-cname">' + esc(l.name) + '</div>' +
            '<div class="gm-ccity">' + esc(l.city) + ' · ' + total + (s.exacto ? ' <span class="rg-exacto">exacto</span>' : '') + '</div></div>' +
            chip + '</div>' +
            '<div class="gm-crow">' + rating +
            '<div class="gm-cmeta">' + nuTxt + spark(s.evolucion) + '</div></div>' +
            barra +
          '</div>';
        }).join('');
      } catch (e) {
        body.innerHTML = '<div class="rg-empty">No se pudo cargar.</div>';
      }
    }

    // ---- Insights IA: temas, empleados, platos, idiomas ----
    function insBloque(titulo, items, fmt) {
      if (!items || !items.length) return '';
      return '<div style="margin-bottom:14px;"><div style="font-weight:700;margin-bottom:6px;font-size:13px;">' + titulo + '</div>' +
        items.map(fmt).join('') + '</div>';
    }
    async function loadInsights() {
      const body = $('gmInsightsBody');
      if (!body) return;
      body.innerHTML = '<div class="rg-loading"><div class="rg-spinner"></div><div style="margin-top:10px;">Analizando reseñas con IA…</div></div>';
      try {
        const d = await call('/api/admin/resenas/insights' + rangoQs(), 'GET');
        // Empleados y platos se cuentan sobre TODAS las del rango; los temas los
        // estima la IA sobre la muestra que leyó (por eso el ≈ en esos bloques).
        $('gmInsightsMuestra').textContent = d.muestra
          ? 'muestra: ' + fmtNum(d.muestra) + ' reseñas con texto' +
            (d.analizadas && d.analizadas < d.muestra ? ' · la IA leyó ' + fmtNum(d.analizadas) + ' repartidas en el período' : '')
          : '';
        if (d.sinDatos) {
          body.innerHTML = '<p style="opacity:.6;">Todavía no hay reseñas con texto para analizar en este rango.</p>';
          return;
        }
        const linea = (color, pre) => (x) =>
          '<div style="font-size:13px;line-height:1.7;color:' + color + ';">' + pre + ' ' + esc(x.tema) +
          ' <small style="opacity:.55;" title="estimado por la IA sobre la muestra">≈' + (x.veces || 1) + '</small></div>';
        const cols = [];
        cols.push(insBloque('👍 Lo que valoran', d.positivo, linea('#4a7c3f', '•')));
        cols.push(insBloque('👎 A mejorar', d.negativo, linea('#c73a2e', '•')) ||
          '<div style="margin-bottom:14px;"><div style="font-weight:700;margin-bottom:6px;font-size:13px;">👎 A mejorar</div><div style="opacity:.45;font-size:12.5px;">sin quejas repetidas en la muestra</div></div>');
        // Los empleados NO se muestran acá: viven en la tarjeta "Empleados
        // mencionados" de abajo, con conteo exacto y PDF. Un solo lugar, un
        // solo número.
        cols.push(insBloque('🍕 Platos que la gente nombra', d.platos, (p) =>
          '<div style="font-size:13px;line-height:1.7;">' + esc(p.plato) + ' <small style="opacity:.55;" title="reseñas del período que lo nombran">×' + fmtNum(p.menciones || 0) + '</small></div>'));
        const idi = d.idiomas || {};
        const idiTot = (idi.es || 0) + (idi.en || 0) + (idi.fr || 0) + (idi.otros || 0);
        if (idiTot) {
          const pct = (n) => Math.round((n || 0) / idiTot * 100);
          cols.push('<div><div style="font-weight:700;margin-bottom:6px;font-size:13px;">🌍 Idiomas</div>' +
            '<div style="font-size:13px;line-height:1.7;">🇪🇸 ' + pct(idi.es) + '% · 🇬🇧 ' + pct(idi.en) + '% · 🇫🇷 ' + pct(idi.fr) + '%' +
            (idi.otros ? ' · otros ' + pct(idi.otros) + '%' : '') + '</div></div>');
        }
        body.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;">' +
          cols.filter(Boolean).map((c) => '<div>' + c + '</div>').join('') + '</div>';
      } catch (e) {
        body.innerHTML = '<p style="opacity:.6;">No se pudo cargar el análisis.</p>';
      }
    }

    // ---- Menciones al equipo: ranking + informe PDF por persona ----
    // No se calcula solo al cambiar el rango (cuesta una pasada de IA): se pide
    // con el botón. Lo que se ve en pantalla y lo que sale en el PDF son el
    // mismo cálculo sobre el mismo rango.
    function mencQs(extra) {
      const p = new URLSearchParams(rangoQs().slice(1));
      Object.entries(extra || {}).forEach(([k, v]) => { if (v) p.set(k, v); });
      return '?' + p.toString();
    }

    function resetMenciones() {
      const body = $('gmMencBody');
      if (!body) return;
      body.innerHTML = '';
      $('gmMencPdf').hidden = true;
      $('gmMencRango').textContent = '';
    }

    // El PDF viaja con el Bearer de la sesión: un <a href> pelado devuelve 401.
    async function descargarPdf(url, boton) {
      const antes = boton.textContent;
      boton.disabled = true; boton.textContent = 'Generando…';
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = '/admin/login/'; return; }
        const res = await fetch(url, { headers: { Authorization: 'Bearer ' + session.access_token } });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          showToast('No se pudo generar el PDF: ' + (j.error || res.status));
          return;
        }
        const cd = res.headers.get('content-disposition') || '';
        const m = cd.match(/filename="([^"]+)"/);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = m ? m[1] : 'menciones.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (e) {
        showToast('No se pudo generar el PDF');
      } finally {
        boton.disabled = false; boton.textContent = antes;
      }
    }

    async function loadMenciones() {
      const body = $('gmMencBody');
      if (!body) return;
      body.innerHTML = '<div class="rg-loading"><div class="rg-spinner"></div><div style="margin-top:10px;">Buscando nombres en las reseñas del período…</div></div>';
      $('gmMencPdf').hidden = true;
      try {
        const d = await call('/api/admin/resenas/menciones' + mencQs(), 'GET');
        $('gmMencRango').textContent = d.local + ' · ' + fmtNum(d.totales.conNombre) +
          ' de ' + fmtNum(d.totales.conTexto) + ' reseñas con texto nombran a alguien';
        if (!d.empleados.length) {
          body.innerHTML = '<p style="opacity:.6;">Nadie del equipo aparece nombrado en este período.</p>';
          return;
        }
        const max = d.empleados[0].menciones || 1;
        body.innerHTML = '<div class="gm-menc-lista">' + d.empleados.map((e, i) => {
          const pct = Math.max(4, Math.round(e.menciones / max * 100));
          return '<div class="gm-menc-fila">' +
            '<div class="gm-menc-nombre">' + (i === 0 ? '🥇 ' : '') + esc(e.nombre) + '</div>' +
            '<div class="gm-menc-barra"><span style="width:' + pct + '%;' + (i === 0 ? 'background:var(--gold);' : '') + '"></span></div>' +
            '<div class="gm-menc-num">' + fmtNum(e.menciones) + '</div>' +
            '<button class="rg-btn-ghost" data-emp="' + esc(e.nombre) + '">📄 PDF</button>' +
            '</div>';
        }).join('') + '</div>';
        body.querySelectorAll('button[data-emp]').forEach((b) =>
          b.addEventListener('click', () => descargarPdf('/api/admin/resenas/menciones/pdf' + mencQs({ empleado: b.dataset.emp }), b)));
        $('gmMencPdf').hidden = false;
      } catch (e) {
        body.innerHTML = '<p style="opacity:.6;">No se pudieron calcular las menciones.</p>';
      }
    }

    $('gmMencVer').addEventListener('click', loadMenciones);
    $('gmMencPdf').addEventListener('click', (ev) =>
      descargarPdf('/api/admin/resenas/menciones/pdf' + mencQs(), ev.currentTarget));

    // ---- Conexión con Google (Fase 2: Business Profile API) ----
    async function loadGbp() {
      // Aviso post-OAuth: Google redirige a /admin/?google=ok|error|denegado.
      const qs = new URLSearchParams(location.search);
      if (qs.has('google')) {
        const v = qs.get('google');
        showToast(v === 'ok' ? '✓ Google conectado' : 'No se pudo conectar con Google (' + v + ')');
        history.replaceState(null, '', location.pathname);
      }

      const est = $('gmGbpEstado');
      const bC = $('gmGbpConectar'), bD = $('gmGbpDescubrir'), bS = $('gmGbpSync'), bB = $('gmGbpBackfill');
      [bC, bD, bS, bB].forEach((b) => { b.hidden = true; });
      try {
        const d = await api('/api/admin/google/gbp/estado');
        if (!d.oauth_configurado) {
          est.innerHTML = 'Falta configurar las credenciales OAuth en el servidor (<code>GOOGLE_OAUTH_CLIENT_ID/SECRET</code>).';
          return;
        }
        if (!d.conectado) {
          est.textContent = 'La API de Google está aprobada. Autorizá una vez con la cuenta que administra las fichas y las reseñas se sincronizan solas.';
          bC.hidden = false;
          return;
        }
        const locs = Object.keys(d.locales || {});
        if (!locs.length) {
          est.textContent = 'Conectado ✓ — falta detectar los locales de la cuenta.';
          bD.hidden = false;
          return;
        }
        est.innerHTML = 'Conectado ✓ — sincronizando cada 15 min: <b>' +
          locs.map((s) => esc(GM_LOCAL_NAMES[s] || s)).join(' · ') + '</b>' +
          (d.mapeado_el ? ' <small style="opacity:.6;">(mapeado ' + gmFmtDate(d.mapeado_el) + ')</small>' : '');
        bD.hidden = false; bS.hidden = false; bB.hidden = false;
      } catch (e) {
        est.textContent = 'No se pudo consultar el estado.';
      }
    }

    $('gmGbpConectar').addEventListener('click', async () => {
      try {
        const r = await call('/api/admin/google/oauth/start', 'GET');
        location.href = r.url;
      } catch (e) { /* toast ya */ }
    });

    $('gmGbpDescubrir').addEventListener('click', async () => {
      const btn = $('gmGbpDescubrir');
      btn.disabled = true; btn.textContent = 'Detectando…';
      try {
        const r = await call('/api/admin/google/gbp/descubrir', 'POST');
        const n = Object.keys(r.locales || {}).length;
        showToast(n ? '✓ ' + n + ' locales detectados' : 'No se encontraron locales que coincidan');
        loadGbp();
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = 'Detectar locales'; }
    });

    async function runSync(full, btn, label) {
      btn.disabled = true; btn.textContent = 'Sincronizando…';
      try {
        const r = await call('/api/admin/google/gbp/sync', 'POST', { full });
        const nuevas = (r.resultados || []).reduce((s, x) => s + (x.nuevas || 0), 0);
        const errores = (r.resultados || []).filter((x) => x.error);
        showToast('✓ ' + nuevas + ' reseñas nuevas' + (errores.length ? ' · ' + errores.length + ' locales con error' : ''));
        loadMetrics(); loadHistorial(); loadPend(); loadPanel();
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = label; }
    }
    $('gmGbpSync').addEventListener('click', () => runSync(false, $('gmGbpSync'), 'Sincronizar ahora'));
    $('gmGbpBackfill').addEventListener('click', () => {
      if (!confirm('Trae TODO el histórico de reseñas de Google (miles). Se hace una sola vez y puede tardar unos minutos. ¿Seguir?')) return;
      runSync(true, $('gmGbpBackfill'), 'Traer TODO el histórico');
    });

    // ---- Novedades (Google Posts): cola supervisada ----
    async function loadNovedades() {
      const body = $('gmNovBody'), pub = $('gmNovPub');
      try {
        const d = await api('/api/admin/gbp-posts');
        const pend = d.pendientes || [];
        $('gmNovCount').textContent = pend.length;
        if (!pend.length) {
          body.innerHTML = '<div class="rg-empty">No hay borradores pendientes. Los lunes a las 9:00 se generan solos, o tocá «Generar borradores ahora».</div>';
        } else {
          body.innerHTML = pend.map((p) => (
            '<div style="border:1px solid var(--rg-border);border-radius:var(--rg-radius-sm);padding:14px;margin:10px 0;background:var(--rg-card);" data-nov="' + p.id + '" data-nov-local="' + esc(p.local_id) + '">' +
              '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">' +
                (p.imagen_url ? '<img src="' + esc(p.imagen_url) + '" alt="" style="width:110px;height:110px;object-fit:cover;border-radius:8px;flex:none;">' : '') +
                '<div style="flex:1;min-width:180px;">' +
                  '<div style="font-weight:700;margin-bottom:6px;">' + esc(GM_LOCAL_NAMES[p.local_id] || p.local_id) +
                    ' <small style="opacity:.6;font-weight:400;">' + (p.tipo === 'promo' ? '· promo ' : '') + (p.tema ? '· ' + esc(p.tema) : '') + '</small></div>' +
                  '<textarea class="rg-textarea" data-nov-txt style="width:100%;">' + esc(p.resumen) + '</textarea>' +
                  '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;">' +
                    (p.estado === 'aprobado'
                      ? '<span class="rg-btn-ghost" style="cursor:default;">✓ Agendado</span>'
                      : '<button class="rg-btn" data-nov-prog>Aprobar y agendar</button>') +
                    '<button class="rg-btn-ghost" data-nov-pub>Publicar ya</button>' +
                    '<button class="rg-btn-ghost" data-nov-del>Descartar</button>' +
                  '</div>' +
                  // La franja va afuera del botón: metida adentro, en el móvil el
                  // botón se iba de pantalla.
                  '<small style="display:block;margin-top:7px;opacity:.6;">Sale el <b>' + esc(gmFmtFranja(p.programado_para)) + '</b> · botón del post: ' + (p.cta === 'LEARN_MORE' ? 'Más información' : 'Llamar') + '</small>' +
                '</div>' +
              '</div>' +
            '</div>'
          )).join('');
          // El alto se MIDE sobre el texto ya renderizado, no se estima: el post
          // bilingüe de Benidorm es el doble de largo y con un alto fijo quedaba
          // cortada la mitad en inglés, que es justo lo que hay que revisar.
          body.querySelectorAll('[data-nov-txt]').forEach(gmAutoAlto);
        }
        const pubs = d.publicados || [];
        pub.innerHTML = pubs.length
          ? '<div style="font-size:12px;opacity:.75;line-height:1.9;"><b>Últimos publicados:</b> ' +
            pubs.map((p) => esc(GM_LOCAL_NAMES[p.local_id] || p.local_id) + ' (' + gmFmtDate(p.publicado_en) + ')').join(' · ') + '</div>'
          : '';
      } catch (e) {
        body.innerHTML = '<div class="rg-empty">No se pudo cargar la cola de novedades.</div>';
      }
    }

    $('gmNovBody').addEventListener('input', (e) => {
      if (e.target.hasAttribute && e.target.hasAttribute('data-nov-txt')) gmAutoAlto(e.target);
    });

    $('gmNovBody').addEventListener('click', async (e) => {
      const card = e.target.closest('[data-nov]');
      if (!card) return;
      const id = card.dataset.nov;
      const local = GM_LOCAL_NAMES[card.dataset.novLocal] || card.dataset.novLocal;
      const txt = card.querySelector('[data-nov-txt]').value.trim();
      if (e.target.hasAttribute('data-nov-prog')) {
        if (!txt) { showToast('El texto no puede quedar vacío'); return; }
        const label = e.target.textContent;
        e.target.disabled = true; e.target.textContent = 'Agendando…';
        try {
          const r = await call('/api/admin/gbp-posts/' + id, 'PATCH', { resumen: txt, estado: 'aprobado' });
          showToast('✓ ' + local + ': sale el ' + gmFmtFranja(r && r.programado_para));
          loadNovedades();
        } catch (err2) { e.target.disabled = false; e.target.textContent = label; }
      } else if (e.target.hasAttribute('data-nov-pub')) {
        if (!txt) { showToast('El texto no puede quedar vacío'); return; }
        if (!confirm('La novedad se publica AHORA MISMO en la ficha PÚBLICA de Google de ' + local + '. ¿Publicar?')) return;
        e.target.disabled = true; e.target.textContent = 'Publicando…';
        try {
          await call('/api/admin/gbp-posts/' + id + '/publicar', 'POST', { resumen: txt });
          showToast('✓ Novedad publicada en la ficha de ' + local);
          loadNovedades();
        } catch (err2) { e.target.disabled = false; e.target.textContent = 'Publicar ya'; }
      } else if (e.target.hasAttribute('data-nov-del')) {
        try {
          await call('/api/admin/gbp-posts/' + id, 'PATCH', { estado: 'descartado' });
          loadNovedades();
        } catch (err2) { /* toast ya */ }
      }
    });

    $('gmNovGenerar').addEventListener('click', async () => {
      const btn = $('gmNovGenerar');
      btn.disabled = true; btn.textContent = 'Generando…';
      try {
        const r = await call('/api/admin/gbp-posts/generar', 'POST');
        const n = (r.resultados || []).filter((x) => x.id).length;
        const skips = (r.resultados || []).filter((x) => x.skip).length;
        showToast(n ? '✓ ' + n + ' borradores nuevos' : (skips ? 'Todos los locales ya tienen novedad de esta semana' : 'No se generó nada'));
        loadNovedades();
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = 'Generar borradores ahora'; }
    });

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
      $('gmHLocal').value = v; hOffset = 0;
      loadMetrics(); loadHistorial(); loadPend(); loadInsights(); loadPanel(); loadRendimiento();
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
      $('gmDOriginal').textContent = it.texto_original || '(reseña sin texto, solo estrellas)';
      $('gmDRespTextarea').value = it.respuesta_editada || it.respuesta_elegida || '';
      $('gmDVariants').innerHTML = '';
      // Publicar en Google: solo reseñas que vinieron de la API.
      const pub = $('gmDPublicar');
      pub.hidden = !(it.origen === 'google' && it.google_review_id);
      pub.textContent = it.respuesta_publicada ? '📤 Republicar en Google' : '📤 Publicar en Google';
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
        closeDetail(); loadMetrics(); loadHistorial(); loadPend();
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });

    // Publica la respuesta del textarea en la ficha de Google (guarda antes).
    $('gmDPublicar').addEventListener('click', async () => {
      if (!detail) return;
      const nueva = $('gmDRespTextarea').value.trim();
      if (!nueva) { showToast('La respuesta no puede quedar vacía'); return; }
      if (!confirm('La respuesta se publica en la ficha PÚBLICA de Google. ¿Publicar?')) return;
      const btn = $('gmDPublicar');
      btn.disabled = true; btn.textContent = 'Publicando…';
      try {
        await call('/api/admin/resenas/' + detail.id, 'PUT', { respuesta_editada: nueva });
        await call('/api/admin/resenas/' + detail.id + '/publicar', 'POST');
        showToast('✓ Respuesta publicada en Google');
        closeDetail(); loadMetrics(); loadHistorial(); loadPend();
      } catch (e) { /* toast ya */ }
      finally { btn.disabled = false; btn.textContent = '📤 Publicar en Google'; }
    });

    // ---- Feedback de carga: cada zona "late" mientras se recarga ----
    function cargando(ids, on) {
      ids.forEach((id) => { const el = $(id); if (el) el.classList.toggle('rg-cargando', on); });
    }
    function conCarga(fn, ids) {
      return async function () {
        cargando(ids, true);
        try { return await fn.apply(this, arguments); }
        finally { cargando(ids, false); }
      };
    }
    loadMetrics = conCarga(loadMetrics, ['gmMetricsGrid']);
    loadPanel = conCarga(loadPanel, ['gmPanelBody']);
    loadPend = conCarga(loadPend, ['gmPend']);
    loadNovedades = conCarga(loadNovedades, ['gmNov']);
    loadInsights = conCarga(loadInsights, ['gmInsights']);
    loadHistorial = conCarga(loadHistorial, ['gmHBody']);
    loadRendimiento = conCarga(loadRendimiento, ['gmPerfCards', 'gmPerfKw']);

    // Click en cualquier parte del campo de fecha abre el calendario
    // (por defecto Chrome solo lo abre tocando el iconito).
    document.querySelectorAll('#section-google-maps input[type="date"]').forEach((inp) => {
      inp.addEventListener('click', () => { try { inp.showPicker(); } catch (_) {} });
    });

    // Carga inicial
    loadGbp();
    loadNovedades();
    loadRendimiento();
    loadPend();
    loadPanel();
    loadMetrics();
    loadInsights();
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
    // Generador de historias v2
    if ($('gen2Btn')) {
      document.querySelectorAll('#gen2Tipos .gen2-tipo').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('#gen2Tipos .gen2-tipo').forEach((x) => x.classList.toggle('active', x === b));
        gen2State.tipo = b.dataset.tipo;
      }));
      $('gen2Btn').addEventListener('click', onGen2Generar);
      $('gen2RetoqueBtn').addEventListener('click', onGen2Retoque);
      $('gen2Texto').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onGen2Generar(); }
      });
      $('gen2Retoque').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onGen2Retoque(); }
      });
      // El link lleva al generador de portadas nuevo (tarjeta de abajo).
      $('gen2Portada').addEventListener('click', (e) => {
        e.preventDefault();
        $('portadas').scrollIntoView({ behavior: 'smooth' });
      });
    }
    // Generador de portadas de reel
    if ($('portadaBtn')) {
      document.querySelectorAll('#portadaModelos .gen2-tipo').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('#portadaModelos .gen2-tipo').forEach((x) => x.classList.toggle('active', x === b));
        portadaState.modelo = b.dataset.modelo;
      }));
      $('portadaFoto').addEventListener('change', onPortadaFoto);
      $('portadaBtn').addEventListener('click', onPortadaGenerar);
      $('portadaTexto').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onPortadaGenerar(); }
      });
      document.addEventListener('paste', onPortadaPaste);
    }
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
