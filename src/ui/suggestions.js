// UI: shapes a suggestion result (as the server sends it) into a dashboard card.

import { priceDisplay, stars } from './format.js';

export function toSuggestionCard(s) {
  return {
    badge: s.suggestion_type
      ? { className: s.suggestion_type === 'familiar' ? 'badge-familiar' : 'badge-new', label: s.suggestion_type === 'familiar' ? 'Your usual' : 'Try this' }
      : null,
    name: s.name,
    cuisine: s.cuisine_type || null,
    price: s.price_range ? priceDisplay(s.price_range) : null,
    rating: s.avg_rating != null ? { stars: stars(s.avg_rating), title: `${Number(s.avg_rating).toFixed(1)} / 5` } : null,
    restaurant: s.restaurant_name || null,
    dishes: Array.isArray(s.dishes)
      ? s.dishes.map(d => `${d.name}${d.from_restaurant && d.from_restaurant !== s.restaurant_name ? ` (${d.from_restaurant})` : ''}`)
      : [],
    reason: s.explanation || null,
  };
}
