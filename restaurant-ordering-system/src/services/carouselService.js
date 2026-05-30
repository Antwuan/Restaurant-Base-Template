import { supabase } from '../config/supabase';
import { deleteStorageObject } from './storageService';

export async function getActiveSlides(restaurantId) {
  const { data, error } = await supabase
    .from('menu_carousel_slides')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getAllSlides(restaurantId) {
  const { data, error } = await supabase
    .from('menu_carousel_slides')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createSlide(slideData) {
  const { data, error } = await supabase
    .from('menu_carousel_slides')
    .insert(slideData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSlide(slideId, updates) {
  const { data, error } = await supabase
    .from('menu_carousel_slides')
    .update(updates)
    .eq('id', slideId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSlide(slide) {
  if (slide?.storage_path) {
    await deleteStorageObject(slide.storage_path);
  }

  const { error } = await supabase
    .from('menu_carousel_slides')
    .delete()
    .eq('id', slide.id);

  if (error) throw error;
}

export async function reorderSlides(restaurantId, orderedIds) {
  const updates = orderedIds.map((id, index) =>
    updateSlide(id, { sort_order: index })
  );
  await Promise.all(updates);
  return getAllSlides(restaurantId);
}
