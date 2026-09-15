// UI: turns saved records into the controlled values of the edit forms.
// The clock arrives as `now` (a Date).

import { toEditableDishes } from '../../logic/dishes.js';
import { DEFAULT_PRICE_RANGE } from '../../logic/restaurants.js';
import { toDateInput, toTimeInput, utcDateInput } from './format.js';

export function newMealForm(now) {
  return {
    restaurantId: '',
    title: '',
    dishes: [],
    calories: '',
    rating: 3,
    date: utcDateInput(now),
    time: toTimeInput(now),
    notes: '',
    groupId: '',
  };
}

export function mealFormFrom(meal) {
  return {
    restaurantId: meal.restaurant_id,
    title: meal.title || '',
    dishes: toEditableDishes(meal.dishes),
    calories: meal.calories || '',
    rating: meal.rating,
    date: toDateInput(meal.visited_at),
    time: toTimeInput(meal.visited_at),
    notes: meal.notes || '',
    groupId: meal.group_id || '',
  };
}

export const emptyRestaurantForm = { name: '', cuisine: '', price: String(DEFAULT_PRICE_RANGE), address: '' };

export function restaurantFormFrom(restaurant) {
  return {
    name: restaurant.name,
    cuisine: restaurant.cuisine_type || '',
    price: String(restaurant.price_range || DEFAULT_PRICE_RANGE),
    address: restaurant.address || '',
  };
}

export function mealTypeFormFrom(mealType) {
  return {
    name: mealType?.name || '',
    cuisineType: mealType?.cuisine_type || '',
    slots: mealType?.slots?.length > 0 ? mealType.slots.map(s => ({ name: s.name })) : [{ name: 'Main' }],
  };
}
