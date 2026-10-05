import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import { confirmAsync } from '../../utils/confirm';
import * as appointmentService from '../../services/appointmentService';
import { formatAppointmentWhen, formatServicePrice, restaurantTimeZone } from '../../utils/appointmentTime';

export default function MyAppointmentsScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { user } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;
  const tz = restaurantTimeZone(restaurant);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signInVisible, setSignInVisible] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(async () => {
    if (!restaurant?.id || !user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await appointmentService.listMyUpcomingAppointments(restaurant.id);
      setRows(data);
    } catch {
      setRows([]);
      Alert.alert('Could not load appointments', 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id, user]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const handleCancel = async (row) => {
    const confirmed = await confirmAsync({
      title: 'Cancel appointment',
      message: `Cancel ${row.service_name} on ${formatAppointmentWhen(row.starts_at, tz)}?`,
      confirmText: 'Cancel appointment',
      destructive: true,
    });
    if (!confirmed) return;
    setCancellingId(row.id);
    try {
      await appointmentService.cancelAppointment(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (e) {
      Alert.alert('Could not cancel', e.message || 'Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <ScrollView style={[styles.page, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.textPrimary }]}>My appointments</Text>
      {!user ? (
        <View>
          <Text style={[styles.empty, { color: c.textSecondary }]}>Sign in to see your appointments.</Text>
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: c.brand }]}
            onPress={() => setSignInVisible(true)}
          >
            <Text style={styles.primaryText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 24 }} />
      ) : rows.length === 0 ? (
        <View>
          <Text style={[styles.empty, { color: c.textSecondary }]}>You have no upcoming appointments.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Book')}>
            <Text style={[styles.link, { color: c.brand }]}>Book a time</Text>
          </TouchableOpacity>
        </View>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
            <Text style={[styles.service, { color: c.textPrimary }]}>{row.service_name}</Text>
            <Text style={[styles.when, { color: c.textPrimary }]}>{formatAppointmentWhen(row.starts_at, tz)}</Text>
            <Text style={[styles.meta, { color: c.textSecondary }]}>
              {row.duration_minutes} min · {formatServicePrice(row.price_cents)}
            </Text>
            <TouchableOpacity
              onPress={() => handleCancel(row)}
              disabled={cancellingId === row.id}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>
                {cancellingId === row.id ? 'Cancelling…' : 'Cancel'}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}
      <CustomerSignInModal visible={signInVisible} onClose={() => { setSignInVisible(false); load(); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 20, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center', gap: 12 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  empty: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  service: { fontSize: 16, fontWeight: '700' },
  when: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13 },
  cancelBtn: { marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6 },
  cancelText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
  primary: { marginTop: 16, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { marginTop: 12, fontSize: 15, fontWeight: '600' },
});
