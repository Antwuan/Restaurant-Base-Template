import { supabase } from '../config/supabase';

export const MENU_IMAGES_BUCKET = 'menu-images';

/**
 * Upload a local file URI (web blob) to Supabase Storage.
 * @returns {{ path: string, publicUrl: string }}
 */
export async function uploadFileFromUri({
  bucket = MENU_IMAGES_BUCKET,
  path,
  uri,
  contentType = 'application/octet-stream',
  upsert = true,
}) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType,
    upsert,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function deleteStorageObject(path, bucket = MENU_IMAGES_BUCKET) {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export function carouselStoragePath(restaurantId, slideId, extension) {
  return `${restaurantId}/carousel/${slideId}.${extension}`;
}
