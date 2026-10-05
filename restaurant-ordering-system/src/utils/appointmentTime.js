import { DAY_KEYS, resolveHours } from './hoursUtils';

const FALLBACK_TZ = 'America/New_York';

export function restaurantTimeZone(restaurant) {
  const tz = restaurant?.timezone;
  return typeof tz === 'string' && tz.trim() ? tz.trim() : FALLBACK_TZ;
}

function tzOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = get('hour') === '24' ? '0' : get('hour');
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(hour),
    Number(get('minute')),
    Number(get('second')),
  );
  return asUtc - date.getTime();
}

/** Wall-clock date and time in an IANA zone, as a UTC Date. */
export function zonedDateTimeToUtc(dateStr, timeStr, timeZone) {
  const tz = timeZone || FALLBACK_TZ;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  let utc = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 2; i += 1) {
    utc = Date.UTC(y, m - 1, d, hh, mm, 0) - tzOffsetMs(new Date(utc), tz);
  }
  return new Date(utc);
}

export function formatDateInZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || FALLBACK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayInZone(timeZone) {
  return formatDateInZone(new Date(), timeZone);
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${month}-${day}`;
}

export function weekdayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isClosedDate(dateStr, hoursOfOperation) {
  const hours = resolveHours(hoursOfOperation);
  const key = DAY_KEYS[weekdayIndex(dateStr)];
  return !hours[key] || hours[key].closed;
}

export function formatTimeInZone(iso, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || FALLBACK_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Hour and minute of an instant in an IANA zone. */
export function clockInZone(iso, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || FALLBACK_TZ,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = get('hour') === '24' ? 0 : Number(get('hour'));
  const minute = Number(get('minute'));
  return { hour, minute, minutes: hour * 60 + minute };
}

export function formatAppointmentWhen(iso, timeZone) {
  const tz = timeZone || FALLBACK_TZ;
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
  return `${date} · ${formatTimeInZone(iso, tz)}`;
}

export function formatServicePrice(cents) {
  const n = Number(cents);
  const dollars = Number.isFinite(n) ? n / 100 : 0;
  return `$${dollars.toFixed(2)}`;
}

export function monthLabel(dateStr, timeZone) {
  const noon = zonedDateTimeToUtc(dateStr, '12:00', timeZone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || FALLBACK_TZ,
    month: 'long',
    year: 'numeric',
  }).format(noon);
}
