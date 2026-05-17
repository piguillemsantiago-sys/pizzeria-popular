/**
 * Loads Google ratings from /data/google-ratings.json
 * and updates all elements with data-rating attributes.
 *
 * Usage in HTML:
 *   <span data-rating="santa-clara" data-field="rating">4.8</span>
 *   <span data-rating="santa-clara" data-field="reviews">244</span>
 *   <span data-rating="santa-clara" data-field="stars">★★★★★</span>
 *   <span data-rating="average">4.7</span>
 *   <span data-rating="total-reviews">+4.600</span>
 */
(function () {
  var isEn = location.pathname.indexOf('/en/') === 0;
  var googleBadge = isEn ? 'on Google' : 'en Google';

  fetch('/data/google-ratings.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.locals) return;

      // Build lookup by slug
      var bySlug = {};
      data.locals.forEach(function (l) { bySlug[l.slug] = l; });

      // Update individual local elements
      document.querySelectorAll('[data-rating]').forEach(function (el) {
        var key = el.getAttribute('data-rating');
        var field = el.getAttribute('data-field');

        if (key === 'average') {
          el.textContent = data.averageRating;
          return;
        }
        if (key === 'total-reviews') {
          // El "+" ya está hardcodeado en el HTML antes del <span> → no duplicarlo
          el.textContent = data.totalReviews.toLocaleString('es-ES');
          return;
        }

        var local = bySlug[key];
        if (!local) return;

        if (field === 'rating') {
          el.textContent = local.rating;
        } else if (field === 'reviews') {
          el.textContent = local.reviews.toLocaleString('es-ES');
        } else if (field === 'stars') {
          var full = Math.floor(local.rating);
          var half = local.rating - full >= 0.3 ? 1 : 0;
          var empty = 5 - full - half;
          el.textContent = '★'.repeat(full) + (half ? '☆' : '') + '☆'.repeat(empty);
        } else if (field === 'rating-line') {
          // Format: [4.8] [★★★★★] [244 opiniones] [EN GOOGLE]
          var f = Math.floor(local.rating);
          var h = local.rating - f >= 0.3 ? 1 : 0;
          var stars = '★'.repeat(f) + (h ? '☆' : '') + '☆'.repeat(5 - f - h);
          var reviewsLabel = el.getAttribute('data-reviews-label') || 'opiniones';
          el.innerHTML =
            '<span class="rating-num">' + local.rating.toFixed(1) + '</span>' +
            '<span class="rating-stars">' + stars + '</span>' +
            '<span class="reviews-line">' +
              '<span class="reviews-count">' + local.reviews.toLocaleString('es-ES') + ' ' + reviewsLabel + '</span>' +
              '<span class="google-label">' + googleBadge + '</span>' +
            '</span>';
        }
      });
    })
    .catch(function () {
      // Silently fail — hardcoded defaults remain visible
    });
})();
