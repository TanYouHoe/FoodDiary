// Connector: the external shapes. Each list names the fields a database row
// or joined query row carries into a response. Routes map every row through
// `pick` so a new column never leaks out by accident.

export function pick(row, fields) {
  const out = {};
  for (const f of fields) out[f] = row[f];
  return out;
}

export const USER_FIELDS = ['id', 'name', 'email', 'avatar_url', 'created_at'];

export const RESTAURANT_FIELDS = [
  'id', 'name', 'cuisine_type', 'price_range', 'address', 'lat', 'lng', 'photo_url', 'added_by', 'created_at',
];

// A meal joined with its restaurant and user. `dishes` is replaced by the dish rows.
export const MEAL_FIELDS = [
  'id', 'restaurant_id', 'user_id', 'group_id', 'title', 'calories', 'dishes', 'rating', 'photo_urls',
  'notes', 'visited_at', 'created_at', 'meal_type_id', 'restaurant_name', 'cuisine_type', 'user_name',
];

export const MEAL_DISH_FIELDS = ['id', 'name', 'category'];

export const DISH_SUMMARY_FIELDS = ['name', 'category', 'times_eaten', 'best_rating', 'last_eaten', 'restaurants'];

export const MEAL_TYPE_FIELDS = ['id', 'name', 'cuisine_type', 'slots', 'is_seed'];

export const DISH_TYPE_FIELDS = ['id', 'name', 'keywords', 'is_seed'];

export const GROUP_FIELDS = ['id', 'name', 'invite_code', 'created_by', 'created_at'];

export const GROUP_MEMBER_FIELDS = ['id', 'name', 'email', 'avatar_url', 'role', 'joined_at'];

// A planned visit joined with its restaurant.
export const PLANNED_FIELDS = [
  'id', 'restaurant_id', 'user_id', 'group_id', 'priority', 'notes', 'created_at',
  'restaurant_name', 'cuisine_type', 'price_range', 'address',
];

export const PROFILE_FIELDS = [
  'id', 'user_id', 'day_of_week', 'meal_period', 'avg_price_range', 'adventure_ratio',
  'avg_rating_threshold', 'meal_frequency', 'group_ratio', 'total_meals', 'updated_at',
];
