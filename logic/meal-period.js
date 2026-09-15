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
    timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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

const MS_PER_DAY = 86400000;

// date: YYYY-MM-DD. The calendar date `days` later (negative for earlier).
// Plain UTC date arithmetic, so no zone is involved.
export function shiftCalendarDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// How far the zone's wall clock is ahead of UTC at an instant (ms).
function zoneOffsetMs(instantMs, timeZone) {
  const p = partsIn(instantMs, timeZone);
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return wall - Math.floor(instantMs / 1000) * 1000;
}

// date: YYYY-MM-DD. The ISO instant of 00:00 on that date in the zone. The
// second pass corrects for a daylight-saving change between midnight and the
// first guess. In a zone that skips midnight, the instant lands an hour off.
export function startOfDayInstant(date, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const wallMidnight = Date.UTC(y, m - 1, d);
  const firstGuess = wallMidnight - zoneOffsetMs(wallMidnight, timeZone);
  return new Date(wallMidnight - zoneOffsetMs(firstGuess, timeZone)).toISOString();
}
