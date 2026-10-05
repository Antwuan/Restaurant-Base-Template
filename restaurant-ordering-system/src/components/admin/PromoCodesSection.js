/**
 * Global promo codes for booking businesses.
 * Same create / edit / activate / delete flow as restaurant Rewards, without points.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import * as promoService from '../../services/promoService';
import * as menuService from '../../services/menuService';
import { sendBroadcast } from '../../services/emailApi';
import { confirmAsync } from '../../utils/confirm';
import { benefitLabel, PromoForm } from '../../screens/admin/RewardsScreen';

function notify(title, message) {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(text);
    return;
  }
  Alert.alert(title, message);
}

function confirmDestructive(title, message) {
  return new Promise((resolve) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function PromoCodesSection() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { restaurant } = useRestaurantContext();

  const [promos, setPromos] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [sendingPromoId, setSendingPromoId] = useState(null);

  const domainOk = restaurant?.email_domain_status === 'verified' && restaurant?.resend_from_email;
  const segmentOk = Boolean(restaurant?.resend_segment_id && restaurant?.resend_marketing_topic_id);
  const emailReady = Boolean(domainOk && segmentOk);

  const closePromoForm = () => {
    setShowPromoForm(false);
    setEditingPromo(null);
  };

  const loadMenuItems = useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      const items = await menuService.getMenuItems(restaurant.id);
      setMenuItems((items || []).filter((i) => i.is_available !== false));
    } catch {
      setMenuItems([]);
    }
  }, [restaurant?.id]);

  const loadPromos = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingPromos(true);
    try {
      const data = await promoService.getAllPromos(restaurant.id);
      setPromos(data);
    } catch (e) {
      notify('Error', e.message || 'Could not load promo codes.');
    } finally {
      setLoadingPromos(false);
    }
  }, [restaurant?.id]);

  useEffect(() => { loadPromos(); }, [loadPromos]);
  useEffect(() => { loadMenuItems(); }, [loadMenuItems]);

  const sendPromoBroadcast = async (promo) => {
    await sendBroadcast({
      restaurantId: restaurant.id,
      subject: promo.title,
      html: promoService.buildPromoBroadcastHtml(promo),
      previewText: promoService.formatPromoEmailBlurb(promo),
      name: `Promo ${String(promo.code || '').toUpperCase()}`,
      promoCodeId: promo.id,
    });
  };

  const handleSavePromo = async (data) => {
    const { emailCustomers, ...promoData } = data;
    try {
      if (editingPromo) {
        await promoService.updatePromo(editingPromo.id, promoData);
        closePromoForm();
        await loadPromos();
        return;
      }
      const created = await promoService.createPromo(restaurant.id, promoData);
      if (emailCustomers) {
        try {
          await sendPromoBroadcast(created);
          notify('Sent', 'Your marketing email is on its way.');
        } catch (e) {
          notify(
            'Promo saved',
            e.message || 'Could not send the email. Use Send email on the promo to retry.',
          );
        }
      }
      closePromoForm();
      await loadPromos();
    } catch (e) {
      notify('Error', e.message || 'Could not save promo.');
      throw e;
    }
  };

  const handleSendPromoEmail = async (promo) => {
    if (promo?.source_offer_id) return;
    if (!emailReady) {
      notify(
        'Email not ready',
        'Verify your sending domain in Settings before sending marketing emails.',
      );
      return;
    }
    const confirmed = await confirmAsync({
      title: 'Send email?',
      message: `Send “${promo.title}” to opted-in contacts for ${restaurant.name}?`,
      confirmText: 'Send',
    });
    if (!confirmed) return;
    setSendingPromoId(promo.id);
    try {
      await sendPromoBroadcast(promo);
      notify('Sent', 'Your marketing email is on its way.');
    } catch (e) {
      notify('Send failed', e.message || 'Could not send broadcast.');
    } finally {
      setSendingPromoId(null);
    }
  };

  const handleTogglePromoActive = async (promo) => {
    try {
      await promoService.updatePromo(promo.id, { is_active: !promo.is_active });
      await loadPromos();
    } catch (e) {
      notify('Error', e.message || 'Could not update promo.');
    }
  };

  const handleDeletePromo = async (promo) => {
    const ok = await confirmDestructive(
      'Delete Promo',
      `Delete "${promo.title}" (${promo.code})?`,
    );
    if (!ok) return;
    try {
      await promoService.deletePromo(promo.id);
      await loadPromos();
    } catch (e) {
      notify('Error', e.message || 'Could not delete promo.');
    }
  };

  return (
    <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Promo codes</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={() => { setEditingPromo(null); setShowPromoForm(true); }}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add Promo</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.sectionSub, { color: c.textSecondary }]}>
        A code you can email to opted-in customers.
      </Text>

      {loadingPromos ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 20 }} />
      ) : promos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            No promo codes yet.
          </Text>
        </View>
      ) : (
        promos.map((promo) => (
          <View key={promo.id} style={[styles.offerCard, { borderColor: c.border }]}>
            <View style={styles.offerMain}>
              <View style={styles.offerInfo}>
                <Text style={[styles.offerTitle, { color: c.textPrimary }]}>{promo.title}</Text>
                <Text style={[styles.promoCode, { color: c.brand }]}>{promo.code}</Text>
                <Text style={[styles.offerDesc, { color: c.textSecondary }]}>
                  {benefitLabel(promo)}
                  {promo.max_redemptions != null
                    ? ` · ${promo.redemption_count || 0}/${promo.max_redemptions} used`
                    : ` · ${promo.redemption_count || 0} used`}
                </Text>
              </View>
              <View style={styles.offerActions}>
                <Switch
                  value={promo.is_active}
                  onValueChange={() => handleTogglePromoActive(promo)}
                  trackColor={{ true: c.brand, false: '#ccc' }}
                />
                {!promo.source_offer_id ? (
                  <TouchableOpacity
                    style={[
                      styles.sendEmailBtn,
                      { borderColor: c.border },
                      (!emailReady || sendingPromoId === promo.id) && { opacity: 0.45 },
                    ]}
                    onPress={() => handleSendPromoEmail(promo)}
                    disabled={sendingPromoId === promo.id}
                    accessibilityLabel="Send email"
                    accessibilityState={{ disabled: sendingPromoId === promo.id }}
                  >
                    {sendingPromoId === promo.id ? (
                      <ActivityIndicator color={c.brand} size="small" />
                    ) : (
                      <>
                        <Ionicons
                          name="mail-outline"
                          size={15}
                          color={emailReady ? c.brand : c.textSecondary}
                        />
                        <Text style={[styles.sendEmailText, { color: emailReady ? c.brand : c.textSecondary }]}>
                          Send email
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => { setEditingPromo(promo); setShowPromoForm(true); }}
                  accessibilityLabel={`Edit ${promo.title}`}
                >
                  <Ionicons name="pencil-outline" size={18} color={c.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => handleDeletePromo(promo)}
                  accessibilityLabel={`Delete ${promo.title}`}
                >
                  <Ionicons name="trash-outline" size={18} color="#e53e3e" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}

      <Modal
        visible={showPromoForm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePromoForm}
      >
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={modalStyles.backdrop} onPress={closePromoForm} />
          <View
            style={[modalStyles.card, { backgroundColor: c.backgroundCard }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={modalStyles.header}>
              <Text style={[modalStyles.title, { color: c.textPrimary }]}>
                {editingPromo ? 'Edit Promo' : 'New Promo'}
              </Text>
              <TouchableOpacity
                style={[modalStyles.closeBtn, { backgroundColor: c.backgroundSunken }]}
                onPress={closePromoForm}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={c.textPrimary} />
              </TouchableOpacity>
            </View>
            <PromoForm
              key={editingPromo?.id ?? 'new-promo'}
              promo={editingPromo}
              brandColor={c.brand}
              menuItems={menuItems}
              emailReady={emailReady}
              onSave={handleSavePromo}
              onCancel={closePromoForm}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 10, padding: 14, borderWidth: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionSub: { fontSize: 11, marginBottom: 12, lineHeight: 15 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  offerCard: { borderWidth: 1, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  offerMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, gap: 10 },
  offerInfo: { flex: 1 },
  offerTitle: { fontSize: 15, fontWeight: '700' },
  offerDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  promoCode: { fontSize: 14, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  offerActions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  iconBtn: { padding: 6 },
  sendEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  sendEmailText: { fontSize: 12, fontWeight: '700' },
  empty: { paddingVertical: 16, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});

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
    zIndex: 0,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 1,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 13 },
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
  title: { fontSize: 20, fontWeight: '700' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
