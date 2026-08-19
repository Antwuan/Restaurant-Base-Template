/** Fallback when restaurant/location tax_rate is missing. Matches DB default. */
export const DEFAULT_TAX_RATE = 0.08;

/**
 * Display/charge tax rate: location override when set, else restaurant.tax_rate.
 * Location rows may omit tax_rate; then the restaurant rate is used.
 */
export function resolveTaxRate(restaurant, location) {
  const fromLocation = location?.tax_rate;
  if (fromLocation != null && fromLocation !== '' && Number.isFinite(Number(fromLocation))) {
    return Number(fromLocation);
  }
  const fromRestaurant = restaurant?.tax_rate;
  if (fromRestaurant != null && fromRestaurant !== '' && Number.isFinite(Number(fromRestaurant))) {
    return Number(fromRestaurant);
  }
  return DEFAULT_TAX_RATE;
}

export const APP_CONFIG = {
    appName: 'Restaurant Ordering System',
    version: '1.0.0',
    /** Fallback only — prefer resolveTaxRate(restaurant, pickupLocation). */
    taxRate: DEFAULT_TAX_RATE,
    currency: 'USD',
    currencySymbol: '$',
  };
  
  export const ORDER_STATUSES = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY: 'ready',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  };
  
  export const ORDER_TYPES = {
    PICKUP: 'pickup',
    DELIVERY: 'delivery',
  };