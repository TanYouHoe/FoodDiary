// Logic: the meal period and weekday of a timestamp.
//
// Both read the hour and the weekday in the local time zone of the machine
// that runs the code. The same timestamp can therefore land in a different
// period on a server in another zone. Recorded in
// docs/plans/2026-09-15-four-layer-shape.md; not changed by the refactor.

export const MEAL_PERIODS = ['breakfast', 'lunch', 'tea', 'dinner', 'supper'];

// breakfast < 11 <= lunch < 15 <= tea < 17 <= dinner < 21 <= supper
export function getMealPeriod(visitedAt) {
  const hour = new Date(visitedAt).getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'tea';
  if (hour < 21) return 'dinner';
  return 'supper';
}

// 0 = Sunday .. 6 = Saturday
export function getDayOfWeek(visitedAt) {
  return new Date(visitedAt).getDay();
}
