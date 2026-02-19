import { supabase } from '../config/supabase';

let _cache = null;

export async function getRestaurantByDomain(domain) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('domain', domain)
    .single();
  if (error) throw error;
  return data;
}

export async function getRestaurantBySlug(slug) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

export async function getRestaurantById(id) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Resolves the current restaurant from the environment (hostname or query param).
 * Uses an in-memory cache so we only hit the DB once per session.
 * @returns {Promise<Object>} Restaurant record from Supabase
 */
export async function resolveRestaurant() {
  // Return cached restaurant if already resolved this session
  if (_cache) return _cache;

  try {
    const hostname = window.location.hostname;
    let data;

    // Local dev: require ?restaurant=slug in the URL (no domain-based lookup)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const slug = new URLSearchParams(window.location.search).get('restaurant');
      if (!slug) throw new Error('Add ?restaurant=your-slug to the URL for local dev');
      data = await getRestaurantBySlug(slug);
    }
    // Vercel preview: optional ?restaurant=slug; otherwise resolve by subdomain/hostname
    else if (hostname.includes('vercel.app')) {
      const slug = new URLSearchParams(window.location.search).get('restaurant');
      data = slug
        ? await getRestaurantBySlug(slug)
        : await getRestaurantByDomain(hostname);
    }
    // Production: resolve by custom domain (e.g. myrestaurant.com)
    else {
      data = await getRestaurantByDomain(hostname);
    }

    _cache = data;
    return _cache;
  } catch (err) {
    // Re-throw user-friendly errors immediately without logging
    if (err.message && err.message.includes('Add ?restaurant=')) {
      throw err;
    }
    
    // Log unexpected errors for debugging
    console.error('resolveRestaurant error:', err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    
    // Supabase "no rows" error codes (can vary by Supabase version)
    if (err.code === 'PGRST116' || err.code === 'PGRST301' || 
        err.message?.includes('No rows') || err.message?.includes('not found')) {
      throw new Error('Restaurant not found. Please ensure the restaurant exists in the database and the slug/domain matches.');
    }
    
    // Provide more context in the error message
    throw new Error(`Failed to load restaurant data: ${err.message || err.toString()}`);
  }
}

export function clearRestaurantCache() {
  _cache = null;
}