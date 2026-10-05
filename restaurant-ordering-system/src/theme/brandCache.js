/**
 * Hostname-keyed restaurant brand cache for first-paint color.
 *
 * The key prefix MUST stay in sync with the inline script in public/index.html.
 */

export const BRAND_CACHE_PREFIX = 'restaurant_brand:';
export const NEUTRAL_THEME_COLOR = '#f3f4f6';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function currentHostname() {
  if (typeof window === 'undefined') return null;
  return window.location.hostname || null;
}

export function brandCacheKey(hostname) {
  const host = hostname || currentHostname();
  if (!host) return null;
  return `${BRAND_CACHE_PREFIX}${host}`;
}

export function readBrandCache(hostname) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const key = brandCacheKey(hostname);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const primary = HEX_RE.test(data.primary) ? data.primary : null;
    const name = typeof data.name === 'string' && data.name ? data.name : null;
    const businessType = data.businessType === 'appointment' || data.businessType === 'restaurant'
      ? data.businessType
      : null;
    if (!primary && !name && !businessType) return null;
    return { primary, name, businessType };
  } catch {
    return null;
  }
}

export function writeBrandCache({ primary, name, businessType } = {}, hostname) {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = brandCacheKey(hostname);
    if (!key) return;
    const type = businessType === 'appointment' || businessType === 'restaurant'
      ? businessType
      : null;
    const hasColor = HEX_RE.test(primary || '');
    if (!hasColor && !type) return;

    let previous = null;
    try {
      const raw = localStorage.getItem(key);
      previous = raw ? JSON.parse(raw) : null;
    } catch {
      previous = null;
    }

    const nextPrimary = hasColor
      ? primary
      : (HEX_RE.test(previous?.primary) ? previous.primary : null);
    const nextName = typeof name === 'string'
      ? name
      : (typeof previous?.name === 'string' ? previous.name : '');
    const nextType = type
      || (previous?.businessType === 'appointment' || previous?.businessType === 'restaurant'
        ? previous.businessType
        : null);
    if (!nextPrimary && !nextType) return;

    localStorage.setItem(
      key,
      JSON.stringify({
        primary: nextPrimary,
        name: nextName,
        businessType: nextType,
      }),
    );
  } catch {
    // ignore storage errors
  }
}
