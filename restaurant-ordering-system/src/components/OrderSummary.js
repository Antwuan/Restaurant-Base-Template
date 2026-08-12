import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

const THUMB = 44;

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

/**
 * Props:
 *   items          {Array}   cart line items — { id, name, price, quantity, specialInstructions }
 *   subtotal       {number}
 *   tax            {number}
 *   total          {number}
 *   discountAmount {number}  optional promo discount on subtotal
 *   promoCode      {string}  optional applied code label
 *   orderType      {'pickup' | 'delivery'}
 *   scheduledTime  {string | null}
 *   taxLabel       {string}  default "Estimated tax" — avoid claiming a false rate
 */
const OrderSummary = ({
  items = [],
  subtotal,
  tax,
  total,
  discountAmount = 0,
  promoCode = null,
  orderType,
  scheduledTime,
  taxLabel = 'Estimated tax',
}) => {
  const { theme } = useTheme();
  const hasDiscount = Number(discountAmount) > 0;
  const isDelivery = orderType === 'delivery';

  let scheduledLabel = null;
  if (scheduledTime && scheduledTime !== 'ASAP') {
    const asDate = new Date(scheduledTime);
    if (!Number.isNaN(asDate.getTime()) && String(scheduledTime).includes('T')) {
      scheduledLabel = asDate.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } else {
      scheduledLabel = scheduledTime;
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Order Summary</Text>

      {/* Line items */}
      {items.length > 0 && (
        <View style={styles.lineItems}>
          {items.map((item, index) => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price);
            const line = Number.isFinite(price) ? price * qty : 0;
            const imageUrl = item.image_url || item.imageUrl || null;
            return (
              <View key={`${item.id}-${index}`} style={styles.lineItem}>
                <View style={styles.lineItemLeft}>
                  <View style={styles.thumbWrap}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Ionicons name="restaurant-outline" size={18} color="#c4c4c4" />
                      </View>
                    )}
                    <View style={[styles.qtyBadge, { backgroundColor: theme.colors.brand }]}>
                      <Text style={styles.qtyText}>{qty}</Text>
                    </View>
                  </View>
                  <View style={styles.lineItemInfo}>
                    <Text style={styles.lineItemName} numberOfLines={2}>
                      {item.name || 'Item'}
                    </Text>
                    {item.specialInstructions ? (
                      <Text style={styles.lineItemNote} numberOfLines={2}>
                        {item.specialInstructions}
                      </Text>
                    ) : null}
                    {Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0 ? (
                      <Text style={styles.lineItemNote} numberOfLines={4}>
                        {item.selectedModifiers.map((m) => m.optionName).filter(Boolean).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.lineItemPrice}>{formatMoney(line)}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatMoney(subtotal)}</Text>
        </View>
        {hasDiscount ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Discount{promoCode ? ` (${promoCode})` : ''}
            </Text>
            <Text style={[styles.totalValue, styles.discountValue]}>
              −{formatMoney(discountAmount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{taxLabel}</Text>
          <Text style={styles.totalValue}>{formatMoney(tax)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.grandLabel}>Total</Text>
          <Text style={[styles.grandValue, { color: theme.colors.brand }]}>
            {formatMoney(total)}
          </Text>
        </View>
      </View>

      <View style={styles.metaBlock}>
        <View style={[styles.badge, { backgroundColor: theme.colors.brandLight || '#E8F0FE' }]}>
          <Ionicons
            name={isDelivery ? 'bicycle-outline' : 'storefront-outline'}
            size={14}
            color={theme.colors.brand}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.badgeText, { color: theme.colors.brand }]}>
            {isDelivery ? 'Delivery' : 'Pickup'}
          </Text>
        </View>
        {scheduledLabel ? (
          <View style={[styles.badge, { backgroundColor: '#f0f0f0' }]}>
            <Ionicons name="time-outline" size={14} color="#444" style={{ marginRight: 4 }} />
            <Text style={styles.badgeText}>{scheduledLabel}</Text>
          </View>
        ) : scheduledTime === 'ASAP' ? (
          <View style={[styles.badge, { backgroundColor: '#f0f0f0' }]}>
            <Ionicons name="flash-outline" size={14} color="#444" style={{ marginRight: 4 }} />
            <Text style={styles.badgeText}>ASAP</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e3e8ee',
    overflow: 'hidden',
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#697386',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e3e8ee',
  },

  // Line items
  lineItems: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  lineItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    overflow: 'visible',
    flexShrink: 0,
    position: 'relative',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  qtyBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  qtyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  lineItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  lineItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0a2540',
    lineHeight: 20,
  },
  lineItemNote: {
    fontSize: 12,
    color: '#697386',
    marginTop: 1,
  },
  lineItemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0a2540',
    flexShrink: 0,
  },

  // Totals
  totals: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#697386',
  },
  totalValue: {
    fontSize: 14,
    color: '#0a2540',
    fontWeight: '500',
  },
  discountValue: {
    color: '#0d7a3f',
  },
  divider: {
    height: 1,
    backgroundColor: '#e3e8ee',
    marginVertical: 6,
  },
  grandLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a2540',
  },
  grandValue: {
    fontSize: 18,
    fontWeight: '800',
  },

  // Meta badges
  metaBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 20,
    paddingTop: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#444',
  },
});

export default OrderSummary;
