import { supabase } from '../config/supabase';
import { deleteStorageObject } from './storageService';
import { updateRestaurant } from './restaurantService';

export async function getActiveImages(restaurantId) {
  const { data, error } = await supabase
    .from('menu_gallery_images')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getAllImages(restaurantId) {
  const { data, error } = await supabase
    .from('menu_gallery_images')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createImage(imageData) {
  const { data, error } = await supabase
    .from('menu_gallery_images')
    .insert(imageData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateImage(imageId, updates) {
  const { data, error } = await supabase
    .from('menu_gallery_images')
    .update(updates)
    .eq('id', imageId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteImage(image) {
  if (image?.storage_path) {
    await deleteStorageObject(image.storage_path);
  }

  const { error } = await supabase
    .from('menu_gallery_images')
    .delete()
    .eq('id', image.id);

  if (error) throw error;
}

export async function reorderImages(orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) => updateImage(id, { sort_order: index })),
  );
}

export async function updateGallerySettings(restaurantId, updates) {
  return updateRestaurant(restaurantId, updates);
}
