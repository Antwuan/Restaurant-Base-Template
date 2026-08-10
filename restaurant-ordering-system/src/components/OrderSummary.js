import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

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
}) => {
  const { theme } = useTheme();
  const hasDiscount = Number(discountAmount) > 0;

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
          {items.map((item, index) => (
            <View key={`${item.id}-${index}`} style={styles.lineItem}>
              <View style={styles.lineItemLeft}>
                <View style={[styles.qtyBadge, { backgroundColor: theme.colors.brand }]}>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                </View>
                <View style={styles.lineItemInfo}>
                  <Text style={styles.lineItemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.specialInstructions ? (
                    <Text style={styles.lineItemNote} numberOfLines={1}>
                      {item.specialInstructions}
                    </Text>
                  ) : null}
                  {Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0 ? (
                    <Text style={styles.lineItemNote} numberOfLines={2}>
                      {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.lineItemPrice}>
                ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Totals */}
      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>${Number(subtotal).toFixed(2)}</Text>
        </View>
        {hasDiscount ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Discount{promoCode ? ` (${promoCode})` : ''}
            </Text>
            <Text style={[styles.totalValue, styles.discountValue]}>
              −${Number(discountAmount).toFixed(2)}
            </Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tax (8%)</Text>
          <Text style={styles.totalValue}>${Number(tax).toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.grandLabel}>Total</Text>
          <Text style={[styles.grandValue, { color: theme.colors.brand }]}>
            ${Number(total).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Order meta badges */}
      <View style={styles.metaBlock}>
        <View style={[styles.badge, { backgroundColor: theme.colors.brandLight || '#E8F0FE' }]}>
          <Text style={[styles.badgeText, { color: theme.colors.brand }]}>
            {orderType === 'delivery' ? '🚗  Delivery' : '🏪  Pickup'}
          </Text>
        </View>
        {scheduledLabel ? (
          <View style={[styles.badge, { backgroundColor: '#f0f0f0' }]}>
            <Text style={styles.badgeText}>🕐  {scheduledLabel}</Text>
          </View>
        ) : scheduledTime === 'ASAP' ? (
          <View style={[styles.badge, { backgroundColor: '#f0f0f0' }]}>
            <Text style={styles.badgeText}>🕐  ASAP</Text>
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
    gap: 10,
  },
  qtyBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  lineItemInfo: {
    flex: 1,
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
