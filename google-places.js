const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'public', 'data', 'google-ratings.json');

const LOCALS = [
  {
    slug: 'santa-clara',
    name: 'Santa Clara',
    city: 'Valencia',
    placeId: 'ChIJ8_E-Pt5PYA0RfVfE8o6CzOQ',
  },
  {
    slug: 'russafa',
    name: 'Russafa',
    city: 'Valencia',
    placeId: 'ChIJPf6aOQVJYA0ReMmA9smrqzg',
  },
  {
    slug: 'playa-san-juan',
    name: 'Playa San Juan',
    city: 'Alicante',
    placeId: 'ChIJnWet4i05Yg0RcM5_vfzbOnI',
  },
  {
    slug: 'luceros',
    name: 'Luceros',
    city: 'Alicante',
    placeId: 'ChIJN9SR7T43Yg0RyDEoXFTQTRM',
  },
  {
    slug: 'boadilla',
    name: 'Boadilla del Monte',
    city: 'Madrid',
    placeId: 'ChIJG0-H9OeFQQ0RbxxA1Jb2OdE',
  },
  {
    slug: 'benidorm',
    name: 'Benidorm',
    city: 'Alicante',
    placeId: 'ChIJ09Kfg5sFYg0R6DG-MaS9Wpk',
  },
];

async function fetchRating(placeId, apiKey) {
  const url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=es`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'rating,userRatingCount,reviews,regularOpeningHours',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Normaliza una review de la Places API a la forma de nuestro JSON.
function normalizeReview(r) {
  const author = r.authorAttribution || {};
  return {
    author: author.displayName || 'Anónimo',
    photo: author.photoUri || null,
    rating: r.rating,
    text: (r.text && r.text.text) || (r.originalText && r.originalText.text) || '',
    relativeTime: r.relativePublishTimeDescription || '',
    publishTime: r.publishTime || null,
  };
}

// Todas las reviews 5★ con texto que devuelve la API (hasta 5 por local).
function pickTopReviews(data) {
  if (!data || !Array.isArray(data.reviews)) return [];
  return data.reviews
    .filter(rev => rev && rev.rating === 5)
    .map(normalizeReview)
    .filter(rev => rev.text);
}

async function updateRatings() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.log('[Google Places] GOOGLE_PLACES_API_KEY not set, skipping update.');
    return null;
  }

  console.log('[Google Places] Fetching ratings for', LOCALS.length, 'locations...');

  const results = [];
  let totalReviews = 0;
  let totalRating = 0;

  for (const local of LOCALS) {
    if (!local.placeId) {
      console.log(`  ${local.name}: skipped (no Place ID yet)`);
      continue;
    }
    try {
      const data = await fetchRating(local.placeId, apiKey);
      const rating = data.rating || 0;
      const reviews = data.userRatingCount || 0;
      const topReviews = pickTopReviews(data);
      totalReviews += reviews;
      totalRating += rating;
      results.push({
        slug: local.slug,
        name: local.name,
        city: local.city,
        placeId: local.placeId,
        rating,
        reviews,
        hours: (data.regularOpeningHours && data.regularOpeningHours.weekdayDescriptions) || null,
        topReview: topReviews[0] || null,
        topReviews,
      });
      console.log(`  ${local.name}: ${rating} ★ (${reviews} reviews) + ${topReviews.length} 5★ review(s)`);
    } catch (err) {
      console.error(`  ${local.name}: ERROR -`, err.message);
      // Keep old data for this local if available
      const old = loadRatings();
      const oldLocal = old && old.locals ? old.locals.find(l => l.slug === local.slug) : null;
      results.push({
        slug: local.slug,
        name: local.name,
        city: local.city,
        placeId: local.placeId,
        rating: oldLocal ? oldLocal.rating : 0,
        reviews: oldLocal ? oldLocal.reviews : 0,
        hours: oldLocal ? oldLocal.hours || null : null,
        topReview: oldLocal ? oldLocal.topReview || null : null,
        topReviews: oldLocal ? oldLocal.topReviews || [] : [],
      });
    }
  }

  const avgRating = results.length > 0
    ? Math.round((totalRating / results.length) * 10) / 10
    : 0;

  const output = {
    updatedAt: new Date().toISOString(),
    averageRating: avgRating,
    totalReviews,
    locals: results,
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));
  console.log(`[Google Places] Saved to ${DATA_FILE}`);
  console.log(`  Average: ${avgRating} ★ | Total reviews: ${totalReviews}`);

  return output;
}

function loadRatings() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Google Places] Error reading ratings file:', err.message);
  }
  return null;
}

function ratingsExist() {
  return fs.existsSync(DATA_FILE);
}

module.exports = { updateRatings, loadRatings, ratingsExist, DATA_FILE, LOCALS };
