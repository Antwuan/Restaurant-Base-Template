/**
 * Admin Rewards Screen
 * - Configure points earn rate (points_per_dollar)
 * - CRUD fixed offers with point thresholds
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import * as restaurantService from '../../services/restaurantService';
import * as rewardsService from '../../services/rewardsService';

function OfferForm({ offer, brandColor, onSave, onCancel }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [title, setTitle] = useState(offer?.title ?? '');
  const [description, setDescription] = useState(offer?.description ?? '');
  const [pointsCost, setPointsCost] = useState(String(offer?.points_cost ?? ''));
  const [isActive, setIsActive] = useState(offer?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: null }));

  const handleSave = async () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    const pts = parseInt(pointsCost, 10);
    if (!pts || pts <= 0) newErrors.pointsCost = 'Points cost must be a positive number';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        points_cost: pts,
        is_active: isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView
        style={form.body}
        contentContainerStyle={form.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[form.label, { color: c.textSecondary }]}>Title *</Text>
        <TextInput
          style={[
            form.input,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: errors.title ? '#ef4444' : c.border,
            },
          ]}
          value={title}
          onChangeText={(v) => { setTitle(v); clearError('title'); }}
          placeholder="e.g. Free Coffee"
          placeholderTextColor={c.textDisabled}
        />
        {errors.title ? <Text style={form.errorText}>{errors.title}</Text> : null}

        <Text style={[form.label, { color: c.textSecondary }]}>Description</Text>
        <TextInput
          style={[
            form.input,
            form.textArea,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: c.border,
            },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details"
          placeholderTextColor={c.textDisabled}
          multiline
          numberOfLines={2}
        />

        <Text style={[form.label, { color: c.textSecondary }]}>Points Required *</Text>
        <TextInput
          style={[
            form.input,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: errors.pointsCost ? '#ef4444' : c.border,
            },
          ]}
          value={pointsCost}
          onChangeText={(v) => { setPointsCost(v); clearError('pointsCost'); }}
          placeholder="e.g. 500"
          placeholderTextColor={c.textDisabled}
          keyboardType="number-pad"
        />
        {errors.pointsCost ? <Text style={form.errorText}>{errors.pointsCost}</Text> : null}

        <View style={form.switchRow}>
          <Text style={[form.label, { color: c.textSecondary, marginTop: 0, marginBottom: 0 }]}>
            Active
          </Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: brandColor, false: '#ccc' }}
          />
        </View>
      </ScrollView>

      <View style={form.footer}>
        <TouchableOpacity
          style={[form.cancelBtn, { borderColor: c.border }]}
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={[form.cancelText, { color: c.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[form.saveBtn, { backgroundColor: brandColor }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={form.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </>
  );
}

const form = StyleSheet.create({
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { height: 72, textAlignVertical: 'top', paddingTop: 12 },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 4 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

export default function AdminRewardsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { restaurant, refreshRestaurant } = useRestaurantContext();

  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [pointsPerDollar, setPointsPerDollar] = useState(
    String(restaurant?.points_per_dollar ?? '1'),
  );
  const [savingRate, setSavingRate] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);

  const closeForm = () => {
    setShowForm(false);
    setEditingOffer(null);
  };

  const loadOffers = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingOffers(true);
    try {
      const data = await rewardsService.getAllOffers(restaurant.id);
      setOffers(data);
    } catch (e) {
      Alert.alert('Error', 'Could not load offers.');
    } finally {
      setLoadingOffers(false);
    }
  }, [restaurant?.id]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  const handleSaveRate = async () => {
    const rate = parseFloat(pointsPerDollar);
    if (isNaN(rate) || rate < 0) { Alert.alert('Validation', 'Enter a valid earn rate (e.g. 1 or 0.5).'); return; }
    setSavingRate(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, { points_per_dollar: rate });
      await refreshRestaurant();
      Alert.alert('Saved', 'Earn rate updated.');
    } catch (e) {
      Alert.alert('Error', 'Could not save earn rate.');
    } finally {
      setSavingRate(false);
    }
  };

  const handleSaveOffer = async (data) => {
    try {
      if (editingOffer) {
        await rewardsService.updateOffer(editingOffer.id, data);
      } else {
        await rewardsService.createOffer(restaurant.id, { ...data, sort_order: offers.length });
      }
      closeForm();
      await loadOffers();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save offer.');
    }
  };

  const handleToggleActive = async (offer) => {
    try {
      await rewardsService.updateOffer(offer.id, { is_active: !offer.is_active });
      await loadOffers();
    } catch (e) {
      Alert.alert('Error', 'Could not update offer.');
    }
  };

  const handleDeleteOffer = async (offer) => {
    Alert.alert('Delete Offer', `Delete "${offer.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await rewardsService.deleteOffer(offer.id);
            await loadOffers();
          } catch (e) {
            Alert.alert('Error', 'Could not delete offer.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={[s.container, { backgroundColor: c.background }]} contentContainerStyle={s.content}>
      <Text style={[s.pageTitle, { color: c.textPrimary }]}>Rewards</Text>
      <Text style={[s.pageSub, { color: c.textSecondary }]}>
        Set how customers earn points and define the offers they can redeem.
      </Text>

      {/* ── Earn Rate ─────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Earn Rate</Text>
        <Text style={[s.sectionSub, { color: c.textSecondary }]}>
          Points awarded per $1 spent. E.g. "1" = 1 point per dollar; "0.5" = 1 point per $2.
        </Text>
        <View style={s.rateRow}>
          <TextInput
            style={[s.rateInput, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={pointsPerDollar}
            onChangeText={setPointsPerDollar}
            keyboardType="decimal-pad"
            placeholder="1"
          />
          <Text style={[s.rateUnit, { color: c.textSecondary }]}>pts / $1</Text>
          <TouchableOpacity
            style={[s.rateBtn, { backgroundColor: c.brand }, savingRate && { opacity: 0.6 }]}
            onPress={handleSaveRate}
            disabled={savingRate}
          >
            {savingRate ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.rateBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Offers ────────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={s.offersHeader}>
          <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Offers</Text>
          <TouchableOpacity
            style={[s.addBtn, { backgroundColor: c.brand }]}
            onPress={() => { setEditingOffer(null); setShowForm(true); }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>Add Offer</Text>
          </TouchableOpacity>
        </View>

        {loadingOffers ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 20 }} />
        ) : offers.length === 0 ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: c.textSecondary }]}>
              No offers yet. Add one above.
            </Text>
          </View>
        ) : (
          offers.map((offer) => (
            <View key={offer.id} style={[s.offerCard, { borderColor: c.border }]}>
              <View style={s.offerMain}>
                <View style={s.offerInfo}>
                  <Text style={[s.offerTitle, { color: c.textPrimary }]}>{offer.title}</Text>
                  {offer.description ? (
                    <Text style={[s.offerDesc, { color: c.textSecondary }]}>{offer.description}</Text>
                  ) : null}
                  <Text style={[s.offerPts, { color: c.brand }]}>{offer.points_cost} pts</Text>
                </View>
                <View style={s.offerActions}>
                  <Switch
                    value={offer.is_active}
                    onValueChange={() => handleToggleActive(offer)}
                    trackColor={{ true: c.brand, false: '#ccc' }}
                  />
                  <TouchableOpacity
                    style={s.iconBtn}
                    onPress={() => { setEditingOffer(offer); setShowForm(true); }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={c.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => handleDeleteOffer(offer)}>
                    <Ionicons name="trash-outline" size={18} color="#e53e3e" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal
        visible={showForm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={modalStyles.backdrop} onPress={closeForm} />
          <View style={[modalStyles.card, { backgroundColor: c.backgroundCard }]}>
            <View style={modalStyles.header}>
              <Text style={[modalStyles.title, { color: c.textPrimary }]}>
                {editingOffer ? 'Edit Offer' : 'New Offer'}
              </Text>
              <TouchableOpacity
                style={[modalStyles.closeBtn, { backgroundColor: c.backgroundSunken }]}
                onPress={closeForm}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={c.textPrimary} />
              </TouchableOpacity>
            </View>
            <OfferForm
              key={editingOffer?.id ?? 'new'}
              offer={editingOffer}
              brandColor={c.brand}
              onSave={handleSaveOffer}
              onCancel={closeForm}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  pageTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  pageSub: { fontSize: 13, marginBottom: 20, lineHeight: 18 },
  section: { borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sectionSub: { fontSize: 12, marginBottom: 12, lineHeight: 17 },

  // Earn rate
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateInput: { width: 80, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  rateUnit: { fontSize: 13, flex: 1 },
  rateBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  rateBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Offers header
  offersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Offer card
  offerCard: { borderWidth: 1, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  offerMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, gap: 10 },
  offerInfo: { flex: 1 },
  offerTitle: { fontSize: 15, fontWeight: '700' },
  offerDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  offerPts: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  offerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },

  // Empty
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});
