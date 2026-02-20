import { supabase } from '../config/supabase';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes('Invalid login credentials')) throw new Error('Incorrect email or password.');
    if (error.message.includes('Email not confirmed')) throw new Error('Please confirm your email before signing in.');
    throw new Error('Sign in failed. Please try again.');
  }

  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getRestaurantForUser(userId) {
  const { data, error } = await supabase
    .from('restaurant_staff')
    .select(`
      role,
      restaurant_id,
      restaurants (*)
    `)
    .eq('auth_user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') throw new Error('No restaurant found for this account.');
    throw error;
  }

  return {
    role: data.role,
    restaurant: data.restaurants
  };
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => callback(event, session?.user ?? null)
  );

  return () => subscription.unsubscribe();
}