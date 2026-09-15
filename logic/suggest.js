// Logic: the recommendation engine's rules.
//
// Restaurant scorer: a weighted score per restaurant, top 3 with a reason.
// Meal suggester: blends familiar favourites with new places according to the
// user's adventure ratio for the current day and meal period.
//
// No database here. server/suggestions.js reads the rows and calls these.
// The clock arrives as `today` (YYYY-MM-DD) and `now` (ms or Date); the random
// source arrives as `rng`; the user's IANA time zone arrives as `timeZone`.

import { zoneReader, shiftCalendarDate, startOfDayInstant } from './meal-period.js';

export const WEIGHTS = {
  recency: 0.35,
  rating: 0.30,
  variety: 0.20,
  frequency: 0.15,
};

export const PLANNED_BONUS = { high: 0.3, medium: 0.2, low: 0.1 };
export const RECENCY_CAP_DAYS = 30;
export const SUGGESTION_COUNT = 3;
export const RECENT_CUISINE_COUNT = 3;
export const CONFIDENT_MEAL_COUNT = 20;
export const DEFAULT_ADVENTURE_RATIO = 0.5;
export const FAMILIAR_COOLDOWN_DAYS = 2;
export const STALE_AFTER_DAYS = 30;

const MS_PER_DAY = 86400000;

// ---------------------------------------------------------------------------
// Restaurant scorer
// ---------------------------------------------------------------------------

export function scoreRestaurant(data, today) {
  const {
    lastVisitedAt, avgRating, recentCuisines, cuisine_type,
    visitCount, maxVisitCount, plannedPriority,
  } = data;

  // Recency: days since last visit / 30, capped at 1.0. Never visited = 1.0
  let recency = 1.0;
  if (lastVisitedAt) {
    const daysSince = Math.floor((new Date(today) - new Date(lastVisitedAt)) / MS_PER_DAY);
    recency = Math.min(daysSince / RECENCY_CAP_DAYS, 1.0);
  }

  // Rating: avg / 5
  const rating = (avgRating || 0) / 5;

  // Variety: 1.0 if cuisine not in the last meals, 0 otherwise
  const variety = (!cuisine_type || recentCuisines.includes(cuisine_type)) ? 0 : 1.0;

  // Frequency: visitCount / maxVisitCount (proven favourites)
  const frequency = maxVisitCount > 0 ? (visitCount / maxVisitCount) : 0;

  const planned = PLANNED_BONUS[plannedPriority] || 0;

  const total =
    recency * WEIGHTS.recency +
    rating * WEIGHTS.rating +
    variety * WEIGHTS.variety +
    frequency * WEIGHTS.frequency +
    planned;

  return { recency, rating, variety, frequency, planned, total };
}

// now: epoch ms
export function generateExplanation(scores, data, now) {
  const parts = [];

  if (data.lastVisitedAt) {
    const daysSince = Math.floor((now - new Date(data.lastVisitedAt).getTime()) / MS_PER_DAY);
    if (daysSince >= 7) parts.push(`Haven't been in ${daysSince} days`);
  } else {
    parts.push('Never tried before');
  }

  if (data.avgRating >= 4) parts.push(`Rated ${data.avgRating.toFixed(1)} stars`);
  if (scores.variety === 1.0) parts.push('Different from your recent meals');
  if (data.plannedPriority) parts.push(`On your planned list (${data.plannedPriority} priority)`);
  if (scores.frequency >= 0.5) parts.push('A proven favorite');

  return parts.join(' + ') || 'Worth checking out';
}

// candidates: [{ restaurant, lastVisitedAt, avgRating, visitCount, plannedPriority }]
// Returns the top restaurants, each with `scores` and `explanation`.
export function rankRestaurants(candidates, { recentCuisines, maxVisitCount, today, now }) {
  const scored = candidates.map(c => {
    const scores = scoreRestaurant({
      lastVisitedAt: c.lastVisitedAt,
      avgRating: c.avgRating,
      recentCuisines,
      cuisine_type: c.restaurant.cuisine_type,
      visitCount: c.visitCount,
      maxVisitCount,
      plannedPriority: c.plannedPriority,
    }, today);
    const explanation = generateExplanation(scores, {
      lastVisitedAt: c.lastVisitedAt,
      avgRating: c.avgRating,
      plannedPriority: c.plannedPriority,
    }, now);
    return { ...c.restaurant, scores, explanation };
  });
  scored.sort((a, b) => b.scores.total - a.scores.total);
  return scored.slice(0, SUGGESTION_COUNT);
}

// ---------------------------------------------------------------------------
// Meal suggester
// ---------------------------------------------------------------------------

// now: Date. timeZone: the IANA zone the day, period and date are read in.
export function mealContext(now, timeZone) {
  const zone = zoneReader(timeZone);
  return { dayOfWeek: zone.dayOfWeek(now), mealPeriod: zone.mealPeriod(now), today: zone.calendarDate(now) };
}

// How much to trust the profile: 0 with no profile, 1 at 20+ meals.
export function profileConfidence(profile) {
  return profile ? Math.min(profile.total_meals / CONFIDENT_MEAL_COUNT, 1.0) : 0;
}

export function profileAdventureRatio(profile) {
  return profile ? profile.adventure_ratio : DEFAULT_ADVENTURE_RATIO;
}

// One roll per suggestion slot: 'new' with probability adventureRatio.
export function rollSlotTypes(adventureRatio, rng) {
  return Array.from({ length: SUGGESTION_COUNT }, () => (rng() < adventureRatio ? 'new' : 'familiar'));
}

// A price filter from the user wins over the profile's usual price.
export function effectivePriceRange(priceRange, profile) {
  return priceRange || (profile ? Math.round(profile.avg_price_range) : null);
}

// Visits on or after this ISO timestamp count as "just eaten". The cooldown
// counts whole calendar days, not a rolling 48 hours: it starts at local
// midnight FAMILIAR_COOLDOWN_DAYS before `today` (YYYY-MM-DD) in the user's zone.
export function familiarCutoff(today, timeZone) {
  return startOfDayInstant(shiftCalendarDate(today, -FAMILIAR_COOLDOWN_DAYS), timeZone);
}

// A last visit before this date (YYYY-MM-DD) counts as "not lately".
export function staleCutoff(today) {
  return shiftCalendarDate(today, -STALE_AFTER_DAYS);
}

// Drops restaurants eaten at in the same meal period within the cooldown.
// recentVisits: Map restaurantId -> [visited_at]. timeZone: the zone periods are read in.
export function excludeRecentlyEaten(candidates, recentVisits, mealPeriod, timeZone) {
  const zone = zoneReader(timeZone);
  return candidates.filter(r =>
    !(recentVisits.get(r.id) || []).some(visitedAt => zone.mealPeriod(visitedAt) === mealPeriod));
}

// The "different cuisine" source only applies when no cuisine is filtered.
export function wantsOtherCuisines(topCuisine, cuisine) {
  return Boolean(topCuisine && !cuisine);
}

// Concatenates restaurant lists in priority order, keeping the first of each id.
export function mergeByPriority(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const r of list) {
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    }
  }
  return out;
}

// Why a pool picked a restaurant. source: 'familiar' | 'planned' |
// 'never_visited' | 'not_lately' | 'other_cuisine' | 'new' (any new pick).
const POOL_REASONS = {
  familiar: () => 'One of your usual places for this time',
  planned: (row) => `On your planned list (${row.priority} priority)`,
  never_visited: () => 'Never tried before',
  not_lately: () => "Haven't been in a while",
  other_cuisine: () => 'A change from your usual cuisine',
  new: () => 'Something new to try',
};

export function pickExplanation(row, source) {
  return POOL_REASONS[source](row);
}

// A row keeps the explanation it has (the scorer's); otherwise it gets its pool's.
const explained = (row, source) => (row.explanation ? row : { ...row, explanation: pickExplanation(row, source) });

export function withExplanations(rows, source) {
  return rows.map(r => explained(r, source));
}

// The new pool: each source explained, merged in priority order.
export function mergeNewPool({ planned, neverVisited, notLately, otherCuisines }) {
  return mergeByPriority(
    withExplanations(planned, 'planned'),
    withExplanations(neverVisited, 'never_visited'),
    withExplanations(notLately, 'not_lately'),
    withExplanations(otherCuisines, 'other_cuisine'),
  );
}

// Suggestions when the profile carries no confidence: the scorer's picks, all new.
export function tagAsNew(restaurants) {
  return restaurants.slice(0, SUGGESTION_COUNT).map((r, i) => ({
    ...explained(r, 'new'),
    suggestion_type: 'new',
    is_top_pick: i === 0,
  }));
}

// Fills each slot from its own pool, or from the other pool when that one is
// empty. A suggestion is labelled with the pool it came from.
export function assembleMealSuggestions(slotTypes, familiarPool, newPool) {
  const pools = { familiar: familiarPool, new: newPool };
  const cursors = { familiar: 0, new: 0 };
  const used = new Set();
  const take = (kind) => {
    const pool = pools[kind];
    while (cursors[kind] < pool.length) {
      const candidate = pool[cursors[kind]++];
      if (!used.has(candidate.id)) return candidate;
    }
    return null;
  };

  const results = [];
  for (const slotType of slotTypes) {
    if (results.length >= SUGGESTION_COUNT) break;
    const other = slotType === 'familiar' ? 'new' : 'familiar';
    let source = slotType;
    let picked = take(slotType);
    if (!picked) {
      source = other;
      picked = take(other);
    }
    if (picked) {
      used.add(picked.id);
      results.push({ ...explained(picked, source), suggestion_type: source, is_top_pick: results.length === 0 });
    }
  }
  return results;
}

export function needsTopUp(results) {
  return results.length < SUGGESTION_COUNT;
}

// Adds scorer picks, tagged new, until there are enough suggestions.
export function topUpSuggestions(results, fallback) {
  const used = new Set(results.map(r => r.id));
  const out = [...results];
  for (const r of fallback) {
    if (out.length >= SUGGESTION_COUNT) break;
    if (used.has(r.id)) continue;
    used.add(r.id);
    out.push({ ...explained(r, 'new'), suggestion_type: 'new', is_top_pick: out.length === 0 });
  }
  return out;
}
