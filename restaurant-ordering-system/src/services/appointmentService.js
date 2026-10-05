import { supabase } from '../config/supabase';
import { addDays, formatDateInZone, zonedDateTimeToUtc } from '../utils/appointmentTime';

function rpcError(error, fallback) {
  const message = error?.message || error?.details || fallback;
  const cleaned = String(message).replace(/^.*ERROR:\s*/i, '').trim();
  return new Error(cleaned || fallback);
}

export async function listServices(restaurantId, { activeOnly = false } = {}) {
  let query = supabase
    .from('services')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveService(restaurantId, service) {
  const payload = {
    restaurant_id: restaurantId,
    name: service.name.trim(),
    description: (service.description || '').trim(),
    duration_minutes: service.duration_minutes,
    price_cents: service.price_cents,
    is_active: service.is_active !== false,
    sort_order: Number.isFinite(service.sort_order) ? service.sort_order : 0,
  };
  if (!payload.name) throw new Error('Enter a service name');
  if (!Number.isInteger(payload.duration_minutes) || payload.duration_minutes < 1 || payload.duration_minutes > 480) {
    throw new Error('Duration must be between 1 and 480 minutes');
  }
  if (!Number.isInteger(payload.price_cents) || payload.price_cents < 0) {
    throw new Error('Enter a price of zero or more');
  }

  if (service.id) {
    const { data, error } = await supabase
      .from('services')
      .update(payload)
      .eq('id', service.id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('services')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteService(serviceId) {
  const { data, error } = await supabase
    .from('services')
    .delete()
    .eq('id', serviceId)
    .select('id');
  if (error) {
    if (error.code === '23503') {
      throw new Error('This service has appointments. Deactivate it instead.');
    }
    throw error;
  }
  if (!data?.length) {
    throw new Error('This service has appointments. Deactivate it instead.');
  }
}

export async function getAvailability(restaurantId, serviceId, day) {
  const { data, error } = await supabase.rpc('get_appointment_availability', {
    p_restaurant_id: restaurantId,
    p_service_id: serviceId,
    p_day: day,
  });
  if (error) throw rpcError(error, 'Could not load open times');
  return data || [];
}

export async function bookAppointment(serviceId, startsAt) {
  const { data, error } = await supabase.rpc('book_appointment', {
    p_service_id: serviceId,
    p_starts_at: startsAt,
  });
  if (error) throw rpcError(error, 'Could not book that time');
  return data;
}

export async function cancelAppointment(appointmentId) {
  const { data, error } = await supabase.rpc('cancel_appointment', {
    p_appointment_id: appointmentId,
  });
  if (error) throw rpcError(error, 'Could not cancel this appointment');
  return data;
}

export async function listMyUpcomingAppointments(restaurantId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, service_name, duration_minutes, price_cents, starts_at, ends_at, status')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'confirmed')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Confirmed appointments whose start falls on a calendar day in the restaurant zone. */
export async function listAppointmentsForDay(restaurantId, dateStr, timeZone) {
  const start = zonedDateTimeToUtc(dateStr, '00:00', timeZone);
  const end = zonedDateTimeToUtc(addDays(dateStr, 1), '00:00', timeZone);
  const padMs = 3 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, service_name, duration_minutes, price_cents, starts_at, ends_at, status,
      restaurant_customers (first_name, last_name, email, phone)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'confirmed')
    .gte('starts_at', new Date(start.getTime() - padMs).toISOString())
    .lt('starts_at', new Date(end.getTime() + padMs).toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).filter((row) => formatDateInZone(row.starts_at, timeZone) === dateStr);
}

/** Confirmed appointments whose local date is in [startDate, endDate). */
export async function listAppointmentsInRange(restaurantId, startDate, endDate, timeZone) {
  const start = zonedDateTimeToUtc(startDate, '00:00', timeZone);
  const end = zonedDateTimeToUtc(endDate, '00:00', timeZone);
  const padMs = 3 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, service_id, service_name, duration_minutes, price_cents, starts_at, ends_at, status,
      restaurant_customers (first_name, last_name, email, phone)
    `)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'confirmed')
    .gte('starts_at', new Date(start.getTime() - padMs).toISOString())
    .lt('starts_at', new Date(end.getTime() + padMs).toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).filter((row) => {
    const day = formatDateInZone(row.starts_at, timeZone);
    return day >= startDate && day < endDate;
  });
}
