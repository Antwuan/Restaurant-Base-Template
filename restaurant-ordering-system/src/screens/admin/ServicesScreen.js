import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { confirmAsync } from '../../utils/confirm';
import { formatServicePrice } from '../../utils/appointmentTime';
import * as appointmentService from '../../services/appointmentService';

const EMPTY_FORM = {
  id: null,
  name: '',
  description: '',
  duration: '30',
  price: '0.00',
  is_active: true,
  sort_order: 0,
};

function dollarsToCents(value) {
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function ServicesScreen() {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    try {
      setServices(await appointmentService.listServices(restaurant.id));
    } catch {
      Alert.alert('Could not load services', 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setForm({ ...EMPTY_FORM, sort_order: services.length });
  const openEdit = (service) => setForm({
    id: service.id,
    name: service.name,
    description: service.description || '',
    duration: String(service.duration_minutes),
    price: (Number(service.price_cents || 0) / 100).toFixed(2),
    is_active: service.is_active !== false,
    sort_order: service.sort_order || 0,
  });

  const handleSave = async () => {
    if (!restaurant?.id || !form) return;
    const duration = Number.parseInt(String(form.duration).trim(), 10);
    const priceCents = dollarsToCents(form.price);
    if (!form.name.trim()) {
      Alert.alert('Name required', 'Enter a service name.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 480) {
      Alert.alert('Invalid duration', 'Enter a duration from 1 to 480 minutes.');
      return;
    }
    if (priceCents == null) {
      Alert.alert('Invalid price', 'Enter a price of zero or more. It is shown only and is not charged.');
      return;
    }
    setSaving(true);
    try {
      await appointmentService.saveService(restaurant.id, {
        id: form.id,
        name: form.name,
        description: form.description,
        duration_minutes: duration,
        price_cents: priceCents,
        is_active: form.is_active,
        sort_order: form.sort_order,
      });
      setForm(null);
      await load();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (service) => {
    try {
      await appointmentService.saveService(restaurant.id, {
        ...service,
        is_active: !service.is_active,
      });
      await load();
    } catch (e) {
      Alert.alert('Could not update', e.message || 'Please try again.');
    }
  };

  const handleDelete = async (service) => {
    const confirmed = await confirmAsync({
      title: 'Delete service',
      message: `Delete ${service.name}? Services that already have appointments should be deactivated instead.`,
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await appointmentService.deleteService(service.id);
      await load();
    } catch (e) {
      Alert.alert('Could not delete', e.message || 'Deactivate this service instead.');
    }
  };

  return (
    <ScrollView style={[styles.page, { backgroundColor: c.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.intro, { color: c.textSecondary }]}>
          Customers book one service at a time. Price is displayed and is not charged.
        </Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: c.brand }]} onPress={openNew}>
          <Text style={styles.addBtnText}>Add service</Text>
        </TouchableOpacity>
      </View>

      {form ? (
        <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
            {form.id ? 'Edit service' : 'New service'}
          </Text>
          <Text style={[styles.label, { color: c.textSecondary }]}>Name</Text>
          <TextInput
            style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
            placeholder="Haircut"
            placeholderTextColor={c.textDisabled}
          />
          <Text style={[styles.label, { color: c.textSecondary }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={form.description}
            onChangeText={(description) => setForm((f) => ({ ...f, description }))}
            placeholder="Optional"
            placeholderTextColor={c.textDisabled}
            multiline
          />
          <Text style={[styles.label, { color: c.textSecondary }]}>Duration (minutes)</Text>
          <TextInput
            style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={form.duration}
            onChangeText={(duration) => setForm((f) => ({ ...f, duration }))}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor={c.textDisabled}
          />
          <Text style={[styles.label, { color: c.textSecondary }]}>Price shown ($)</Text>
          <TextInput
            style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={form.price}
            onChangeText={(price) => setForm((f) => ({ ...f, price }))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={c.textDisabled}
          />
          <View style={styles.switchRow}>
            <Text style={{ color: c.textPrimary }}>Active</Text>
            <Switch value={form.is_active} onValueChange={(is_active) => setForm((f) => ({ ...f, is_active }))} />
          </View>
          <View style={styles.formActions}>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setForm(null)} style={styles.cancelForm}>
              <Text style={{ color: c.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 24 }} />
      ) : services.length === 0 ? (
        <Text style={[styles.empty, { color: c.textSecondary }]}>No services yet.</Text>
      ) : (
        services.map((service) => (
          <View
            key={service.id}
            style={[
              styles.serviceCard,
              { backgroundColor: c.backgroundCard, borderColor: c.border },
              !service.is_active && styles.serviceCardInactive,
            ]}
          >
            <View style={styles.serviceInfo}>
              <Text
                style={[
                  styles.name,
                  { color: service.is_active ? c.textPrimary : c.textDisabled },
                ]}
                numberOfLines={2}
              >
                {service.name}
              </Text>
              <Text
                style={[
                  styles.price,
                  { color: service.is_active ? c.textPrimary : c.textDisabled },
                ]}
              >
                {formatServicePrice(service.price_cents)}
              </Text>
              <Text style={[styles.meta, { color: c.textSecondary }]}>
                {service.duration_minutes} min
              </Text>
              {service.description ? (
                <Text
                  style={[styles.description, { color: c.textSecondary }]}
                  numberOfLines={3}
                >
                  {service.description}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.availBadge,
                  {
                    backgroundColor: service.is_active
                      ? (theme.mode === 'dark' ? 'rgba(34,197,94,0.18)' : '#f0fdf4')
                      : c.backgroundSunken,
                  },
                ]}
                onPress={() => handleDeactivate(service)}
                accessibilityLabel={service.is_active ? 'Mark as hidden' : 'Mark as visible'}
              >
                <View
                  style={[
                    styles.availDot,
                    { backgroundColor: service.is_active ? '#22c55e' : c.textDisabled },
                  ]}
                />
                <Text
                  style={[
                    styles.availText,
                    { color: service.is_active ? '#16a34a' : c.textSecondary },
                  ]}
                >
                  {service.is_active ? 'Visible' : 'Hidden'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.serviceActions}>
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: c.backgroundCard }]}
                onPress={() => openEdit(service)}
                accessibilityLabel={`Edit ${service.name}`}
              >
                <Ionicons name="pencil" size={16} color={c.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(service)}
                accessibilityLabel={`Delete ${service.name}`}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  intro: { flex: 1, fontSize: 13, lineHeight: 18 },
  addBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  saveBtn: { borderRadius: 8, minWidth: 88, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  cancelForm: { paddingVertical: 8 },
  empty: { fontSize: 15, marginTop: 12 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    }),
  },
  serviceCardInactive: { opacity: 0.6 },
  serviceInfo: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  name: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  price: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  meta: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  description: { fontSize: 13, lineHeight: 19, marginTop: 10, fontWeight: '500' },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 10,
  },
  availDot: { width: 6, height: 6, borderRadius: 3 },
  availText: { fontSize: 11, fontWeight: '600' },
  serviceActions: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 5 },
      android: { elevation: 4 },
    }),
  },
  deleteBtn: { padding: 6 },
});
