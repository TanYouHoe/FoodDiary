import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toSuggestionCard } from '../../src/ui/suggestions.js';

describe('toSuggestionCard', () => {
  it('shows every field the server sends for a meal suggestion', () => {
    const card = toSuggestionCard({
      id: 3,
      name: 'Village Park',
      cuisine_type: 'Malay',
      price_range: 2,
      avg_rating: 4.26,
      suggestion_type: 'familiar',
      explanation: 'Rated 4.3 stars + A proven favorite',
    });
    assert.deepEqual(card, {
      badge: { className: 'badge-familiar', label: 'Your usual' },
      name: 'Village Park',
      cuisine: 'Malay',
      price: '$$',
      rating: { stars: '★★★★☆', title: '4.3 / 5' },
      restaurant: null,
      dishes: [],
      reason: 'Rated 4.3 stars + A proven favorite',
    });
  });

  it('labels a new suggestion "Try this"', () => {
    assert.deepEqual(toSuggestionCard({ name: 'X', suggestion_type: 'new' }).badge, { className: 'badge-new', label: 'Try this' });
  });

  it('leaves out what the server did not send', () => {
    const card = toSuggestionCard({ name: 'X' });
    assert.equal(card.badge, null);
    assert.equal(card.cuisine, null);
    assert.equal(card.price, null);
    assert.equal(card.rating, null);
    assert.equal(card.reason, null);
  });

  it('shows the "at" restaurant only when a restaurant name is present', () => {
    assert.equal(toSuggestionCard({ name: 'Laksa', restaurant_name: 'Madam Kwan' }).restaurant, 'Madam Kwan');
    assert.equal(toSuggestionCard({ name: 'Laksa' }).restaurant, null);
  });

  it('names a dish from another restaurant', () => {
    const card = toSuggestionCard({
      name: 'Set', restaurant_name: 'A',
      dishes: [{ name: 'Rice', from_restaurant: 'A' }, { name: 'Tea', from_restaurant: 'B' }],
    });
    assert.deepEqual(card.dishes, ['Rice', 'Tea (B)']);
  });
});
