/* ============================================================
   admin.js — Panel de administración Pizzería Popular
   Sesión (Supabase Auth) + ABM de promociones contra /api/admin/*.
   ============================================================ */
(function () {
  'use strict';

  let sb = null;          // cliente Supabase (auth en el navegador)
  let promos = [];        // cache del listado
  let editingId = null;   // id de la promo en edición, o null si es nueva

  const $ = (id) => document.getElementById(id);

  // ---- Llamada autenticada a la API del panel ----
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

  // ---- Render del listado ----
  function render() {
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
    render();
  }

  // ---- Modal ----
  function openModal(promo) {
    editingId = promo ? promo.id : null;
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
  function closeModal() { $('modal').hidden = true; }

  async function saveModal(e) {
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
      if (editingId) await api('/api/admin/promos/' + editingId, 'PATCH', payload);
      else await api('/api/admin/promos', 'POST', payload);
      closeModal();
      await loadPromos();
    } catch (err) {
      $('modalError').textContent = err.message;
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  // ---- Acciones del listado ----
  async function onListClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      if (act === 'edit') {
        openModal(promos.find((p) => p.id === btn.dataset.id));
      } else if (act === 'toggle') {
        const p = promos.find((x) => x.id === btn.dataset.id);
        await api('/api/admin/promos/' + p.id, 'PATCH', { activa: !p.activa });
        await loadPromos();
      } else if (act === 'del') {
        const p = promos.find((x) => x.id === btn.dataset.id);
        if (!confirm('¿Borrar la promo "' + p.titulo + '"? No se puede deshacer.')) return;
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
    } catch (err) {
      alert(err.message);
    }
  }

  // ---- Arranque ----
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
    try {
      me = await api('/api/admin/me');
    } catch (e) {
      location.href = '/admin/login/';
      return;
    }
    $('adminEmail').textContent = me.email || '';
    $('loading').hidden = true;
    $('panel').hidden = false;

    $('newPromoBtn').addEventListener('click', () => openModal(null));
    $('cancelBtn').addEventListener('click', closeModal);
    $('promoForm').addEventListener('submit', saveModal);
    $('promoList').addEventListener('click', onListClick);
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    $('logoutBtn').addEventListener('click', async () => {
      await sb.auth.signOut();
      location.href = '/admin/login/';
    });

    try {
      await loadPromos();
    } catch (e) {
      $('promoList').innerHTML = '<p class="empty">No se pudieron cargar las promos: ' + esc(e.message) + '</p>';
    }
  })();
})();
