import { supabase } from '../config/supabase';

/**
 * Insert a new job application row.
 * resume_path and resume_file_name are optional (applicant may not attach a PDF).
 */
export async function submitApplication({
  restaurantId,
  fullName,
  email,
  phone,
  comment,
  resumePath,
  resumeFileName,
}) {
  // Insert only — no .select().single(). RLS allows public INSERT but
  // staff-only SELECT, so RETURNING would fail for anon applicants.
  const { error } = await supabase
    .from('job_applications')
    .insert({
      restaurant_id: restaurantId,
      full_name: fullName,
      email,
      phone: phone || null,
      comment: comment || null,
      resume_path: resumePath || null,
      resume_file_name: resumeFileName || null,
    });
  if (error) throw error;
  return { ok: true };
}

/**
 * Fetch all applications for a restaurant, newest first.
 * Requires staff auth — enforced by RLS.
 */
export async function listApplications(restaurantId) {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
