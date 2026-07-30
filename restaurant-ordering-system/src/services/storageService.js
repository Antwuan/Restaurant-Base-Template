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

export function menuImageStoragePath(restaurantId, itemId, extension) {
  return `${restaurantId}/menu/${itemId}.${extension}`;
}

export function galleryStoragePath(restaurantId, imageId, extension = 'jpg') {
  return `${restaurantId}/gallery/${imageId}.${extension}`;
}

export function aboutImageStoragePath(restaurantId, extension = 'jpg') {
  return `${restaurantId}/about.${extension}`;
}

// ─── Applications (resume PDFs) ──────────────────────────────────────────────

export const APPLICATIONS_BUCKET = 'applications';

export function applicationStoragePath(restaurantId, fileId) {
  return `${restaurantId}/applications/${fileId}.pdf`;
}

/**
 * Upload a PDF File object to the applications bucket.
 * @param {{ restaurantId: string, fileId: string, file: File }} opts
 * @returns {{ path: string, publicUrl: string }}
 */
export async function uploadApplicationPDF({ restaurantId, fileId, file }) {
  const path = applicationStoragePath(restaurantId, fileId);
  const { error } = await supabase.storage
    .from(APPLICATIONS_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(APPLICATIONS_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export function getApplicationPDFUrl(resumePath) {
  if (!resumePath) return null;
  const { data } = supabase.storage.from(APPLICATIONS_BUCKET).getPublicUrl(resumePath);
  return data.publicUrl;
}
