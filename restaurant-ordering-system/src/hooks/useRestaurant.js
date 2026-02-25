import { useState, useEffect } from 'react';
import { restaurantService } from '../services/restaurantService';

export const useRestaurant = () => {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadRestaurant = async () => {
      try {
        setLoading(true);
        setError(null);

        // Web: detect from hostname or URL param
        const hostname = window.location.hostname;
        const params = new URLSearchParams(window.location.search);
        const slugParam = params.get('restaurant');

        let data;

        if (slugParam) {
          // Dev fallback: ?restaurant=my-slug
          data = await restaurantService.getRestaurantBySlug(slugParam);
        } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
          // Local dev: load a default test restaurant
          data = await restaurantService.getRestaurantBySlug(
            process.env.REACT_APP_DEFAULT_RESTAURANT_SLUG || 'demo'
          );
        } else {
          // Production: match full domain
          data = await restaurantService.getRestaurantByDomain(hostname);
        }

        setRestaurant(data);
      } catch (err) {
        setError(err.message || 'Failed to load restaurant');
      } finally {
        setLoading(false);
      }
    };

    loadRestaurant();
  }, []);

  const refetch = async () => {
    setLoading(true);
    try {
      const hostname = window.location.hostname;
      const params = new URLSearchParams(window.location.search);
      const slugParam = params.get('restaurant');

      let data;
      if (slugParam) {
        data = await restaurantService.getRestaurantBySlug(slugParam);
      } else {
        data = await restaurantService.getRestaurantByDomain(hostname);
      }
      setRestaurant(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { restaurant, loading, error, refetch };
};