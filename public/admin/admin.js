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

  function renderPosts() {
    const list = $('postList');
    if (!posts.length) {
      list.innerHTML = '<p class="empty">No hay posts todavía.</p>';
      return;
    }
    list.innerHTML = posts.map((p) => {
      const pub = p.estado === 'publicado';
      return `
      <div class="promo-row ${pub ? '' : 'inactiva'}">
        <img class="promo-thumb" src="${esc(p.hero_image || '/images/extracted/logo.png')}" alt="" />
        <div class="promo-meta">
          <h3>${esc(p.titulo)}</h3>
          <p>/${esc(p.slug)}/</p>
          <div class="promo-tags">
            <span class="tag ${pub ? 'tag-on' : 'tag-borrador'}">${pub ? 'Publicado' : 'Borrador'}</span>
            <span class="tag tag-lang">${esc((p.idioma || 'es').toUpperCase())}</span>
          </div>
        </div>
        <div class="promo-actions">
          ${pub ? `<a href="${esc(postUrl(p))}" target="_blank" rel="noopener">Ver</a>` : ''}
          <button data-act="pub" data-id="${p.id}">${pub ? 'Despublicar' : 'Publicar'}</button>
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
    f.estado.value = post ? (post.estado || 'borrador') : 'borrador';
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
      } else if (act === 'pub') {
        const nuevo = p.estado === 'publicado' ? 'borrador' : 'publicado';
        await api('/api/admin/posts/' + p.id, 'PATCH', { estado: nuevo });
        await loadPosts();
      } else if (act === 'del') {
        if (!confirm('¿Borrar el post "' + p.titulo + '"?')) return;
        await api('/api/admin/posts/' + p.id, 'DELETE');
        await loadPosts();
      }
    } catch (err) { alert(err.message); }
  }

  /* ==================== PESTAÑAS ==================== */
  function switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === tab));
    $('view-promos').hidden = tab !== 'promos';
    $('view-blog').hidden = tab !== 'blog';
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

    // Pestañas
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
    $('postModal').addEventListener('click', (e) => { if (e.target.id === 'postModal') closePostModal(); });

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
