/**
 * Map Supabase/Postgres errors to user-friendly messages.
 */
export function friendlySupabaseError(error, context = 'save') {
  if (!error) return `Failed to ${context}. Please try again.`;

  const code = error.code || '';
  const message = error.message || '';

  if (code === '42501' || message.includes('row-level security')) {
    return (
      'You do not have permission to change the menu for this restaurant. ' +
      'Ask the owner to add your account to restaurant_staff in Supabase ' +
      '(see supabase/migrations/20260612_admin_rls.sql).'
    );
  }

  if (code === 'PGRST204' && message.includes('menu_type')) {
    return (
      'The menu_type column is missing from menu_categories. ' +
      'Run supabase/migrations/20260710_menu_type.sql in the Supabase SQL Editor.'
    );
  }

  if (code === '23505') {
    return 'A category with that name already exists.';
  }

  return message || `Failed to ${context}. Please try again.`;
}
