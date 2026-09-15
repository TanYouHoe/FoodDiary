// Logic: the meal period, weekday and calendar date of a timestamp, calendar
// arithmetic, wall-clock times, and which time zone to read them in.
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

// Only named zones: offset strings such as '+08:00' are refused before Intl sees them.
const isZoneName = (tz) => typeof tz === 'string' && tz !== '' && !tz.startsWith('+') && !tz.startsWith('-');

// The canonical IANA name of a zone ('utc' -> 'UTC'), or null for anything that
// is not a named zone Intl accepts.
export function canonicalTimeZone(tz) {
  if (!isZoneName(tz)) return null;
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
// and either no zone is stored, its stored time cannot be read, or it is older
// than the interval. storedAt: ISO timestamp or null. now: Date or epoch ms.
export function shouldStoreTimeZone({ header, stored, storedAt, now }) {
  const zone = canonicalTimeZone(header);
  if (zone === null || zone === canonicalTimeZone(stored)) return false;
  if (stored == null) return true;
  const storedMs = typeof storedAt === 'string' ? Date.parse(storedAt) : NaN;
  if (Number.isNaN(storedMs)) return true;
  return Number(now) - storedMs > TIME_ZONE_CHANGE_INTERVAL_MS;
}

// breakfast < 11 <= lunch < 15 <= tea < 17 <= dinner < 21 <= supper
function periodOfHour(hour) {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 17) return 'tea';
  if (hour < 21) return 'dinner';
  return 'supper';
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/;

// A zone-less date-time ('YYYY-MM-DD', optionally 'T' or ' ' then HH:MM[:SS[.fff]])
// as the epoch ms of the same wall-clock reading in UTC. Null when the text is
// not that shape or names an impossible time, such as 2026-02-30 or 24:00.
export function wallClockMs(text) {
  if (typeof text !== 'string') return null;
  const m = LOCAL_DATE_TIME.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(v => (v === undefined ? 0 : Number(v)));
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const back = new Date(wall);
  const roundTrips = back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day
    && back.getUTCHours() === hour && back.getUTCMinutes() === minute && back.getUTCSeconds() === second;
  return roundTrips ? wall : null;
}

// One formatter for one zone. Instants: ISO timestamp, epoch ms or Date.
export function zoneReader(timeZone) {
  let format;
  try {
    if (!isZoneName(timeZone)) throw new RangeError();
    format = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
  const partsOf = (at) => Object.fromEntries(format.formatToParts(new Date(at)).map(p => [p.type, p.value]));

  // How far the zone's wall clock is ahead of UTC at an instant (ms).
  const offsetMs = (instantMs) => {
    const p = partsOf(instantMs);
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    return wall - Math.floor(instantMs / 1000) * 1000;
  };

  // The ISO instant at which the zone's clock reads `wallMs` (see wallClockMs).
  // The second pass corrects for a daylight-saving change between the reading
  // and the first guess. A reading the clock shows twice (fall-back) gets the
  // earlier offset. A reading the clock skips (spring-forward) lands one hour
  // early: 02:30 on a day that jumps from 02:00 to 03:00 becomes 01:30.
  const instantOfWall = (wallMs) => {
    const firstGuess = wallMs - offsetMs(wallMs);
    return new Date(wallMs - offsetMs(firstGuess)).toISOString();
  };

  return {
    timeZone: format.resolvedOptions().timeZone,
    mealPeriod: (at) => periodOfHour(Number(partsOf(at).hour)),
    // 0 = Sunday .. 6 = Saturday
    dayOfWeek: (at) => WEEKDAYS.indexOf(partsOf(at).weekday),
    // YYYY-MM-DD
    calendarDate: (at) => {
      const { year, month, day } = partsOf(at);
      return `${year}-${month}-${day}`;
    },
    // date: YYYY-MM-DD. The ISO instant of 00:00 on that date in the zone. On a
    // day with no local midnight (the clock jumps from 00:00 to 01:00), it
    // returns 23:00 of the previous day, one hour early.
    startOfDay: (date) => {
      const [y, m, d] = date.split('-').map(Number);
      return instantOfWall(Date.UTC(y, m - 1, d));
    },
    instantOfWall,
  };
}

export const getMealPeriod = (visitedAt, timeZone) => zoneReader(timeZone).mealPeriod(visitedAt);
export const getDayOfWeek = (visitedAt, timeZone) => zoneReader(timeZone).dayOfWeek(visitedAt);
export const getCalendarDate = (visitedAt, timeZone) => zoneReader(timeZone).calendarDate(visitedAt);
export const startOfDayInstant = (date, timeZone) => zoneReader(timeZone).startOfDay(date);

// A zone-less date-time read as wall-clock time in the zone, as a UTC ISO
// string. Null when the text is not a zone-less date-time (see wallClockMs);
// a text that already names its zone is not one.
export function localDateTimeToInstant(localText, timeZone) {
  const reader = zoneReader(timeZone);
  const wall = wallClockMs(localText);
  return wall === null ? null : reader.instantOfWall(wall);
}

// date: YYYY-MM-DD. The calendar date `days` later (negative for earlier).
// Plain UTC date arithmetic, so no zone is involved.
export function shiftCalendarDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
