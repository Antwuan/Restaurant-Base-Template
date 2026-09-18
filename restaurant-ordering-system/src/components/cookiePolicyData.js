/**
 * Shared copy for the cookie banner, the preferences sheet and /cookies.
 *
 * STORAGE_INVENTORY is the real list of keys this app writes. It was taken
 * from the code, not from a template — if you add a new localStorage /
 * sessionStorage key, add it here too.
 */

export const COOKIE_CATEGORIES = [
  {
    id: 'essential',
    title: 'Strictly necessary',
    locked: true,
    summary:
      'Keeps you signed in, remembers your cart and pickup location, and stops '
      + 'a checkout from being charged twice. The site cannot work without these.',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    locked: false,
    summary:
      'Remembers optional display settings, such as the dark mode toggle in the '
      + 'staff dashboard. Turning this off does not affect ordering.',
  },
  {
    id: 'marketing',
    title: 'Marketing',
    locked: false,
    summary:
      'We do not run advertising or analytics trackers today. This switch records '
      + 'your choice in advance so no marketing storage is ever added without it. '
      + 'Email marketing is opt-in separately at sign-up and checkout.',
  },
];

/**
 * category: which switch controls the key
 * store:    'localStorage' | 'sessionStorage'
 * retention: plain-language lifetime
 */
export const STORAGE_INVENTORY = [
  {
    category: 'essential',
    key: 'restaurant-auth',
    store: 'localStorage',
    purpose: 'Your signed-in session token (Supabase Auth). Guests never get one.',
    retention: 'Until you sign out or the session expires.',
  },
  {
    category: 'essential',
    key: 'restaurant_cart_regular',
    store: 'localStorage',
    purpose: 'Items in your everyday menu cart.',
    retention: 'Until the order is placed or you empty the cart.',
  },
  {
    category: 'essential',
    key: 'restaurant_cart_catering',
    store: 'localStorage',
    purpose: 'Items in your catering cart.',
    retention: 'Until the order is placed or you empty the cart.',
  },
  {
    category: 'essential',
    key: 'restaurant_cart',
    store: 'localStorage',
    purpose: 'Older single-cart key, migrated into the two carts above and then deleted.',
    retention: 'Removed on your first visit after the upgrade.',
  },
  {
    category: 'essential',
    key: 'pickup_location_<restaurant id>',
    store: 'localStorage',
    purpose: 'Which store location you chose to pick up from.',
    retention: 'Until you pick a different location.',
  },
  {
    category: 'essential',
    key: 'checkout_attempt:<restaurant id>:checkout and :catering',
    store: 'sessionStorage',
    purpose:
      'A one-time payment key so a refresh during checkout cannot charge your card twice.',
    retention: 'Cleared when the order completes or is abandoned.',
  },
  {
    category: 'essential',
    key: 'restaurant_last_confirmation',
    store: 'sessionStorage',
    purpose: 'Your order details, so the confirmation page survives a refresh.',
    retention: 'Cleared when you close the browser tab.',
  },
  {
    category: 'essential',
    key: 'restaurant_slug',
    store: 'sessionStorage',
    purpose: 'Which restaurant this tab is browsing (preview and local URLs only).',
    retention: 'Cleared when you close the browser tab.',
  },
  {
    category: 'essential',
    key: 'canonical_host_redirect',
    store: 'sessionStorage',
    purpose:
      'A one-time guard so the redirect between www and the bare domain cannot loop.',
    retention: 'Cleared when you close the browser tab.',
  },
  {
    category: 'essential',
    key: 'restaurant_brand:<hostname>',
    store: 'localStorage',
    purpose:
      'The site colours and name, cached so the page does not flash the wrong brand while loading. No personal data.',
    retention: 'Until the restaurant changes its branding.',
  },
  {
    category: 'essential',
    key: 'restaurant_cookie_consent',
    store: 'localStorage',
    purpose:
      'Your choices on this page. Kept even if you decline the optional categories, so we do not ask again.',
    retention: 'Until you clear your browser storage.',
  },
  {
    category: 'preferences',
    key: 'admin_dark_mode',
    store: 'localStorage',
    purpose: 'Dark mode for the staff dashboard. Not used on customer pages.',
    retention: 'Removed if you decline the Preferences category.',
  },
];

export const STORE_LABEL = {
  localStorage: 'Local storage',
  sessionStorage: 'Session storage',
};
