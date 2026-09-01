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
    if (!data || !HEX_RE.test(data.primary)) return null;
    return {
      primary: data.primary,
      name: typeof data.name === 'string' && data.name ? data.name : null,
    };
  } catch {
    return null;
  }
}

export function writeBrandCache({ primary, name } = {}, hostname) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!HEX_RE.test(primary || '')) return;
    const key = brandCacheKey(hostname);
    if (!key) return;
    localStorage.setItem(
      key,
      JSON.stringify({
        primary,
        name: typeof name === 'string' ? name : '',
      }),
    );
  } catch {
    // ignore storage errors
  }
}
