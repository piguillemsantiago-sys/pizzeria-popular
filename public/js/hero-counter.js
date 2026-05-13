/**
 * Hero stats counter animation.
 *
 * Animates the three numbers inside `.hero-stats` once, when the section
 * enters the viewport. Final values come from /data/google-ratings.json
 * (refreshed every 7 days), so nothing is hardcoded.
 *
 * Markup expected:
 *   <span data-counter="rating">…</span>     → "X.X" (followed by ⭐ in the DOM)
 *   <div  data-counter="reviews">…</div>     → "+N" with thousands separator
 *   <div  data-counter="locales">…</div>     → integer
 */
(function () {
  var heroStats = document.querySelector('.hero-stats');
  if (!heroStats) return;

  var ratingEl  = heroStats.querySelector('[data-counter="rating"]');
  var reviewsEl = heroStats.querySelector('[data-counter="reviews"]');
  var localesEl = heroStats.querySelector('[data-counter="locales"]');
  if (!ratingEl && !reviewsEl && !localesEl) return;

  var locale = location.pathname.indexOf('/en/') === 0 ? 'en-US' : 'es-ES';
  var DURATION = 8000;
  var START_DELAY = 800;

  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  function animate(el, from, to, formatFn) {
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / DURATION, 1);
      var v = from + (to - from) * easeOutQuart(t);
      el.textContent = formatFn(v, t === 1);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function deriveTotals(data) {
    var locals = (data && data.locals) || [];
    var count = locals.length;
    var totalReviews = data && data.totalReviews != null
      ? data.totalReviews
      : locals.reduce(function (s, l) { return s + (l.reviews || 0); }, 0);
    var avgRating = data && data.averageRating != null
      ? data.averageRating
      : (count ? locals.reduce(function (s, l) { return s + (l.rating || 0); }, 0) / count : 0);
    return { count: count, totalReviews: totalReviews, avgRating: avgRating };
  }

  function setInitial(t) {
    if (ratingEl)  ratingEl.textContent  = '4.0';
    if (reviewsEl) reviewsEl.textContent = '+' + (t.totalReviews - 50).toLocaleString(locale);
    if (localesEl) localesEl.textContent = '3';
  }

  function startAnimation(t) {
    var avgFinal = Math.round(t.avgRating * 10) / 10;

    if (ratingEl) {
      animate(ratingEl, 4.0, avgFinal, function (v) {
        return (Math.round(v * 10) / 10).toFixed(1);
      });
    }
    if (reviewsEl) {
      animate(reviewsEl, t.totalReviews - 50, t.totalReviews, function (v) {
        return '+' + Math.round(v).toLocaleString(locale);
      });
    }
    if (localesEl) {
      animate(localesEl, 3, t.count, function (v) {
        return String(Math.round(v));
      });
    }
  }

  fetch('/data/google-ratings.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var totals = deriveTotals(data);
      if (!totals.count) return;

      setInitial(totals);

      var fired = false;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!fired && e.isIntersecting) {
            fired = true;
            io.disconnect();
            setTimeout(function () { startAnimation(totals); }, START_DELAY);
          }
        });
      }, { threshold: 0.3 });

      io.observe(heroStats);
    })
    .catch(function () {
      // Network failure: leave the hardcoded HTML defaults in place.
    });
})();
