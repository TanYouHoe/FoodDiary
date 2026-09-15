// Logic: the meal period, weekday and calendar date of a timestamp, calendar
// arithmetic, and which time zone to read them in.
//
// Every reading takes an IANA time zone and formats the instant into that
// zone with Intl.DateTimeFormat. Nothing here reads the machine's zone, so a
// server in any zone gives the same answer. A missing or unknown zone throws.
//
// Building a formatter is slow, so zoneReader(timeZone) builds one and reads
// many instants with it. Callers that read many timestamps take one reader per
// call; the get* functions are one-off wrappers.

export const MEAL_PERIODS = ['breakfast', 'lunch', 'tea', 'dinner', 'supper'];

// A browser that swaps zones back and forth changes the stored zone at most this often.
export const TIME_ZONE_CHANGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MS_PER_DAY = 86400000;

// The canonical IANA name of a zone ('utc' -> 'UTC'), or null for anything that
// is not a named zone Intl accepts. Offset strings such as '+08:00' are refused.
export function canonicalTimeZone(tz) {
  if (typeof tz !== 'string' || tz === '' || tz.startsWith('+') || tz.startsWith('-')) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isValidTimeZone(tz) {
  return canonicalTimeZone(tz) !== null;
}

// The zone to read a request in: a valid header, else the stored zone, else the fallback.
export function resolveTimeZone({ header, stored, fallback }) {
  return canonicalTimeZone(header) ?? canonicalTimeZone(stored) ?? fallback;
}

// A header zone replaces the stored one only when it is valid and different,
// and either no zone is stored or the stored one is older than the interval.
// storedAt: ISO timestamp or null. now: Date or epoch ms.
export function shouldStoreTimeZone({ header, stored, storedAt, now }) {
  const zone = canonicalTimeZone(header);
  if (zone === null || zone === canonicalTimeZone(stored)) return false;
  if (stored == null || storedAt == null) return true;
  return Number(now) - Date.parse(storedAt) > TIME_ZONE_CHANGE_INTERVAL_MS;
}

// breakfast < 11 <= lunch < 15 <= tea < 17 <= dinner < 21 <= supper
function periodOfHour(hour) {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'tea';
  if (hour < 21) return 'dinner';
  return 'supper';
}

// One formatter for one zone. Instants: ISO timestamp, epoch ms or Date.
export function zoneReader(timeZone) {
  const zone = canonicalTimeZone(timeZone);
  if (zone === null) throw new RangeError(`Invalid time zone: ${timeZone}`);
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const partsOf = (at) => Object.fromEntries(format.formatToParts(new Date(at)).map(p => [p.type, p.value]));

  // How far the zone's wall clock is ahead of UTC at an instant (ms).
  const offsetMs = (instantMs) => {
    const p = partsOf(instantMs);
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    return wall - Math.floor(instantMs / 1000) * 1000;
  };

  return {
    timeZone: zone,
    mealPeriod: (at) => periodOfHour(Number(partsOf(at).hour)),
    // 0 = Sunday .. 6 = Saturday
    dayOfWeek: (at) => WEEKDAYS.indexOf(partsOf(at).weekday),
    // YYYY-MM-DD
    calendarDate: (at) => {
      const { year, month, day } = partsOf(at);
      return `${year}-${month}-${day}`;
    },
    // date: YYYY-MM-DD. The ISO instant of 00:00 on that date in the zone. The
    // second pass corrects for a daylight-saving change between midnight and the
    // first guess. On a day with no local midnight (the clock jumps from 00:00
    // to 01:00), it returns 23:00 of the previous day, one hour early.
    startOfDay: (date) => {
      const [y, m, d] = date.split('-').map(Number);
      const wallMidnight = Date.UTC(y, m - 1, d);
      const firstGuess = wallMidnight - offsetMs(wallMidnight);
      return new Date(wallMidnight - offsetMs(firstGuess)).toISOString();
    },
  };
}

export const getMealPeriod = (visitedAt, timeZone) => zoneReader(timeZone).mealPeriod(visitedAt);
export const getDayOfWeek = (visitedAt, timeZone) => zoneReader(timeZone).dayOfWeek(visitedAt);
export const getCalendarDate = (visitedAt, timeZone) => zoneReader(timeZone).calendarDate(visitedAt);
export const startOfDayInstant = (date, timeZone) => zoneReader(timeZone).startOfDay(date);

// date: YYYY-MM-DD. The calendar date `days` later (negative for earlier).
// Plain UTC date arithmetic, so no zone is involved.
export function shiftCalendarDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
