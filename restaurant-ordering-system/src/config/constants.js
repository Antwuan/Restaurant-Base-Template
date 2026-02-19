export const APP_CONFIG = {
    appName: 'Restaurant Ordering System',
    version: '1.0.0',
    taxRate: 0.08, // 8% tax - adjust per restaurant/location
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