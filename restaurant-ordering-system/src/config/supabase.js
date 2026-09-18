import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'restaurant-auth',
    storage: window.localStorage, // Use localStorage for web
    // Recovery / confirmation links arrive with the token in the URL hash;
    // this consumes it and emits PASSWORD_RECOVERY. Default is true — pinned
    // because /reset-password depends on it.
    detectSessionInUrl: true,
  },
});