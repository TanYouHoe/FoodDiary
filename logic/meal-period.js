// Logic: the meal period, weekday and calendar date of a timestamp, and which
// time zone to read them in.
//
// Every reading takes an IANA time zone and formats the instant into that
// zone with Intl.DateTimeFormat. Nothing here reads the machine's zone, so a
// server in any zone gives the same answer. A missing or unknown zone throws.

export const MEAL_PERIODS = ['breakfast', 'lunch', 'tea', 'dinner', 'supper'];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// True only for a non-empty string that Intl accepts as a time zone.
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The zone to read a request in: a valid header, else the stored zone, else the fallback.
export function resolveTimeZone({ header, stored, fallback }) {
  if (isValidTimeZone(header)) return header;
  if (isValidTimeZone(stored)) return stored;
  return fallback;
}

// A header zone replaces the stored one only when it is valid and different.
export function shouldStoreTimeZone(header, stored) {
  return isValidTimeZone(header) && header !== stored;
}

// visitedAt: an ISO timestamp, epoch ms or Date.
function partsIn(visitedAt, timeZone) {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Invalid time zone: ${timeZone}`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(new Date(visitedAt));
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

// breakfast < 11 <= lunch < 15 <= tea < 17 <= dinner < 21 <= supper
export function getMealPeriod(visitedAt, timeZone) {
  const hour = Number(partsIn(visitedAt, timeZone).hour);
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'tea';
  if (hour < 21) return 'dinner';
  return 'supper';
}

// 0 = Sunday .. 6 = Saturday
export function getDayOfWeek(visitedAt, timeZone) {
  return WEEKDAYS.indexOf(partsIn(visitedAt, timeZone).weekday);
}

// YYYY-MM-DD
export function getCalendarDate(visitedAt, timeZone) {
  const { year, month, day } = partsIn(visitedAt, timeZone);
  return `${year}-${month}-${day}`;
}
