/**
 * hoursUtils.js
 * Utilities for working with restaurant hours_of_operation.
 *
 * hours_of_operation shape:
 *   {
 *     mon: { closed: false, open: "08:00", close: "15:00" },
 *     tue: { closed: false, open: "08:00", close: "15:00" },
 *     wed: { closed: true,  open: "08:00", close: "15:00" },
 *     ...
 *   }
 */

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_LABELS = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};
export const DAY_SHORT = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

/** Default hours used when a restaurant hasn't configured theirs yet */
export const DEFAULT_HOURS = {
  sun: { closed: false, open: '08:00', close: '15:00' },
  mon: { closed: false, open: '08:00', close: '15:00' },
  tue: { closed: false, open: '08:00', close: '15:00' },
  wed: { closed: false, open: '08:00', close: '15:00' },
  thu: { closed: false, open: '08:00', close: '15:00' },
  fri: { closed: false, open: '08:00', close: '15:00' },
  sat: { closed: false, open: '08:00', close: '15:00' },
};

/**
 * Returns merged hours with DEFAULT_HOURS as fallback.
 */
export function resolveHours(hours_of_operation) {
  if (!hours_of_operation) return DEFAULT_HOURS;
  const result = {};
  for (const key of DAY_KEYS) {
    result[key] = { ...DEFAULT_HOURS[key], ...(hours_of_operation[key] || {}) };
  }
  return result;
}

/**
 * Returns true if the restaurant is currently open, based on local time.
 */
export function isOpenNow(hours_of_operation) {
  const hours = resolveHours(hours_of_operation);
  const now = new Date();
  const dayKey = DAY_KEYS[now.getDay()];
  const dayHours = hours[dayKey];
  if (!dayHours || dayHours.closed) return false;

  const [openH, openM] = dayHours.open.split(':').map(Number);
  const [closeH, closeM] = dayHours.close.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  return nowMins >= openMins && nowMins < closeMins;
}

/**
 * Returns a human-readable label for today's hours, e.g. "8:00 AM – 3:00 PM".
 * Returns "Closed today" if closed.
 */
export function getTodayHoursLabel(hours_of_operation) {
  const hours = resolveHours(hours_of_operation);
  const now = new Date();
  const dayKey = DAY_KEYS[now.getDay()];
  const dayHours = hours[dayKey];
  if (!dayHours || dayHours.closed) return 'Closed today';
  return `${formatTime12(dayHours.open)} – ${formatTime12(dayHours.close)}`;
}

/**
 * Returns a label like "Closed until Thursday at 9:00 AM" by scanning forward.
 * Returns null if open now.
 */
export function getClosedUntilLabel(hours_of_operation) {
  if (isOpenNow(hours_of_operation)) return null;
  const hours = resolveHours(hours_of_operation);
  const now = new Date();
  const todayIdx = now.getDay();

  for (let offset = 0; offset < 7; offset++) {
    const dayIdx = (todayIdx + offset) % 7;
    const key = DAY_KEYS[dayIdx];
    const day = hours[key];
    if (!day || day.closed) continue;

    const [openH, openM] = day.open.split(':').map(Number);

    // Same day: check if the opening time is still in the future
    if (offset === 0) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const openMins = openH * 60 + openM;
      if (nowMins < openMins) {
        return `Closed until today at ${formatTime12(day.open)}`;
      }
      // Already past closing — continue to next day
      continue;
    }

    const label = offset === 1 ? 'tomorrow' : DAY_LABELS[key];
    return `Closed until ${label} at ${formatTime12(day.open)}`;
  }
  return 'Closed temporarily';
}

/**
 * Returns array of ISO datetime strings for available 15-min pickup slots
 * for a given date, constrained to the restaurant's hours.
 *
 * @param {string|Date} date  - The target date (Date or ISO string)
 * @param {object}      hours_of_operation
 * @param {number}      intervalMins - slot interval (default 15)
 * @returns {Date[]}
 */
export function getSlotTimesForDate(date, hours_of_operation, intervalMins = 15) {
  const hours = resolveHours(hours_of_operation);
  const d = new Date(date);
  const dayKey = DAY_KEYS[d.getDay()];
  const dayHours = hours[dayKey];
  if (!dayHours || dayHours.closed) return [];

  const [openH, openM] = dayHours.open.split(':').map(Number);
  const [closeH, closeM] = dayHours.close.split(':').map(Number);
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;

  const slots = [];
  for (let m = openMins; m < closeMins; m += intervalMins) {
    const slotDate = new Date(d);
    slotDate.setHours(Math.floor(m / 60), m % 60, 0, 0);
    slots.push(slotDate);
  }
  return slots;
}

/**
 * Returns the earliest catering pickup date (today + minDaysAhead, skipping
 * closed days).
 *
 * @param {object} hours_of_operation
 * @param {number} minDaysAhead - minimum days ahead (default 2)
 * @returns {Date}
 */
export function getEarliestCateringDate(hours_of_operation, minDaysAhead = 2) {
  const hours = resolveHours(hours_of_operation);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + minDaysAhead);

  for (let i = 0; i < 30; i++) {
    const key = DAY_KEYS[d.getDay()];
    if (hours[key] && !hours[key].closed) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Formats "HH:MM" → "H:MM AM/PM"
 */
export function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Formats a Date → "H:MM AM/PM"
 */
export function formatDateTo12(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Formats a Date → "Mon, Jan 20"
 */
export function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
