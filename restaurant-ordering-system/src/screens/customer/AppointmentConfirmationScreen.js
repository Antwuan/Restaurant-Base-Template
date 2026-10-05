import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { formatAppointmentWhen, formatServicePrice, restaurantTimeZone } from '../../utils/appointmentTime';

export default function AppointmentConfirmationScreen({ navigation, route }) {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const appointment = route.params?.appointment;
  const tz = restaurantTimeZone(restaurant);

  if (!appointment) {
    return (
      <View style={[styles.page, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.textPrimary }]}>No booking to show</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Book')}>
          <Text style={[styles.link, { color: c.brand }]}>Back to booking</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <Text style={[styles.kicker, { color: c.brand }]}>Confirmed</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>You’re booked</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.service, { color: c.textPrimary }]}>{appointment.service_name}</Text>
        <Text style={[styles.when, { color: c.textPrimary }]}>
          {formatAppointmentWhen(appointment.starts_at, tz)}
        </Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {appointment.duration_minutes} min · {formatServicePrice(appointment.price_cents)}
        </Text>
        <Text style={[styles.note, { color: c.textSecondary }]}>
          This time is held for you. You are not charged here.
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.primary, { backgroundColor: c.brand }]}
        onPress={() => navigation.navigate('Appointments')}
      >
        <Text style={styles.primaryText}>View my appointments</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Book')} style={styles.secondary}>
        <Text style={[styles.link, { color: c.brand }]}>Book another</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, maxWidth: 560, width: '100%', alignSelf: 'center' },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '700', marginTop: 6, marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  service: { fontSize: 18, fontWeight: '700' },
  when: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 14 },
  note: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  primary: { marginTop: 20, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { marginTop: 14, alignItems: 'center' },
  link: { fontSize: 15, fontWeight: '600' },
});
