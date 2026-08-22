import { useState, useEffect, useCallback } from 'react';
import * as carouselService from '../services/carouselService';

export const useCarousel = (restaurantId, { admin = false } = {}) => {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSlides = useCallback(async () => {
    if (!restaurantId) {
      setSlides([]);
      setLoading(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = admin
        ? await carouselService.getAllSlides(restaurantId)
        : await carouselService.getActiveSlides(restaurantId);
      setSlides(data);
    } catch (err) {
      setError(err.message || 'Failed to load carousel');
      setSlides([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, admin]);

  useEffect(() => {
    loadSlides();
  }, [loadSlides]);

  return {
    slides,
    loading,
    error,
    refetch: loadSlides,
  };
};
