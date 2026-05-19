/* ============================================================
   blog-post.js — interacciones del artículo de blog (rediseño 2026)
   Progreso de lectura · parallax del hero · scrollspy del índice ·
   tiempo de lectura · galería con lightbox · copiar enlace.
   Se carga solo en las páginas de post. Vanilla, sin dependencias.
   ============================================================ */
(function () {
  'use strict';

  /* ---- Barra de progreso de lectura ---- */
  var progress = document.querySelector('.reading-progress span');
  function updateProgress() {
    if (!progress) return;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var pct = max > 0 ? (h.scrollTop || window.pageYOffset) / max : 0;
    progress.style.width = Math.min(100, Math.max(0, pct * 100)) + '%';
  }

  /* ---- Parallax suave del hero ---- */
  var heroBg = document.querySelector('.article-hero-bg');
  function updateParallax() {
    if (!heroBg) return;
    var y = window.pageYOffset;
    if (y < window.innerHeight) {
      heroBg.style.transform = 'translateY(' + (y * 0.35) + 'px)';
    }
  }

  /* ---- Scroll combinado (un solo listener, con rAF) ---- */
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        updateProgress();
        updateParallax();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
  updateProgress();
  updateParallax();

  /* ---- Tiempo estimado de lectura ---- */
  var body = document.querySelector('.article-body');
  var readEl = document.querySelector('.read-time');
  if (body && readEl) {
    var words = (body.textContent || '').trim().split(/\s+/).length;
    var min = Math.max(1, Math.round(words / 200));
    readEl.textContent = min + ' min de lectura';
  }

  /* ---- Índice: scrollspy + scroll suave ---- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.article-toc a'));
  if (tocLinks.length) {
    tocLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var target = document.getElementById(link.getAttribute('href').slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
    var sections = tocLinks
      .map(function (l) { return document.getElementById(l.getAttribute('href').slice(1)); })
      .filter(Boolean);
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          tocLinks.forEach(function (l) {
            l.classList.toggle('active', l.getAttribute('href') === '#' + id);
          });
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---- Galería + lightbox ---- */
  var lightbox = document.getElementById('lightbox');
  var figures = Array.prototype.slice.call(document.querySelectorAll('.article-gallery figure'));
  if (lightbox && figures.length) {
    var lbImg = lightbox.querySelector('img');
    var sources = figures.map(function (f) {
      var img = f.querySelector('img');
      return img.getAttribute('data-full') || img.getAttribute('src');
    });
    var current = 0;

    function show(i) {
      current = (i + sources.length) % sources.length;
      lbImg.setAttribute('src', sources[current]);
    }
    function openLb(i) {
      show(i);
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeLb() {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }

    figures.forEach(function (f, i) {
      f.addEventListener('click', function () { openLb(i); });
    });
    lightbox.querySelector('.lb-close').addEventListener('click', closeLb);
    lightbox.querySelector('.lb-prev').addEventListener('click', function (e) {
      e.stopPropagation(); show(current - 1);
    });
    lightbox.querySelector('.lb-next').addEventListener('click', function (e) {
      e.stopPropagation(); show(current + 1);
    });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLb();
    });
    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
  }

  /* ---- Compartir: copiar enlace ---- */
  var copyBtn = document.querySelector('.article-share .js-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var url = window.location.href;
      var done = function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(function () {
          copyBtn.textContent = original;
          copyBtn.classList.remove('copied');
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        done();
      }
    });
  }
})();
