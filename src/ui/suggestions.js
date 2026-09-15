// UI: shapes suggestion results into dashboard cards.

import { priceDisplay, stars } from './format.js';

// The dashboard asks for meal suggestions and keeps only these fields.
// suggestion_type, price_range, avg_rating and explanation are dropped here,
// so their badges never show. Existing behaviour, recorded in
// docs/plans/2026-09-15-four-layer-shape.md.
export function toMealSuggestions(results) {
  return results.map(s => ({
    name: s.name,
    restaurant_name: s.restaurant_name,
    restaurant_id: s.restaurant_id,
    cuisine_type: s.cuisine_type,
    dishes: s.dishes || [],
    reason: s.reason,
    type: 'meal',
  }));
}

export function toSuggestionCard(s) {
  return {
    badge: s.suggestion_type
      ? { className: s.suggestion_type === 'familiar' ? 'badge-familiar' : 'badge-new', label: s.suggestion_type === 'familiar' ? 'Your usual' : 'Try this' }
      : null,
    name: s.name,
    cuisine: s.cuisine_type || null,
    price: s.price_range ? priceDisplay(s.price_range) : null,
    rating: s.avg_rating != null ? { stars: stars(s.avg_rating), title: `${Number(s.avg_rating).toFixed(1)} / 5` } : null,
    restaurant: s.restaurant_name && s.type === 'meal' ? s.restaurant_name : null,
    dishes: Array.isArray(s.dishes)
      ? s.dishes.map(d => `${d.name}${d.from_restaurant && d.from_restaurant !== s.restaurant_name ? ` (${d.from_restaurant})` : ''}`)
      : [],
    reason: s.reason || null,
  };
}
