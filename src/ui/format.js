// UI: text formatting for the screens. The clock arrives as `now` (a Date).

export const PRICE_LABELS = { 1: 'Budget', 2: 'Moderate', 3: 'Upscale', 4: 'Fine Dining' };

export function priceDisplay(range) {
  return '$'.repeat(range || 0);
}

export function stars(rating) {
  const full = Math.round(rating || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const pad = (n) => String(n).padStart(2, '0');

export function timeAgo(dateStr, now) {
  const d = new Date(dateStr);
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function formatDateLabel(dateStr, now) {
  const d = new Date(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mealDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - mealDay) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Local calendar day, YYYY-MM-DD
export function dateKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Value for <input type="date">, local day
export const toDateInput = dateKey;

// Value for <input type="time">, local time
export function toTimeInput(dateStr) {
  const d = new Date(dateStr);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DATE_TIME = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };

export function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, DATE_TIME);
}

// As formatDateTime, but an unreadable date shows as given.
export function formatDateTimeOrRaw(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, DATE_TIME);
}

export function formatShortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
