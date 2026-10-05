/** Exclusive tenant mode. Missing column behaves as a restaurant. */
export function isAppointmentBusiness(restaurant) {
  return restaurant?.business_type === 'appointment';
}
