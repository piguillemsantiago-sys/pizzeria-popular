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

// ─── TIMELINE: ocultar el indicador de swipe al desplazar el carrusel ───
document.querySelectorAll('.tl-outer').forEach((outer) => {
  outer.addEventListener('scroll', () => {
    if (outer.scrollLeft > 24) {
      document.querySelectorAll('.swipe-indicator').forEach((h) => h.classList.add('hidden'));
    }
  }, { passive: true });
});

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

// ─── PIZZA FLOTANTE — porción SVG que gira y cambia de sabor por sección (mobile) ───
(function () {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  var wrap = document.createElement('div');
  wrap.className = 'spinning-pizza';
  wrap.id = 'spinningPizza';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = '<img src="/images/pizzas/pizza-margarita.svg" alt="" class="pizza-img" id="pizzaImg">';
  document.body.appendChild(wrap);
  var pizzaImg = document.getElementById('pizzaImg');

  // Rotación al hacer scroll (abajo → horario, arriba → antihorario)
  var rotation = 0;
  var lastY = window.scrollY || window.pageYOffset;
  window.addEventListener('scroll', function () {
    var y = window.scrollY || window.pageYOffset;
    rotation += (y - lastY) * 0.7;
    pizzaImg.style.transform = 'rotate(' + rotation + 'deg)';
    lastY = y;
  }, { passive: true });

  // Cambio de sabor según la sección visible
  var sectionPizzas = {
    hero: 'margarita', inicio: 'margarita',
    historia: 'napolitana', nosotros: 'napolitana',
    locales: 'pepperoni', restaurantes: 'pepperoni',
    carta: 'cuatroquesos', menu: 'cuatroquesos',
    promos: 'hawaiana', promociones: 'hawaiana',
    'google-stats': 'prosciutto', valoracion: 'prosciutto',
    testimonios: 'vegetales', resenas: 'vegetales',
    franquicias: 'funghi',
    contacto: 'pepperoni', contact: 'pepperoni',
    blog: 'margarita'
  };
  var current = 'margarita';
  var swapTimer;
  var sections = document.querySelectorAll('section[id], div[id]');
  if (!sections.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.4) return;
      var id = entry.target.id.toLowerCase();
      for (var key in sectionPizzas) {
        if (id.indexOf(key) === -1) continue;
        var flavor = sectionPizzas[key];
        if (flavor !== current) {
          current = flavor;
          pizzaImg.style.opacity = '0';
          clearTimeout(swapTimer);
          swapTimer = setTimeout(function () {
            pizzaImg.setAttribute('src', '/images/pizzas/pizza-' + flavor + '.svg');
            pizzaImg.style.opacity = '1';
          }, 220);
        }
        break;
      }
    });
  }, { threshold: [0.4, 0.6] });
  sections.forEach(function (s) { observer.observe(s); });
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
