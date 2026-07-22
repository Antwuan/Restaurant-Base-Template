/**
 * CateringScreen — catering menu with an order-page layout:
 *   - Custom header (logo, restaurant name, address/phone/closed badge, Sign in)
 *   - "Catering Menu" tab bar
 *   - Left: menu items in a two-column grid
 *   - Right: "Your Order" panel (pickup location, scheduled time, cart items)
 *
 * Catering is pickup only and must be scheduled at least 2 days ahead in
 * 15-minute slots within the restaurant's hours of operation.
 * Always renders in light theme (dark theme is admin-only).
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useMenu } from '../../hooks/useMenu';
import { useCartContext } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import MenuItemModal from '../../components/MenuItemModal';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import LocationModal from '../../components/LocationModal';
import MenuItem from '../../components/MenuItem';
import OrderSummary from '../../components/OrderSummary';
import { createPaymentIntent } from '../../services/stripeApi';
import { createOrder } from '../../services/orderService';
import { awardPoints } from '../../services/rewardsService';
import {
  getEarliestCateringDate,
  getSlotTimesForDate,
  getClosedUntilLabel,
  formatDateLabel,
  formatDateTo12,
  DAY_KEYS,
  resolveHours,
} from '../../utils/hoursUtils';

const DESKTOP_BP = 1024;
const DAYS_AHEAD = 2;
const SLOT_INTERVAL = 15;
const DATE_RANGE = 21;

// Build pickup date options starting from the earliest catering date
function buildDateOptions(hours_of_operation) {
  const options = [];
  const earliest = getEarliestCateringDate(hours_of_operation, DAYS_AHEAD);
  const hours = resolveHours(hours_of_operation);
  for (let i = 0; i < DATE_RANGE; i++) {
    const d = new Date(earliest);
    d.setDate(d.getDate() + i);
    const key = DAY_KEYS[d.getDay()];
    if (hours[key] && !hours[key].closed) {
      options.push(new Date(d));
    }
    if (options.length >= 14) break;
  }
  return options;
}

// ─── Schedule picker modal ────────────────────────────────────────────────────
function ScheduleModal({ visible, onClose, restaurant, brandColor, selectedSlot, onSelect }) {
  const dateOptions = useMemo(
    () => buildDateOptions(restaurant?.hours_of_operation),
    [restaurant?.hours_of_operation],
  );
  const [date, setDate] = useState(selectedSlot ? new Date(selectedSlot) : dateOptions[0] ?? null);

  const slots = useMemo(
    () => (date ? getSlotTimesForDate(date, restaurant?.hours_of_operation, SLOT_INTERVAL) : []),
    [date, restaurant?.hours_of_operation],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={sm.backdrop}>
        <View style={sm.sheet}>
          <View style={sm.headerRow}>
            <Text style={sm.title}>Schedule pickup</Text>
            <TouchableOpacity onPress={onClose} style={sm.closeBtn}>
              <Ionicons name="close" size={22} color="#333" />
            </TouchableOpacity>
          </View>
          <Text style={sm.note}>
            Catering pickups must be scheduled at least {DAYS_AHEAD} days in advance.
          </Text>

          <Text style={sm.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={sm.chipRow}>
              {dateOptions.map((d, i) => {
                const selected = date?.toDateString() === d.toDateString();
                return (
                  <TouchableOpacity
                    key={i}
                    style={[sm.chip, selected && { backgroundColor: brandColor, borderColor: brandColor }]}
                    onPress={() => setDate(d)}
                  >
                    <Text style={[sm.chipText, selected && { color: '#fff' }]}>{formatDateLabel(d)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <Text style={sm.label}>Time</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            <View style={sm.slotGrid}>
              {slots.map((slot, i) => {
                const selected = selectedSlot?.getTime?.() === slot.getTime();
                return (
                  <TouchableOpacity
                    key={i}
                    style={[sm.slotChip, selected && { backgroundColor: brandColor, borderColor: brandColor }]}
                    onPress={() => { onSelect(slot); onClose(); }}
                  >
                    <Text style={[sm.chipText, selected && { color: '#fff' }]}>{formatDateTo12(slot)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#111' },
  closeBtn: { padding: 4 },
  note: { fontSize: 12, color: '#777', marginTop: 4, marginBottom: 10, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 12, marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 12 },
  chip: { borderWidth: 1.5, borderColor: '#e3e3e3', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { borderWidth: 1.5, borderColor: '#e3e3e3', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, marginBottom: 2 },
});

// ─── Catering checkout form (inside <Elements>) ───────────────────────────────
function CateringCheckoutForm({ navigation, isDesktop, brandColor, restaurant, scheduledSlot, onBack }) {
  const stripe = useStripe();
  const elements = useElements();
  const { items, subtotal, tax, total, clearCart } = useCartContext();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!phone.trim()) errs.phone = 'Phone is required';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    if (!stripe || !elements) return;
    setLoading(true);

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: { billing_details: { name, phone, email: email || undefined } },
          return_url: typeof window !== 'undefined' ? window.location.href : 'https://localhost:19006/confirmation',
        },
        redirect: 'if_required',
      });

      if (confirmError) {
        Alert.alert('Payment Failed', confirmError.message);
        setLoading(false);
        return;
      }

      const order = await createOrder({
        restaurantId: restaurant.id,
        customerName: name,
        customerPhone: phone,
        customerEmail: email || null,
        items: items.map(({ id, name: n, price, quantity, specialInstructions }) => ({
          id, name: n, price, quantity, special_instructions: specialInstructions || '',
        })),
        subtotal,
        tax,
        total,
        orderType: 'pickup',
        menuType: 'catering',
        scheduledTime: scheduledSlot ? scheduledSlot.toISOString() : null,
        notes: notes || null,
        paymentIntentId: paymentIntent?.id,
      });

      if (user?.id && restaurant?.id) {
        awardPoints({
          restaurantId: restaurant.id,
          authUserId: user.id,
          orderTotal: total,
          pointsPerDollar: restaurant.points_per_dollar ?? 1,
        });
      }

      clearCart();
      navigation.replace('Confirmation', { order });
    } catch (err) {
      Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f6f9fc' }} contentContainerStyle={cf.wrap}>
      <TouchableOpacity style={cf.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={18} color={brandColor} />
        <Text style={[cf.backText, { color: brandColor }]}>Back to menu</Text>
      </TouchableOpacity>

      <View style={[cf.columns, isDesktop && cf.columnsDesktop]}>
        {/* Summary */}
        <View style={[cf.summaryPanel, isDesktop && cf.summaryPanelDesktop]}>
          <OrderSummary
            items={items}
            subtotal={subtotal}
            tax={tax}
            total={total}
            orderType="pickup"
            scheduledTime={scheduledSlot ? scheduledSlot.toISOString() : null}
          />
          {/* Scheduled time reminder */}
          {scheduledSlot && (
            <View style={[cf.scheduleBox, { borderColor: brandColor }]}>
              <Ionicons name="calendar-outline" size={16} color={brandColor} />
              <Text style={[cf.scheduleBoxText, { color: '#333' }]}>
                Pickup {formatDateLabel(scheduledSlot)} at {formatDateTo12(scheduledSlot)}
              </Text>
            </View>
          )}
        </View>

        {/* Form */}
        <View style={[cf.formPanel, isDesktop && cf.formPanelDesktop]}>
          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Contact</Text>
            <View style={[isDesktop && cf.twoCol]}>
              <View style={[isDesktop && cf.colHalf]}>
                <Text style={cf.fieldLabel}>Name *</Text>
                <TextInput style={[cf.input, errors.name && cf.inputError]} value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
                {errors.name ? <Text style={cf.errorText}>{errors.name}</Text> : null}
              </View>
              <View style={[isDesktop && cf.colHalf]}>
                <Text style={cf.fieldLabel}>Phone *</Text>
                <TextInput style={[cf.input, errors.phone && cf.inputError]} value={phone} onChangeText={setPhone} placeholder="(555) 555-5555" keyboardType="phone-pad" />
                {errors.phone ? <Text style={cf.errorText}>{errors.phone}</Text> : null}
              </View>
            </View>
            <Text style={[cf.fieldLabel, { marginTop: 14 }]}>Email <Text style={cf.optional}>(optional)</Text></Text>
            <TextInput style={cf.input} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={cf.divider} />

          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Special Instructions</Text>
            <TextInput
              style={[cf.input, cf.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Dietary restrictions, special requests…"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={cf.divider} />

          <View style={cf.section}>
            <Text style={cf.sectionLabel}>Payment</Text>
            <View style={cf.payWrap}>
              <PaymentElement options={{ layout: 'tabs', paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] }} />
            </View>
            <Text style={cf.secured}>🔒  Secured by Stripe</Text>
          </View>

          <View style={cf.submitWrap}>
            <TouchableOpacity
              style={[cf.submitBtn, { backgroundColor: brandColor }, (loading || !stripe) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading || !stripe}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={cf.submitText}>Pay ${total.toFixed(2)} · Place Catering Order</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const cf = StyleSheet.create({
  wrap: { paddingBottom: 60 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 16 },
  backText: { fontSize: 14, fontWeight: '600' },
  columns: { flexDirection: 'column' },
  columnsDesktop: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: 1100, width: '100%', alignSelf: 'center', paddingHorizontal: 40, paddingTop: 20, gap: 32 },
  summaryPanel: { backgroundColor: '#f6f9fc', paddingHorizontal: 16, paddingVertical: 8 },
  summaryPanelDesktop: { flex: 4, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  scheduleBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, padding: 12, marginTop: 12, backgroundColor: '#fff' },
  scheduleBoxText: { fontSize: 13, fontWeight: '600' },
  formPanel: { backgroundColor: '#fff' },
  formPanelDesktop: { flex: 5, borderRadius: 12, borderWidth: 1, borderColor: '#e3e8ee', overflow: 'hidden' },
  section: { padding: 24 },
  divider: { height: 1, backgroundColor: '#e3e8ee', marginHorizontal: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#697386', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: '#0a2540', marginBottom: 6 },
  optional: { color: '#697386', fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#e3e8ee', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#0a2540', backgroundColor: '#fff' },
  inputError: { borderColor: '#c0392b' },
  textArea: { height: 80, textAlignVertical: 'top' },
  errorText: { fontSize: 12, color: '#c0392b', marginTop: 4 },
  twoCol: { flexDirection: 'row', gap: 12 },
  colHalf: { flex: 1 },
  payWrap: { borderWidth: 1, borderColor: '#e3e8ee', borderRadius: 8, padding: 16, backgroundColor: '#fff', minHeight: 60 },
  secured: { fontSize: 12, color: '#697386', textAlign: 'center', marginTop: 12 },
  submitWrap: { padding: 24, paddingTop: 8 },
  submitBtn: { borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});

// ─── Menu item card (grid) ────────────────────────────────────────────────────
function ItemCard({ item, onPress }) {
  return (
    <TouchableOpacity style={ic.card} onPress={() => onPress(item)} activeOpacity={0.75}>
      <View style={ic.textCol}>
        <Text style={ic.name} numberOfLines={2}>{item.name}</Text>
        {item.description ? (
          <Text style={ic.desc} numberOfLines={3}>{item.description}</Text>
        ) : null}
        <Text style={ic.price}>${Number(item.price ?? 0).toFixed(2)}</Text>
      </View>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={ic.image} resizeMode="cover" />
      ) : (
        <View style={[ic.image, ic.imagePlaceholder]}>
          <Ionicons name="fast-food-outline" size={26} color="#ccc" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const ic = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#efefef',
    flex: 1,
  },
  textCol: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 4 },
  desc: { fontSize: 12, color: '#888', lineHeight: 17, marginBottom: 8 },
  price: { fontSize: 14, fontWeight: '600', color: '#222', marginTop: 'auto' },
  image: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#f4f4f4' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CateringScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { categoriesWithItems, menuByCategory, loading } = useMenu(restaurant?.id, 'catering');
  const { items: cartItems, subtotal, tax, total, addItem, removeItem, updateQuantity } = useCartContext();
  const { user, customerProfile } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  const brandColor = theme.colors.brand;

  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [signInVisible, setSignInVisible] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [locationVisible, setLocationVisible] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [phase, setPhase] = useState('menu'); // 'menu' | 'checkout'
  const [clientSecret, setClientSecret] = useState(null);
  const [piError, setPiError] = useState(null);

  const hasConnectAccount = Boolean(restaurant?.stripe_account_id);
  const closedLabel = getClosedUntilLabel(restaurant?.hours_of_operation);

  const stripePromise = useMemo(() => {
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) return null;
    return loadStripe(pk);
  }, []);

  const handleItemPress = useCallback((item) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleAddToCart = useCallback((item, quantity = 1, specialInstructions = '') => {
    addItem(item, quantity, specialInstructions);
  }, [addItem]);

  const getSuggestedItems = useCallback((forItem) => {
    if (!forItem) return [];
    const results = [];
    for (const cat of categoriesWithItems) {
      const catItems = menuByCategory[cat.id]?.items || [];
      const eligible = catItems.filter((it) => it.id !== forItem.id && it.is_available);
      if (eligible.length) results.push(eligible[0]);
      if (results.length >= 3) break;
    }
    return results;
  }, [categoriesWithItems, menuByCategory]);

  const handleDirections = () => {
    if (!restaurant?.address) return;
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}`);
  };

  const handleCall = () => {
    if (restaurant?.phone) Linking.openURL(`tel:${restaurant.phone}`);
  };

  const handleCheckout = () => {
    if (!cartItems.length) { Alert.alert('Empty Cart', 'Add items before checking out.'); return; }
    if (!selectedSlot) {
      setScheduleVisible(true);
      return;
    }
    setPhase('checkout');
    if (restaurant?.id && hasConnectAccount && total) {
      createPaymentIntent(total, restaurant.id)
        .then(setClientSecret)
        .catch((e) => setPiError(e.message));
    }
  };

  const handleBack = () => { setPhase('menu'); setClientSecret(null); setPiError(null); };

  const appearance = {
    theme: 'stripe',
    variables: { colorPrimary: brandColor, fontFamily: 'system-ui, sans-serif', borderRadius: '8px' },
  };

  // ── Checkout phase ─────────────────────────────────────
  if (phase === 'checkout') {
    if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || !hasConnectAccount || piError) {
      return (
        <View style={s.errorPage}>
          <Text style={s.errorMsg}>{piError || 'Payments are not configured.'}</Text>
          <TouchableOpacity onPress={handleBack}><Text style={{ color: brandColor, marginTop: 12 }}>← Back</Text></TouchableOpacity>
        </View>
      );
    }
    if (!clientSecret) {
      return (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={brandColor} />
          <Text style={s.loadingText}>Preparing checkout…</Text>
        </View>
      );
    }
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
        <CateringCheckoutForm
          navigation={navigation}
          isDesktop={isDesktop}
          brandColor={brandColor}
          restaurant={restaurant}
          scheduledSlot={selectedSlot}
          onBack={handleBack}
        />
      </Elements>
    );
  }

  // ── Menu phase ─────────────────────────────────────────
  return (
    <View style={s.root}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <TouchableOpacity style={s.brandRow} onPress={() => navigation?.navigate('Home')} activeOpacity={0.8}>
              {restaurant?.logo_url ? (
                <Image source={{ uri: restaurant.logo_url }} style={s.logo} resizeMode="cover" />
              ) : (
                <View style={[s.logo, { backgroundColor: brandColor, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={s.logoInitial}>{(restaurant?.name || 'R').charAt(0)}</Text>
                </View>
              )}
              <Text style={s.brandName}>{restaurant?.name || 'Restaurant'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.signInBtn} onPress={() => setSignInVisible(true)} activeOpacity={0.8}>
              <Ionicons name="person-circle-outline" size={18} color="#333" />
              <Text style={s.signInText}>{user && customerProfile ? 'Account' : 'Sign in'}</Text>
            </TouchableOpacity>
          </View>

          {/* Meta row */}
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Ionicons name="location-outline" size={14} color={brandColor} />
              <Text style={[s.metaText, { color: brandColor }]}>{restaurant?.name || 'Restaurant'}</Text>
            </View>
            {restaurant?.address ? (
              <TouchableOpacity style={s.metaItem} onPress={handleDirections}>
                <Ionicons name="navigate-outline" size={14} color={brandColor} />
                <Text style={[s.metaText, { color: brandColor }]}>{restaurant.address}</Text>
              </TouchableOpacity>
            ) : null}
            {restaurant?.phone ? (
              <TouchableOpacity style={s.metaItem} onPress={handleCall}>
                <Ionicons name="call-outline" size={14} color={brandColor} />
                <Text style={[s.metaText, { color: brandColor }]}>{restaurant.phone}</Text>
              </TouchableOpacity>
            ) : null}
            {closedLabel ? (
              <View style={s.closedBadge}>
                <Text style={s.closedBadgeText}>{closedLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Tab bar ─────────────────────────────────── */}
        <View style={s.tabBar}>
          <View style={[s.tabActive, { borderBottomColor: '#111' }]}>
            <Text style={s.tabActiveText}>Catering Menu</Text>
          </View>
        </View>

        {/* ── Body ────────────────────────────────────── */}
        <View style={[s.body, isDesktop && s.bodyDesktop]}>

          {/* Left: menu */}
          <View style={[s.menuCol, isDesktop && s.menuColDesktop]}>
            <Text style={s.menuHeading}>Catering Menu</Text>

            {loading ? (
              <ActivityIndicator color={brandColor} style={{ marginTop: 40 }} />
            ) : categoriesWithItems.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="restaurant-outline" size={48} color="#ccc" />
                <Text style={s.emptyText}>Catering menu coming soon.</Text>
              </View>
            ) : (
              categoriesWithItems.map((category) => {
                const items = (menuByCategory[category.id]?.items || []);
                // Pair items into rows of 2 on desktop
                const rows = [];
                if (isDesktop) {
                  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
                }
                return (
                  <View key={category.id} style={s.categoryBlock}>
                    {categoriesWithItems.length > 1 && (
                      <Text style={s.categoryName}>{category.name}</Text>
                    )}
                    {isDesktop ? (
                      rows.map((row, ri) => (
                        <View key={ri} style={s.gridRow}>
                          {row.map((item) => (
                            <MenuItem
                              key={item.id}
                              item={item}
                              onItemPress={handleItemPress}
                              onAddToCart={handleItemPress}
                            />
                          ))}
                          {row.length === 1 && <View style={{ flex: 1 }} />}
                        </View>
                      ))
                    ) : (
                      items.map((item) => (
                        <MenuItem
                          key={item.id}
                          item={item}
                          onItemPress={handleItemPress}
                          onAddToCart={handleItemPress}
                        />
                      ))
                    )}
                  </View>
                );
              })
            )}
          </View>

          {/* Right: Your Order panel */}
          <View style={[s.orderCol, isDesktop && s.orderColDesktop]}>
            <Text style={s.orderHeading}>Your Order</Text>

            {/* Pickup / Delivery toggle */}
            <View style={s.toggleRow}>
              <TouchableOpacity style={[s.toggleBtn, { backgroundColor: brandColor, borderColor: brandColor }]} activeOpacity={0.9}>
                <Ionicons name="walk-outline" size={15} color="#fff" />
                <Text style={[s.toggleText, { color: '#fff' }]}>Pickup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.toggleBtnOutline}
                onPress={() => Alert.alert('Pickup Only', 'Catering orders are pickup only.')}
                activeOpacity={0.8}
              >
                <Ionicons name="car-outline" size={15} color="#555" />
                <Text style={[s.toggleText, { color: '#555' }]}>Delivery</Text>
              </TouchableOpacity>
            </View>

            {/* Location + time card */}
            <View style={s.infoCard}>
              <View style={s.infoRow}>
                <View style={s.infoRowText}>
                  <Text style={s.infoLabel}>Pickup location</Text>
                  <Text style={s.infoValueBold}>{restaurant?.name || 'Restaurant'}</Text>
                  {restaurant?.address ? (
                    <Text style={s.infoValue}>{restaurant.address}</Text>
                  ) : null}
                </View>
                <TouchableOpacity style={s.smallBtn} onPress={() => setLocationVisible(true)}>
                  <Text style={s.smallBtnText}>View</Text>
                </TouchableOpacity>
              </View>

              <View style={s.infoDivider} />

              <View style={s.infoRow}>
                <View style={s.infoRowText}>
                  <Text style={s.infoLabel}>Pickup time</Text>
                  <Text style={s.infoValueBold}>
                    {selectedSlot
                      ? `${formatDateLabel(selectedSlot)} at ${formatDateTo12(selectedSlot)}`
                      : 'Schedule for later'}
                  </Text>
                </View>
                <TouchableOpacity style={s.smallBtn} onPress={() => setScheduleVisible(true)}>
                  <Text style={s.smallBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Items */}
            <View style={s.itemsCard}>
              <Text style={s.itemsHeading}>Items</Text>
              {cartItems.length === 0 ? (
                <Text style={s.itemsEmpty}>You don't have any items in your cart.</Text>
              ) : (
                <>
                  {cartItems.map((item, i) => (
                    <View key={`${item.id}-${i}`} style={s.cartItemRow}>
                      <View style={s.qtyControls}>
                        <TouchableOpacity
                          style={s.qtyBtn}
                          onPress={() => updateQuantity(item.id, item.quantity - 1, item.specialInstructions)}
                        >
                          <Ionicons name="remove" size={14} color="#555" />
                        </TouchableOpacity>
                        <Text style={s.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={s.qtyBtn}
                          onPress={() => updateQuantity(item.id, item.quantity + 1, item.specialInstructions)}
                        >
                          <Ionicons name="add" size={14} color="#555" />
                        </TouchableOpacity>
                      </View>
                      <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.cartItemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
                      <TouchableOpacity onPress={() => removeItem(item.id, item.specialInstructions)} style={{ padding: 4 }}>
                        <Ionicons name="close" size={15} color="#aaa" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Totals */}
                  <View style={s.totalsBlock}>
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>Subtotal</Text>
                      <Text style={s.totalValue}>${subtotal.toFixed(2)}</Text>
                    </View>
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>Tax</Text>
                      <Text style={s.totalValue}>${tax.toFixed(2)}</Text>
                    </View>
                    <View style={s.totalRow}>
                      <Text style={s.totalLabelBold}>Total</Text>
                      <Text style={s.totalValueBold}>${total.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[s.checkoutBtn, { backgroundColor: brandColor }]}
                    onPress={handleCheckout}
                    activeOpacity={0.85}
                  >
                    <Text style={s.checkoutBtnText}>
                      {selectedSlot ? `Checkout · $${total.toFixed(2)}` : 'Schedule pickup to checkout'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footerCopy}>
          © {new Date().getFullYear()} {restaurant?.name || 'Restaurant'}
        </Text>
      </ScrollView>

      {/* Modals */}
      <MenuItemModal
        item={selectedItem}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAddToCart={handleAddToCart}
        suggestedItems={getSuggestedItems(selectedItem)}
      />
      <CustomerSignInModal visible={signInVisible} onClose={() => setSignInVisible(false)} />
      <LocationModal
        visible={locationVisible}
        onClose={() => setLocationVisible(false)}
        restaurant={restaurant}
        brandColor={brandColor}
      />
      <ScheduleModal
        visible={scheduleVisible}
        onClose={() => setScheduleVisible(false)}
        restaurant={restaurant}
        brandColor={brandColor}
        selectedSlot={selectedSlot}
        onSelect={setSelectedSlot}
      />
    </View>
  );
}

// ─── Styles (fixed light theme) ───────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 56, height: 56, borderRadius: 10 },
  logoInitial: { color: '#fff', fontSize: 24, fontWeight: '900' },
  brandName: { fontSize: 26, fontWeight: '900', color: '#111', letterSpacing: -0.5 },

  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  signInText: { fontSize: 13, fontWeight: '600', color: '#333' },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '500' },
  closedBadge: {
    backgroundColor: '#fde8ec',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closedBadgeText: { fontSize: 11, fontWeight: '600', color: '#c2314f' },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  tabActive: { paddingVertical: 12, borderBottomWidth: 2 },
  tabActiveText: { fontSize: 13, fontWeight: '700', color: '#111' },

  // Body
  body: { paddingHorizontal: 24, paddingTop: 20 },
  bodyDesktop: { flexDirection: 'row', gap: 36, maxWidth: 1280, width: '100%', alignSelf: 'center' },

  // Menu column
  menuCol: {},
  menuColDesktop: { flex: 7 },
  menuHeading: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 4 },
  categoryBlock: { marginBottom: 16 },
  categoryName: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 4 },
  gridRow: { flexDirection: 'row', gap: 28 },

  // Order column
  orderCol: { marginTop: 24 },
  orderColDesktop: { flex: 4, marginTop: 0, borderLeftWidth: 1, borderLeftColor: '#f0f0f0', paddingLeft: 28 },
  orderHeading: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 14 },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 11,
  },
  toggleBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 11,
    backgroundColor: '#fafafa',
  },
  toggleText: { fontSize: 13, fontWeight: '700' },

  // Info card
  infoCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  infoRowText: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#999', marginBottom: 3 },
  infoValueBold: { fontSize: 13, fontWeight: '700', color: '#111' },
  infoValue: { fontSize: 12, color: '#555', marginTop: 1, lineHeight: 17 },
  infoDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },
  smallBtn: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f6f6f6',
  },
  smallBtnText: { fontSize: 12, fontWeight: '600', color: '#333' },

  // Items card
  itemsCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  itemsHeading: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },
  itemsEmpty: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 24 },

  cartItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 13, fontWeight: '700', color: '#111', minWidth: 18, textAlign: 'center' },
  cartItemName: { flex: 1, fontSize: 13, color: '#333' },
  cartItemPrice: { fontSize: 13, fontWeight: '600', color: '#111' },

  totalsBlock: { borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8, paddingTop: 10, gap: 5 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 12, color: '#777' },
  totalValue: { fontSize: 12, color: '#333' },
  totalLabelBold: { fontSize: 14, fontWeight: '800', color: '#111' },
  totalValueBold: { fontSize: 14, fontWeight: '800', color: '#111' },

  checkoutBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  checkoutBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Empty / misc
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#aaa' },
  footerCopy: { fontSize: 11, color: '#bbb', paddingHorizontal: 24, paddingVertical: 24 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  loadingText: { color: '#697386', fontSize: 15 },
  errorPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  errorMsg: { fontSize: 15, color: '#c0392b', textAlign: 'center' },
});
