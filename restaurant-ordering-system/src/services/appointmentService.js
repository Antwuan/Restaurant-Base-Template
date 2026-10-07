import { supabase } from '../config/supabase';
import { refundAppointment } from './stripeApi';
import { addDays, formatDateInZone, zonedDateTimeToUtc } from '../utils/appointmentTime';

function rpcError(error, fallback) {
  const message = error?.message || error?.details || fallback;
  const cleaned = String(message).replace(/^.*ERROR:\s*/i, '').trim();
  return new Error(cleaned || fallback);
}

function attachAddons(service) {
  const links = Array.isArray(service.service_addon_links) ? service.service_addon_links : [];
  const addons = links
    .map((link) => link.service_addons)
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
  const { service_addon_links, ...rest } = service;
  return { ...rest, addons };
}

export async function listServices(restaurantId, { activeOnly = false } = {}) {
  let query = supabase
    .from('services')
    .select(`
      *,
      service_addon_links (
        addon_id,
        service_addons (id, name, duration_minutes, price_cents, is_active, sort_order)
      )
    `)
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(attachAddons);
}

export async function listAddons(restaurantId) {
  const { data, error } = await supabase
    .from('service_addons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
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
    category: (service.category || '').trim(),
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

export async function saveAddon(restaurantId, addon) {
  const payload = {
    restaurant_id: restaurantId,
    name: addon.name.trim(),
    duration_minutes: addon.duration_minutes,
    price_cents: addon.price_cents,
    is_active: addon.is_active !== false,
    sort_order: Number.isFinite(addon.sort_order) ? addon.sort_order : 0,
  };
  if (!payload.name) throw new Error('Enter an add-on name');
  if (!Number.isInteger(payload.duration_minutes) || payload.duration_minutes < 1 || payload.duration_minutes > 480) {
    throw new Error('Duration must be between 1 and 480 minutes');
  }
  if (!Number.isInteger(payload.price_cents) || payload.price_cents < 0) {
    throw new Error('Enter a price of zero or more');
  }

  if (addon.id) {
    const { data, error } = await supabase
      .from('service_addons')
      .update(payload)
      .eq('id', addon.id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from('service_addons').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAddon(addonId) {
  const { data, error } = await supabase
    .from('service_addons')
    .delete()
    .eq('id', addonId)
    .select('id');
  if (error) {
    if (error.code === '23503') {
      throw new Error('This add-on is still offered on a service. Remove it there first.');
    }
    throw error;
  }
  if (!data?.length) {
    throw new Error('This add-on is still offered on a service. Remove it there first.');
  }
}

export async function setServiceAddons(serviceId, addonIds) {
  const { error: deleteError } = await supabase
    .from('service_addon_links')
    .delete()
    .eq('service_id', serviceId);
  if (deleteError) throw deleteError;
  const ids = [...new Set((addonIds || []).filter(Boolean))];
  if (!ids.length) return;
  const { error } = await supabase
    .from('service_addon_links')
    .insert(ids.map((addonId) => ({ service_id: serviceId, addon_id: addonId })));
  if (error) throw error;
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

export async function getAvailability(restaurantId, serviceId, day, { chairId = null, addonIds = [] } = {}) {
  const { data, error } = await supabase.rpc('get_appointment_availability', {
    p_restaurant_id: restaurantId,
    p_service_id: serviceId,
    p_day: day,
    p_chair_id: chairId,
    p_addon_ids: addonIds,
  });
  if (error) throw rpcError(error, 'Could not load open times');
  return data || [];
}

export async function bookAppointment(serviceId, startsAt, { chairId = null, addonIds = [], paymentChoice = 'card_on_file' } = {}) {
  const { data, error } = await supabase.rpc('book_appointment', {
    p_service_id: serviceId,
    p_starts_at: startsAt,
    p_chair_id: chairId,
    p_addon_ids: addonIds,
    p_payment_choice: paymentChoice,
  });
  if (error) throw rpcError(error, 'Could not book that time');
  return data;
}

const CHAIR_COLORS = ['#dbeafe', '#ffedd5', '#dcfce7', '#f3e8ff', '#fce7f3', '#fef9c3', '#ccfbf1', '#fee2e2'];

export function chairColorChoices() {
  return CHAIR_COLORS;
}

export async function listChairs(restaurantId, { activeOnly = false } = {}) {
  let query = supabase
    .from('appointment_chairs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveChair(restaurantId, chair) {
  const name = (chair.name || '').trim();
  const color = (chair.color || '').trim();
  if (!name) throw new Error('Enter a name for this chair');
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Choose a color');
  const payload = {
    restaurant_id: restaurantId,
    name,
    color,
    is_active: chair.is_active !== false,
    sort_order: Number.isFinite(chair.sort_order) ? chair.sort_order : 0,
  };
  if (chair.id) {
    const { data, error } = await supabase
      .from('appointment_chairs')
      .update(payload)
      .eq('id', chair.id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('appointment_chairs').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteChair(chairId) {
  const { data, error } = await supabase
    .from('appointment_chairs')
    .delete()
    .eq('id', chairId)
    .select('id');
  if (error) {
    if (error.code === '23503') {
      throw new Error('This chair has appointments. Hide it instead.');
    }
    throw error;
  }
  if (!data?.length) throw new Error('This chair has appointments. Hide it instead.');
}

export async function cancelAppointment(appointmentId) {
  const { data, error } = await supabase.rpc('cancel_appointment', {
    p_appointment_id: appointmentId,
  });
  if (error) throw rpcError(error, 'Could not cancel this appointment');
  if (data?.payment_choice === 'prepaid' && data?.stripe_payment_intent_id && !data?.stripe_refund_id) {
    await refundAppointment(appointmentId);
  }
  return data;
}

export async function getAppointment(appointmentId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, service_name, duration_minutes, price_cents, starts_at, ends_at, status,
      payment_choice, no_show_fee_cents, addon_snapshot, stripe_refund_id,
      appointment_chairs (name, color)
    `)
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMyUpcomingAppointments(restaurantId) {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, service_name, duration_minutes, price_cents, starts_at, ends_at, status,
      payment_choice, no_show_fee_cents, addon_snapshot, stripe_payment_intent_id, stripe_refund_id,
      appointment_chairs (name, color)
    `)
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
      chair_id, payment_choice, no_show_fee_cents, addon_snapshot,
      appointment_chairs (name, color),
      restaurant_customers (first_name, last_name, email, phone)
    `)
    .eq('restaurant_id', restaurantId)
    .in('status', ['confirmed', 'no_show'])
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
      chair_id, payment_choice, no_show_fee_cents, no_show_payment_intent_id, addon_snapshot,
      stripe_payment_intent_id, stripe_refund_id,
      appointment_chairs (name, color),
      restaurant_customers (first_name, last_name, email, phone)
    `)
    .eq('restaurant_id', restaurantId)
    .in('status', ['confirmed', 'no_show'])
    .gte('starts_at', new Date(start.getTime() - padMs).toISOString())
    .lt('starts_at', new Date(end.getTime() + padMs).toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).filter((row) => {
    const day = formatDateInZone(row.starts_at, timeZone);
    return day >= startDate && day < endDate;
  });
}
