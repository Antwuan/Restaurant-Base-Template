/**
 * ConfirmationScreen — post-checkout thank-you layout (web).
 *
 * Desktop: two columns — left confirmation details + map + meta table;
 * right “Your Order” summary with product images. Mobile: stacked.
 * Navigation: expects `order` (and optional `pointsEarned`) from checkout.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Image,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { useMenu } from '../../hooks/useMenu';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import {
  enrichItemsWithMenuImages,
  formatPaymentLabel,
  loadConfirmationPayload,
} from '../../utils/confirmationPayload';

const DESKTOP_BP = 900;
const THUMB = 64;
const NAVBAR_H = 60;

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function firstNameFrom(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return null;
  return raw.split(/\s+/)[0];
}

function resolveConfirmationParams(routeParams) {
  const fromRoute = routeParams || {};
  if (fromRoute.order) return fromRoute;
  const stored = loadConfirmationPayload();
  if (stored?.order) return stored;
  return fromRoute;
}

export default function ConfirmationScreen({ route, navigation }) {
  const resolved = useMemo(
    () => resolveConfirmationParams(route?.params),
    [route?.params],
  );
  const { order, pointsEarned = 0 } = resolved;
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const { isCustomerAuthenticated } = useAuth();
  const { allItems } = useMenu(restaurant?.id, order?.menu_type || null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;
  const [signInVisible, setSignInVisible] = useState(false);

  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(checkScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 55,
      friction: 7,
    }).start();
  }, [checkScale]);

  const handleOrderAgain = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Menu' }] });
  };

  const handleContact = () => {
    if (restaurant?.email) {
      Linking.openURL(`mailto:${restaurant.email}`);
      return;
    }
    if (restaurant?.phone) {
      Linking.openURL(`tel:${restaurant.phone}`);
    }
  };

  const handleDirections = () => {
    if (!addressQuery) return;
    Linking.openURL(`https://maps.google.com/?q=${addressQuery}`);
  };

  const pickupName = order?.pickup_location?.name || restaurant?.name || 'Pickup';
  const pickupAddress = order?.pickup_location?.address || restaurant?.address || '';
  const addressQuery = useMemo(
    () => (pickupAddress ? encodeURIComponent(pickupAddress) : ''),
    [pickupAddress],
  );
  const mapEmbedUrl = addressQuery
    ? `https://maps.google.com/maps?q=${addressQuery}&output=embed&z=15`
    : null;

  const items = useMemo(
    () => enrichItemsWithMenuImages(Array.isArray(order?.items) ? order.items : [], allItems),
    [order?.items, allItems],
  );

  const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const subtotal = order?.subtotal ?? 0;
  const tax = order?.tax ?? 0;
  const total = order?.total ?? 0;
  const discount = Number(order?.discount_amount) || 0;
  const thankName = firstNameFrom(order?.customer_name);
  const orderLabel = order?.order_number ? `Order #${order.order_number}` : 'Order placed';
  const payment = order?.payment || null;
  const paymentLabel = formatPaymentLabel(payment)
    || (order?.stripe_payment_intent_id ? 'Card' : 'Paid');
  const brand = theme.colors.brand || '#111';
  const helpAvailable = Boolean(restaurant?.email || restaurant?.phone);

  const pageMinHeight = Platform.OS === 'web'
    ? `calc(100vh - ${NAVBAR_H}px)`
    : undefined;

  const readyCopy = order?.scheduled_time
    ? `Pickup at ${new Date(order.scheduled_time).toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`
    : 'We will email you when your order is ready for pickup.';

  const orderSummary = (
    <View style={[styles.summaryPanel, isDesktop && styles.summaryPanelDesktop]}>
      <View style={styles.summaryHeader}>
        <Ionicons name="bag-handle-outline" size={22} color="#111" />
        <Text style={styles.summaryTitle}>Your Order</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{itemCount || items.length || 0}</Text>
        </View>
      </View>

      <View style={styles.summaryItems}>
        {items.map((item, i) => {
          const qty = Number(item.quantity) || 0;
          const unit = Number(item.price);
          const line = Number.isFinite(unit) ? unit * qty : 0;
          const imageUrl = item.image_url || item.imageUrl || null;
          const mods = item.selected_modifiers || item.selectedModifiers || [];
          return (
            <View
              key={`${item.id || item.name}-${i}`}
              style={[
                styles.summaryItem,
                i < items.length - 1 && styles.summaryItemBorder,
              ]}
            >
              <View style={styles.summaryThumbWrap}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.summaryThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.summaryThumb, styles.summaryThumbPlaceholder]}>
                    <Ionicons name="restaurant-outline" size={22} color="#bbb" />
                  </View>
                )}
              </View>
              <View style={styles.summaryItemBody}>
                <Text style={styles.summaryItemName} numberOfLines={2}>
                  {item.name || 'Item'}
                </Text>
                {Array.isArray(mods) && mods.length > 0 ? (
                  <Text style={styles.summaryItemMods} numberOfLines={3}>
                    {mods.map((m) => m.optionName || m.option_name).filter(Boolean).join(', ')}
                  </Text>
                ) : null}
                {item.special_instructions || item.specialInstructions ? (
                  <Text style={styles.summaryItemMods} numberOfLines={2}>
                    {item.special_instructions || item.specialInstructions}
                  </Text>
                ) : null}
              </View>
              <View style={styles.qtyBox}>
                <Text style={styles.qtyBoxText}>x {qty}</Text>
              </View>
              <Text style={styles.summaryItemPrice}>{formatMoney(line)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.totalsBlock}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatMoney(subtotal)}</Text>
        </View>
        {discount > 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Discount</Text>
            <Text style={[styles.totalValue, styles.discountValue]}>
              −{formatMoney(discount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tax</Text>
          <Text style={styles.totalValue}>{formatMoney(tax)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Total</Text>
          <View style={styles.grandRight}>
            <View style={styles.currencyTag}>
              <Text style={styles.currencyTagText}>USD</Text>
            </View>
            <Text style={styles.grandValue}>{formatMoney(total)}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const detailsColumn = (
    <View style={[styles.detailsColumn, isDesktop && styles.detailsColumnDesktop]}>
      <Text style={styles.pageTitle}>Confirmation</Text>

      <View style={styles.thanksRow}>
        <Animated.View
          style={[
            styles.checkCircle,
            { borderColor: brand },
            { transform: [{ scale: checkScale }] },
          ]}
        >
          <Ionicons name="checkmark" size={22} color={brand} />
        </Animated.View>
        <View style={styles.thanksText}>
          <Text style={styles.orderNumberLine}>{orderLabel}</Text>
          <Text style={styles.thankYou}>
            {thankName ? `Thank you ${thankName}!` : 'Thank you!'}
          </Text>
        </View>
      </View>

      {Number(pointsEarned) > 0 ? (
        <View style={[styles.pointsBanner, { backgroundColor: theme.colors.brandLight || '#f0f7ff', borderColor: brand }]}>
          <View style={[styles.pointsIconWrap, { backgroundColor: brand }]}>
            <Ionicons name="star" size={18} color="#fff" />
          </View>
          <View style={styles.pointsCopy}>
            <Text style={[styles.pointsHeadline, { color: brand }]}>
              +{pointsEarned} point{pointsEarned === 1 ? '' : 's'} earned
            </Text>
            <Text style={styles.pointsSub}>
              Added to your rewards balance for this order.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.updatesBox}>
        <Text style={styles.updatesTitle}>Order Updates</Text>
        <Text style={styles.updatesBody}>
          You will receive order updates via email. {readyCopy}
        </Text>
      </View>

      {!isCustomerAuthenticated ? (
        <Text style={styles.guestNudge}>
          Sign in to track all open orders in one place.{' '}
          <Text
            onPress={() => setSignInVisible(true)}
            style={[styles.guestNudgeLink, { color: brand }]}
          >
            Sign in
          </Text>
          {' · '}
          <Text
            onPress={() => navigation.navigate('OrderTracker')}
            style={[styles.guestNudgeLink, { color: brand }]}
          >
            View orders
          </Text>
        </Text>
      ) : null}

      {mapEmbedUrl ? (
        <View style={styles.mapWrap}>
          {Platform.OS === 'web' ? (
            <iframe
              src={mapEmbedUrl}
              title="Pickup location map"
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              loading="lazy"
              allowFullScreen
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map-outline" size={32} color="#ccc" />
              <Text style={styles.mapPlaceholderText}>Map unavailable</Text>
            </View>
          )}
        </View>
      ) : null}

      {addressQuery ? (
        <TouchableOpacity
          style={styles.directionsLink}
          onPress={handleDirections}
          accessibilityRole="link"
          accessibilityLabel="Get directions"
        >
          <Ionicons name="navigate-outline" size={15} color={brand} />
          <Text style={[styles.directionsLinkText, { color: brand }]}>Get Directions</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.metaTable}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Pickup</Text>
          <Text style={styles.metaValue}>
            {[order?.customer_name, pickupName, pickupAddress].filter(Boolean).join('\n') || '—'}
          </Text>
        </View>
        <View style={[styles.metaRow, styles.metaRowLast]}>
          <Text style={styles.metaLabel}>Payment</Text>
          <View style={styles.paymentValue}>
            <Text style={styles.metaValue}>{paymentLabel}</Text>
            {payment?.last4 ? (
              <Text style={styles.paymentMeta}>
                {[payment.brand, payment.funding].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.footerActions}>
        {helpAvailable ? (
          <TouchableOpacity
            style={styles.helpRow}
            onPress={handleContact}
            accessibilityRole="link"
            accessibilityLabel="Contact us for help"
          >
            <Ionicons name="information-circle-outline" size={16} color="#666" />
            <Text style={styles.helpText}>
              Need Help?{' '}
              <Text style={[styles.helpLink, { color: brand }]}>Contact Us</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: brand }]}
          onPress={handleOrderAgain}
          accessibilityRole="button"
          accessibilityLabel="Continue ordering"
        >
          <Text style={styles.continueBtnText}>Continue Ordering</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={[styles.scroll, pageMinHeight ? { minHeight: pageMinHeight } : null]}
      contentContainerStyle={[
        styles.page,
        pageMinHeight ? { minHeight: pageMinHeight } : styles.pageGrow,
        isDesktop && styles.pageDesktop,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {isDesktop ? (
        <View style={[styles.columns, pageMinHeight ? { minHeight: pageMinHeight } : styles.columnsGrow]}>
          {detailsColumn}
          {orderSummary}
        </View>
      ) : (
        <>
          {detailsColumn}
          {orderSummary}
        </>
      )}
      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { height: '100%' } : {}),
  },
  page: {
    flexGrow: 1,
    backgroundColor: '#fff',
  },
  pageGrow: {
    flexGrow: 1,
  },
  pageDesktop: {
    flexGrow: 1,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexGrow: 1,
  },
  columnsGrow: {
    flexGrow: 1,
  },

  detailsColumn: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { minHeight: '100%' } : {}),
  },
  detailsColumnDesktop: {
    flex: 1.35,
    paddingHorizontal: 56,
    paddingTop: 40,
    paddingBottom: 48,
    justifyContent: 'flex-start',
  },

  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    marginBottom: 28,
    letterSpacing: -0.5,
  },
  thanksRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  checkCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  thanksText: {
    flex: 1,
    minWidth: 0,
  },
  orderNumberLine: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
  },
  thankYou: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.4,
  },
  pointsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  pointsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pointsCopy: {
    flex: 1,
    minWidth: 0,
  },
  pointsHeadline: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  pointsSub: {
    fontSize: 13,
    color: '#444',
    lineHeight: 18,
  },

  updatesBox: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  updatesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  updatesBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  guestNudge: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 20,
  },
  guestNudgeLink: {
    fontWeight: '700',
  },

  mapWrap: {
    width: '100%',
    height: 220,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#eee',
    marginBottom: 10,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapPlaceholderText: {
    fontSize: 13,
    color: '#999',
  },
  directionsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 22,
    minHeight: 36,
  },
  directionsLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },

  metaTable: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e5e5',
    marginBottom: 28,
  },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    gap: 20,
  },
  metaRowLast: {
    borderBottomWidth: 0,
  },
  metaLabel: {
    width: 88,
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    flexShrink: 0,
  },
  metaValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  paymentValue: {
    flex: 1,
    minWidth: 0,
  },
  paymentMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 3,
    textTransform: 'capitalize',
  },

  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    marginTop: 'auto',
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  helpText: {
    fontSize: 13,
    color: '#555',
  },
  helpLink: {
    fontWeight: '600',
  },
  continueBtn: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  summaryPanel: {
    backgroundColor: '#f6f6f6',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  summaryPanelDesktop: {
    width: 420,
    maxWidth: '42%',
    flexShrink: 0,
    flexGrow: 1,
    alignSelf: 'stretch',
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#ececec',
    paddingHorizontal: 36,
    paddingTop: 48,
    paddingBottom: 48,
    ...(Platform.OS === 'web' ? { minHeight: '100%' } : {}),
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryItems: {
    marginBottom: 8,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  summaryItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  summaryThumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
    flexShrink: 0,
  },
  summaryThumb: {
    width: '100%',
    height: '100%',
  },
  summaryThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItemBody: {
    flex: 1,
    minWidth: 0,
  },
  summaryItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  summaryItemMods: {
    fontSize: 12,
    color: '#666',
    marginTop: 3,
    lineHeight: 16,
  },
  qtyBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  qtyBoxText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  summaryItemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    flexShrink: 0,
    minWidth: 58,
    textAlign: 'right',
  },
  totalsBlock: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 16,
    gap: 10,
    marginTop: 'auto',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#444',
  },
  totalValue: {
    fontSize: 14,
    color: '#111',
    fontWeight: '500',
  },
  discountValue: {
    color: '#0d7a3f',
  },
  grandRow: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  grandLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },
  grandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currencyTag: {
    backgroundColor: '#e8e8e8',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currencyTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  grandValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
});

