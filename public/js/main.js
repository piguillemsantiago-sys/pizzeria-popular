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

// ─── PIZZA FLOTANTE — emoji girando con glow pulsante (todas las páginas) ───
(function () {
  var wrap = document.createElement('div');
  wrap.className = 'spinning-pizza';
  wrap.id = 'spinningPizza';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = '<span class="pizza-emoji">🍕</span>';
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

// ─── ASISTENTE DE CHAT · PEPE (visitantes) ───
(function () {
  if (document.querySelector('.ppchat-btn')) return;

  var btn = document.createElement('button');
  btn.className = 'ppchat-btn';
  btn.setAttribute('aria-label', 'Abrir chat con Pepe');
  btn.innerHTML =
    '<img src="/images/favicon-dark.png" alt="" />' +
    '<span class="ppchat-ping"></span>';

  var panel = document.createElement('div');
  panel.className = 'ppchat-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="ppchat-head">' +
      '<div class="ppchat-avatar"><img src="/images/favicon-dark.png" alt="" /></div>' +
      '<div class="ppchat-id">' +
        '<span class="ppchat-name">Pepe</span>' +
        '<span class="ppchat-role"><span class="ppchat-online"></span>En línea · Pizzería Popular</span>' +
      '</div>' +
      '<button class="ppchat-close" aria-label="Cerrar">✕</button>' +
    '</div>' +
    '<div class="ppchat-log"><div class="ppchat-msg bot">¡Hola mi vida! 🔥 Soy Pepe, el asistente de Pizzería Popular. ¿Te doy una mano? Preguntame por horarios, locales, la carta o el delivery.</div></div>' +
    '<form class="ppchat-form"><input type="text" placeholder="Escribile a Pepe…" autocomplete="off" />' +
    '<button type="submit" aria-label="Enviar">➤</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var log = panel.querySelector('.ppchat-log');
  var form = panel.querySelector('.ppchat-form');
  var input = form.querySelector('input');
  var sendBtn = form.querySelector('button');
  var history = [];

  function add(text, cls) {
    var d = document.createElement('div');
    d.className = 'ppchat-msg ' + cls;
    d.textContent = text;
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

  function toggle(open) {
    if (open) {
      panel.hidden = false;
      btn.classList.add('open');
      requestAnimationFrame(function () { panel.classList.add('show'); });
      setTimeout(function () { input.focus(); }, 60);
    } else {
      panel.classList.remove('show');
      btn.classList.remove('open');
      setTimeout(function () { panel.hidden = true; }, 220);
    }
  }

  btn.addEventListener('click', function () {
    toggle(panel.hidden);
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
      body: JSON.stringify({ message: text, history: history }),
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
})();
