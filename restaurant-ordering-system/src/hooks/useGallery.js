import { useState, useEffect, useCallback } from 'react';
import * as galleryService from '../services/galleryService';

export const useGallery = (restaurantId, { admin = false } = {}) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadImages = useCallback(async () => {
    if (!restaurantId) {
      setImages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = admin
        ? await galleryService.getAllImages(restaurantId)
        : await galleryService.getActiveImages(restaurantId);
      setImages(data);
    } catch (err) {
      setError(err.message || 'Failed to load gallery');
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, admin]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  return {
    images,
    loading,
    error,
    refetch: loadImages,
  };
};
