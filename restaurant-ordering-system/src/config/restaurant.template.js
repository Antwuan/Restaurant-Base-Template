/**
 * Restaurant Configuration Template
 *
 * For each new restaurant, copy this file and rename it:
 *   e.g. src/config/restaurants/pizza-palace.js
 *
 * Then import it in your mobile app's entry point (App.js) and pass
 * it to RestaurantContext via the RESTAURANT_CONFIG env or direct import.
 *
 * On web, RestaurantContext detects the restaurant automatically via
 * window.location.hostname or the ?restaurant= query param — this file
 * is only needed for native (iOS / Android) builds.
 */

const restaurantConfig = {
    /**
     * The UUID of this restaurant row in Supabase.
     * Find it in: Supabase Dashboard > Table Editor > restaurants > id
     */
    restaurantId: 'REPLACE_WITH_SUPABASE_UUID',
  
    /**
     * The URL-safe slug for this restaurant.
     * Must match the `slug` column in the restaurants table exactly.
     * Used as a fallback identifier when domain is not set.
     * Example: 'pizza-palace', 'taco-house', 'sushi-zen'
     */
    slug: 'REPLACE_WITH_SLUG',
  
    /**
     * The production domain for this restaurant's web app (optional for MVP).
     * When set, RestaurantContext will match this against window.location.hostname.
     * Leave as null if you're using slug-based routing for now.
     * Example: 'order.pizzapalace.com'
     */
    domain: null,
  };
  
  export default restaurantConfig;