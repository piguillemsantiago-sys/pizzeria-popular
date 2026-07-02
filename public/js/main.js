/* ═══════════════════════════════════════════
   Pizzería Popular — Main JS
   ═══════════════════════════════════════════ */

// ─── NAV SCROLL EFFECT ───
const nav = document.getElementById('mainNav');
const floatCta = document.getElementById('floatCta');

window.addEventListener('scroll', () => {
  if (nav) {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }
  if (floatCta) {
    floatCta.classList.toggle('visible', window.scrollY > 400);
  }
});

// ─── MOBILE MENU ───
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileClose = document.getElementById('mobileClose');

let mobileCloseTimer;

function openMobile() {
  if (!mobileMenu) return;
  clearTimeout(mobileCloseTimer);
  mobileMenu.classList.remove('closing');
  mobileMenu.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMobile() {
  if (!mobileMenu || !mobileMenu.classList.contains('open')) return;
  // animación de salida inversa antes de ocultar
  mobileMenu.classList.add('closing');
  document.body.style.overflow = '';
  clearTimeout(mobileCloseTimer);
  mobileCloseTimer = setTimeout(() => {
    mobileMenu.classList.remove('open', 'closing');
  }, 380);
}

if (hamburger) hamburger.addEventListener('click', openMobile);
if (mobileClose) mobileClose.addEventListener('click', closeMobile);

// Cerrar al tocar el backdrop (overlay vacío, fuera de los links)
if (mobileMenu) {
  mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) closeMobile();
  });
}
// Cerrar al cliquear cualquier link del menú
document.querySelectorAll('.mobile-menu a').forEach((a) => {
  a.addEventListener('click', closeMobile);
});

// ─── TIMELINE: indicador de swipe bidireccional (siempre visible) ───
(function () {
  var timeline = document.querySelector('.tl-outer');
  var indicator = document.getElementById('swipeIndicator');
  if (!timeline || !indicator) return;
  var leftArrow = indicator.querySelector('.swipe-arrow-left');
  var rightArrow = indicator.querySelector('.swipe-arrow-right');
  function updateIndicator() {
    var scrollLeft = timeline.scrollLeft;
    var maxScroll = timeline.scrollWidth - timeline.clientWidth;
    leftArrow.style.display = scrollLeft < 20 ? 'none' : 'inline-block';
    rightArrow.style.display = scrollLeft > maxScroll - 20 ? 'none' : 'inline-block';
  }
  timeline.addEventListener('scroll', updateIndicator, { passive: true });
  window.addEventListener('resize', updateIndicator);
  updateIndicator();
})();

// ─── SCROLL REVEAL ───
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ─── DELIVERY DROPDOWN ───
function toggleDelivery() {
  const dd = document.getElementById('deliveryDropdown');
  if (dd) dd.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('deliveryDropdown');
  const wrap = document.querySelector('.delivery-wrap');
  if (dd && wrap && !wrap.contains(e.target)) {
    dd.classList.remove('open');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const dd = document.getElementById('deliveryDropdown');
    if (dd) dd.classList.remove('open');
    closeMobile();
    // Close any blog modals
    document.querySelectorAll('.blog-modal-overlay.active').forEach(m => {
      m.classList.remove('active');
    });
  }
});

// ─── BLOG MODALS ───
function openBlogModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeBlogModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('blog-modal-overlay')) {
    e.target.classList.remove('active');
    document.body.style.overflow = '';
  }
});

// ─── i18n SYSTEM ───
const translations = {
  es: {
    'nav.nosotros': 'Nosotros',
    'nav.restaurantes': 'Restaurantes',
    'nav.carta': 'Carta',
    'nav.promociones': 'Promociones',
    'nav.franquicias': 'Franquicias',
    'nav.contacto': 'Contacto',
    'nav.reservar': 'Reservar mesa',
    'nav.delivery': 'Delivery',
    'hero.eyebrow': 'Horno de leña · Cocina argentina 🇦🇷 en España 🇪🇸',
    'hero.title': 'BIENVENIDOS',
    'hero.sub': 'a pasear el alma',
    'hero.desc': 'Somos más que una pizzería, somos familia, amigos, una primera cita y festejos infinitos. Desde Argentina hasta tu ciudad. Hecho con fuego, ingredientes frescos y mucho amor.',
    'hero.btn1': 'Reservar mesa',
    'hero.btn2': 'Ver la carta',
    'hero.stat1': 'Valoración Google',
    'hero.stat2': 'Opiniones reales',
    'hero.stat3': 'Locales en España',
    'footer.desc': 'Cocina argentina en España. Pizza al horno de leña, pasta artesanal y milanesas. Abierto los 7 días.',
    'footer.locales': 'Locales',
    'footer.carta': 'Carta',
    'footer.contacto': 'Contacto',
    'footer.copy': '© 2026 Pizzería Popular España · Todos los derechos reservados'
  },
  en: {
    'nav.nosotros': 'About Us',
    'nav.restaurantes': 'Restaurants',
    'nav.carta': 'Menu',
    'nav.promociones': 'Promos',
    'nav.franquicias': 'Franchises',
    'nav.contacto': 'Contact',
    'nav.reservar': 'Book a table',
    'nav.delivery': 'Delivery',
    'hero.eyebrow': 'Wood-fired oven · Argentine cuisine 🇦🇷 in Spain 🇪🇸',
    'hero.title': 'WELCOME',
    'hero.sub': 'to savor the soul',
    'hero.desc': 'We are more than a pizzeria — we are family, friends, a first date, and endless celebrations. From Argentina to your city. Made with fire, fresh ingredients, and lots of love.',
    'hero.btn1': 'Book a table',
    'hero.btn2': 'See the menu',
    'hero.stat1': 'Google Rating',
    'hero.stat2': 'Real Reviews',
    'hero.stat3': 'Locations in Spain',
    'footer.desc': 'Argentine cuisine in Spain. Wood-fired pizza, artisan pasta and milanesas. Open 7 days.',
    'footer.locales': 'Locations',
    'footer.carta': 'Menu',
    'footer.contacto': 'Contact',
    'footer.copy': '© 2026 Pizzería Popular Spain · All rights reserved'
  }
};

function setLang(lang) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  document.documentElement.lang = lang;
}

// ─── PARALLAX (optional, for photo-full sections) ───
window.addEventListener('scroll', () => {
  document.querySelectorAll('.photo-full-bg').forEach(bg => {
    const rect = bg.parentElement.getBoundingClientRect();
    const speed = 0.3;
    bg.style.transform = `translateY(${rect.top * speed}px)`;
  });
});

// ─── PIZZA FLOTANTE — emoji girando + lanzador del chat de Pepe ───
(function () {
  var wrap = document.createElement('div');
  wrap.className = 'spinning-pizza';
  wrap.id = 'spinningPizza';
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label', 'Abrir chat con Pepe');
  wrap.innerHTML = '<span class="pizza-emoji">🍕</span><span class="pizza-dot"></span>';
  document.body.appendChild(wrap);
  var pizza = wrap.querySelector('.pizza-emoji');
  var rotation = 0;
  var lastY = window.scrollY || window.pageYOffset;
  window.addEventListener('scroll', function () {
    var y = window.scrollY || window.pageYOffset;
    rotation += (y - lastY) * 0.7;   // scroll abajo → horario, arriba → antihorario
    pizza.style.transform = 'rotate(' + rotation + 'deg)';
    lastY = y;
  }, { passive: true });
})();

// ─── TIMELINE DRAG SCROLL ───
document.querySelectorAll('.tl-outer').forEach(outer => {
  let isDown = false;
  let startX, scrollLeft;

  outer.addEventListener('mousedown', (e) => {
    isDown = true;
    outer.style.cursor = 'grabbing';
    startX = e.pageX - outer.offsetLeft;
    scrollLeft = outer.scrollLeft;
  });
  outer.addEventListener('mouseleave', () => { isDown = false; outer.style.cursor = 'grab'; });
  outer.addEventListener('mouseup', () => { isDown = false; outer.style.cursor = 'grab'; });
  outer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - outer.offsetLeft;
    const walk = (x - startX) * 2;
    outer.scrollLeft = scrollLeft - walk;
  });
});

// ─── SHINE DEL PILL "ENCUÉNTRANOS" — se dispara al entrar al viewport ───
(function () {
  var pills = document.querySelectorAll('.locales-heading-eyebrow');
  if (!pills.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.remove('shine-active');
        void entry.target.offsetWidth; // reflow → reinicia la animación
        entry.target.classList.add('shine-active');
      } else {
        entry.target.classList.remove('shine-active');
      }
    });
  }, { threshold: 0.6 });
  pills.forEach(function (p) { observer.observe(p); });
})();

// ─── ESTRELLAS GOOGLE — entrada en cascada (stagger) al entrar al viewport ───
(function () {
  var stars = document.querySelectorAll('.star-item');
  if (!stars.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var idx = Array.prototype.indexOf.call(stars, entry.target);
        setTimeout(function () { entry.target.classList.add('is-visible'); }, idx * 120);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25 });
  stars.forEach(function (s) { observer.observe(s); });
})();

// ─── CRÉDITO DESARROLLADOR (footer) ───
(function () {
  var footer = document.querySelector('footer');
  if (!footer || footer.querySelector('.footer-vocai')) return;
  // Peso 800 de Montserrat para el logotipo VOCAI (el sitio solo carga hasta 700).
  var fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap';
  document.head.appendChild(fontLink);
  var credit = document.createElement('div');
  credit.className = 'footer-vocai';
  credit.innerHTML =
    '<span class="footer-vocai-label">Desarrollado por</span>' +
    '<a class="footer-vocai-name" href="https://www.vocai.es" target="_blank" rel="noopener">VOCAI</a>' +
    '<a class="footer-vocai-ig" href="https://www.instagram.com/vocai.st/" target="_blank" rel="noopener" aria-label="Instagram de VOCAI">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<rect x="2" y="2" width="20" height="20" rx="5.5"></rect>' +
        '<circle cx="12" cy="12" r="4.4"></circle>' +
        '<circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none"></circle>' +
      '</svg>' +
      '<span>@vocai.st</span>' +
    '</a>';
  footer.appendChild(credit);
})();

// ─── ASISTENTE DE CHAT · PEPE — se lanza desde la pizza flotante ───
(function () {
  var btn = document.getElementById('spinningPizza');
  if (!btn || document.querySelector('.ppchat-panel')) return;

  var panel = document.createElement('div');
  panel.className = 'ppchat-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="ppchat-head">' +
      '<div class="ppchat-avatar"><img src="/images/pepe-robot.svg" alt="" /></div>' +
      '<div class="ppchat-id">' +
        '<span class="ppchat-name">Pepe</span>' +
        '<span class="ppchat-role"><span class="ppchat-online"></span>En línea · Pizzería Popular</span>' +
      '</div>' +
      '<button class="ppchat-close" aria-label="Cerrar">✕</button>' +
    '</div>' +
    '<div class="ppchat-log"><div class="ppchat-msg bot">¡Hola! 🔥 Soy Pepe, el asistente virtual de Pizzería Popular. ¿En qué te puedo ayudar?</div></div>' +
    '<form class="ppchat-form"><input type="text" placeholder="Escribile a Pepe…" autocomplete="off" />' +
    '<button type="submit" aria-label="Enviar">➤</button></form>';

  document.body.appendChild(panel);

  var log = panel.querySelector('.ppchat-log');
  var form = panel.querySelector('.ppchat-form');
  var input = form.querySelector('input');
  var sendBtn = form.querySelector('button');
  var history = [];

  // Id de sesión para agrupar la conversación en las estadísticas.
  var sessionId;
  try {
    sessionId = sessionStorage.getItem('pepeSession');
    if (!sessionId) {
      sessionId = 's-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('pepeSession', sessionId);
    }
  } catch (e) { sessionId = 's-' + Date.now(); }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Convierte [texto](ruta) en enlaces clicables y **texto** en negrita.
  function linkify(text) {
    var html = esc(text).replace(
      /\[([^\]]+)\]\((\/[^\s)]*|https?:\/\/[^\s)]+)\)/g,
      function (m, label, url) {
        var ext = /^https?:/i.test(url);
        return '<a href="' + url + '"' +
               (ext ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
      }
    );
    return html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function add(text, cls) {
    var d = document.createElement('div');
    d.className = 'ppchat-msg ' + cls;
    if (cls.indexOf('bot') !== -1) {
      d.innerHTML = linkify(text);
    } else {
      d.textContent = text;
    }
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function addTyping() {
    var d = document.createElement('div');
    d.className = 'ppchat-msg bot ppchat-typing';
    d.innerHTML = '<span></span><span></span><span></span>';
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  // En móvil: ajusta el panel al área realmente visible (clave con el teclado
  // abierto) para que la conversación no se descentre ni la página haga zoom.
  function fitPanel() {
    var vv = window.visualViewport;
    if (window.innerWidth > 480 || !vv) {
      panel.style.top = ''; panel.style.bottom = ''; panel.style.height = '';
      return;
    }
    panel.style.top = (vv.offsetTop + 8) + 'px';
    panel.style.bottom = 'auto';
    panel.style.height = (vv.height - 16) + 'px';
  }

  function toggle(open) {
    if (open) {
      panel.hidden = false;
      btn.classList.add('chat-open');
      fitPanel();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', fitPanel);
        window.visualViewport.addEventListener('scroll', fitPanel);
      }
      requestAnimationFrame(function () { panel.classList.add('show'); });
      setTimeout(function () { input.focus(); }, 80);
    } else {
      panel.classList.remove('show');
      btn.classList.remove('chat-open');
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', fitPanel);
        window.visualViewport.removeEventListener('scroll', fitPanel);
      }
      setTimeout(function () {
        panel.hidden = true;
        panel.style.top = ''; panel.style.bottom = ''; panel.style.height = '';
      }, 260);
    }
  }

  btn.addEventListener('click', function () {
    toggle(panel.hidden);
  });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(panel.hidden); }
  });
  panel.querySelector('.ppchat-close').addEventListener('click', function () {
    toggle(false);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    add(text, 'user');
    sendBtn.disabled = true;
    var thinking = addTyping();
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history, sessionId: sessionId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        thinking.remove();
        if (data.reply) {
          add(data.reply, 'bot');
          history.push({ role: 'user', content: text });
          history.push({ role: 'assistant', content: data.reply });
        } else {
          add(data.error || 'No pude responder. Probá de nuevo.', 'bot');
        }
      })
      .catch(function () {
        thinking.remove();
        add('Hubo un error de conexión. Probá de nuevo.', 'bot');
      })
      .finally(function () {
        sendBtn.disabled = false;
        input.focus();
      });
  });

  // ─── Nubecita de invitación — discreta, descartable, 1 vez por sesión ───
  (function () {
    try { if (sessionStorage.getItem('pepeHint')) return; } catch (e) {}

    var hint = document.createElement('div');
    hint.className = 'pepe-hint';
    hint.innerHTML =
      '<span class="pepe-hint-text">¡Hola! 👋 ¿En qué te ayudo?</span>' +
      '<button class="pepe-hint-x" aria-label="Cerrar aviso">✕</button>';

    var hideTimer;
    function killHint() {
      if (!hint.parentNode) return;
      hint.classList.remove('show');
      clearTimeout(hideTimer);
      try { sessionStorage.setItem('pepeHint', '1'); } catch (e) {}
      setTimeout(function () { if (hint.parentNode) hint.remove(); }, 420);
    }

    hint.querySelector('.pepe-hint-x').addEventListener('click', function (e) {
      e.stopPropagation();
      killHint();
    });
    hint.querySelector('.pepe-hint-text').addEventListener('click', function () {
      killHint();
      toggle(true);
    });
    btn.addEventListener('click', killHint);
    btn.addEventListener('keydown', killHint);

    // Aparece tras una pausa, solo si el chat sigue cerrado.
    setTimeout(function () {
      if (!panel.hidden) return;
      document.body.appendChild(hint);
      requestAnimationFrame(function () { hint.classList.add('show'); });
      hideTimer = setTimeout(killHint, 8000);
    }, 4500);
  })();

  /* ============================================================
   * Analítica propia (sin cookies): pageview + eventos clave.
   * Manda a /api/track. No usa cookies ni guarda datos personales.
   * ========================================================== */
  (function () {
    // Identifica el local destino de un click (para el desglose por sucursal).
    function targetFrom(href, tipo) {
      if (tipo === 'whatsapp') { var w = href.match(/wa\.me\/(\d+)/); return w ? w[1] : null; }
      if (tipo === 'reserva') { var r = href.match(/\/\/([a-z0-9-]+)\.myrestoo\.net/i); return r ? r[1] : null; }
      return null;
    }

    function send(tipo, target) {
      if (window.ppPixel) window.ppPixel(tipo, target); // refleja el evento al Pixel de Meta (solo si hay consentimiento)
      var data = JSON.stringify({ tipo: tipo, path: location.pathname, ref: document.referrer, target: target || null });
      try {
        var blob = new Blob([data], { type: 'application/json' });
        if (navigator.sendBeacon && navigator.sendBeacon('/api/track', blob)) return;
      } catch (e) { /* sigue por fetch */ }
      fetch('/api/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: data, keepalive: true,
      }).catch(function () {});
    }

    send('pageview');

    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var h = a.href || '';
      if (/wa\.me|api\.whatsapp\.com/i.test(h)) send('whatsapp', targetFrom(h, 'whatsapp'));
      else if (/myrestoo\.net/i.test(h)) send('reserva', targetFrom(h, 'reserva'));
      else if (/maps\.app\.goo\.gl|google\.[a-z.]+\/maps|maps\.google\./i.test(h)) send('comollegar', a.getAttribute('data-local') || null);
      else if (/instagram\.com\/pizzeriapopular/i.test(h)) send('instagram');
    }, true);

    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (f && /^(contactForm|contactFormHome|franqForm|franqFormHome)$/.test(f.id || '')) {
        send('formulario');
      }
    }, true);
  })();
})();

/* ============================================================
 * Consentimiento de cookies (RGPD / Guía AEPD) + Meta Pixel.
 * La analítica propia (más arriba) es cookieless: no requiere
 * consentimiento. El Pixel de Meta SÍ usa cookies (_fbp/_fbc) y
 * solo se inyecta tras el opt-in explícito del usuario.
 * Módulo INDEPENDIENTE del chat: corre en toda página pública.
 * ========================================================== */
(function () {
    var PIXEL_ID = '553857340784854';
    var KEY = 'pp_cookie_consent';            // 'all' | 'reject'
    var isEN = location.pathname.indexOf('/en/') === 0 ||
               (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;

    function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

    // --- Meta Pixel: se inyecta SOLO con consentimiento ---
    var loaded = false;
    function loadPixel() {
      if (loaded || !PIXEL_ID) return;
      loaded = true;
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
        n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', PIXEL_ID);
      window.fbq('track', 'PageView');
    }

    // Refleja los eventos del tracker propio al Pixel (no-op sin consentimiento).
    window.ppPixel = function (tipo, target) {
      if (!window.fbq) return;
      if (tipo === 'whatsapp') window.fbq('track', 'Contact', { content_name: 'whatsapp', content_category: target || 'web' });
      else if (tipo === 'reserva') window.fbq('track', 'Lead', { content_name: 'reserva', content_category: target || 'web' });
      else if (tipo === 'comollegar') window.fbq('track', 'FindLocation', { content_name: 'comollegar', content_category: target || 'web' });
      else if (tipo === 'formulario') window.fbq('track', 'Lead', { content_name: 'contacto' });
      else if (tipo === 'instagram') window.fbq('trackCustom', 'InstagramClick');
      // 'pageview' no se mapea: el snippet base ya dispara PageView al cargar.
    };

    // --- Banner de consentimiento ---
    var T = isEN ? {
      txt: 'We use our own cookieless analytics and Meta (Facebook/Instagram) cookies to measure and improve our advertising. You can accept or reject them.',
      more: 'Cookie Policy', accept: 'Accept', reject: 'Reject', aria: 'Cookie consent'
    } : {
      txt: 'Usamos analítica propia sin cookies y cookies de Meta (Facebook/Instagram) para medir y mejorar nuestra publicidad. Puedes aceptarlas o rechazarlas.',
      more: 'Política de Cookies', accept: 'Aceptar', reject: 'Rechazar', aria: 'Consentimiento de cookies'
    };

    function injectStyle() {
      if (document.getElementById('pp-cc-style')) return;
      var css =
        '.pp-cc{position:fixed;left:50%;bottom:18px;transform:translate(-50%,150%);' +
        'width:min(680px,calc(100vw - 28px));background:#2b2220;color:#EDE8D9;' +
        'border:1px solid rgba(237,232,217,.14);border-radius:14px;' +
        'box-shadow:0 18px 50px rgba(0,0,0,.45);padding:18px 20px;z-index:99990;' +
        'display:flex;flex-wrap:wrap;align-items:center;gap:14px 18px;' +
        "font-family:'Montserrat',system-ui,-apple-system,sans-serif;" +
        'opacity:0;transition:transform .35s ease,opacity .35s ease}' +
        '.pp-cc.show{transform:translate(-50%,0);opacity:1}' +
        '.pp-cc-txt{margin:0;flex:1 1 280px;font-size:.82rem;line-height:1.55;color:rgba(237,232,217,.85)}' +
        '.pp-cc-txt a{color:#D8A460;text-decoration:underline}' +
        '.pp-cc-btns{display:flex;gap:10px;flex:0 0 auto;margin-left:auto}' +
        '.pp-cc-btn{cursor:pointer;border-radius:9px;padding:10px 22px;font-size:.82rem;' +
        'font-weight:600;font-family:inherit;border:1px solid transparent;line-height:1;' +
        'transition:filter .15s ease,background .15s ease}' +
        '.pp-cc-reject{background:transparent;color:#EDE8D9;border-color:rgba(237,232,217,.32)}' +
        '.pp-cc-reject:hover{background:rgba(237,232,217,.08)}' +
        '.pp-cc-accept{background:#D8A460;color:#2b2220}' +
        '.pp-cc-accept:hover{filter:brightness(1.07)}' +
        '@media(max-width:520px){.pp-cc{padding:16px;gap:12px;bottom:12px}' +
        '.pp-cc-btns{width:100%}.pp-cc-btn{flex:1}}';
      var st = document.createElement('style');
      st.id = 'pp-cc-style'; st.textContent = css;
      document.head.appendChild(st);
    }

    function showBanner() {
      injectStyle();
      if (document.getElementById('pp-cc')) return;
      var bar = document.createElement('div');
      bar.id = 'pp-cc'; bar.className = 'pp-cc';
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-label', T.aria);
      bar.innerHTML =
        '<p class="pp-cc-txt">' + T.txt +
        ' <a href="/politica-de-cookies/">' + T.more + '</a>.</p>' +
        '<div class="pp-cc-btns">' +
        '<button type="button" class="pp-cc-btn pp-cc-reject" id="pp-cc-reject">' + T.reject + '</button>' +
        '<button type="button" class="pp-cc-btn pp-cc-accept" id="pp-cc-accept">' + T.accept + '</button>' +
        '</div>';
      document.body.appendChild(bar);
      requestAnimationFrame(function () { bar.classList.add('show'); });
      document.getElementById('pp-cc-accept').addEventListener('click', function () { choose('all'); });
      document.getElementById('pp-cc-reject').addEventListener('click', function () { choose('reject'); });
    }

    function hideBanner() {
      var bar = document.getElementById('pp-cc');
      if (!bar) return;
      bar.classList.remove('show');
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 320);
    }

    function choose(v) {
      set(v); hideBanner();
      if (v === 'all') { loadPixel(); return; }
      // Si ya se había aceptado en esta misma carga y ahora rechaza, revocar y recargar.
      if (loaded) {
        try { if (window.fbq) window.fbq('consent', 'revoke'); } catch (e) {}
        location.reload();
      }
    }

    // Permite reabrir el panel (enlace "cambiar preferencias" en la Política de Cookies).
    window.ppCookieSettings = function () { showBanner(); };

    // Arranque: respetar decisión previa; si no hay, mostrar banner.
    var c = get();
    if (c === 'all') loadPixel();
    else if (c !== 'reject') {
      if (document.body) showBanner();
      else document.addEventListener('DOMContentLoaded', showBanner);
    }
  })();
