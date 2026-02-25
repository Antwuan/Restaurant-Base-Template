// =============================================================================
// FILE: src/components/OrderSummary.js
// Phase 7: Customer app – order price breakdown
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/**
 * Props:
 *   subtotal      {number}
 *   tax           {number}
 *   total         {number}
 *   orderType     {'pickup' | 'delivery'}
 *   scheduledTime {string | null}  e.g. "ASAP" or "12:30 PM"
 */
const OrderSummary = ({ subtotal, tax, total, orderType, scheduledTime }) => {
  const { theme } = useTheme();

  const Row = ({ label, value, isTotal = false }) => (
    <View style={[styles.row, isTotal && styles.totalRow]}>
      <Text style={[styles.label, isTotal && styles.totalLabel]}>
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          isTotal && { ...styles.totalValue, color: theme.colors.brand },
        ]}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Order Summary</Text>

      <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
      <Row label="Tax" value={`$${tax.toFixed(2)}`} />

      <View style={styles.divider} />

      <Row label="Total" value={`$${total.toFixed(2)}`} isTotal />

      {/* Order type & time */}
      <View style={styles.metaBlock}>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.brandLight || '#E8F0FE' },
          ]}
        >
          <Text style={[styles.badgeText, { color: theme.colors.brand }]}>
            {orderType === 'delivery' ? '🚗 Delivery' : '🏪 Pickup'}
          </Text>
        </View>
        {scheduledTime && (
          <View style={[styles.badge, { backgroundColor: '#F5F5F5' }]}>
            <Text style={styles.badgeText}>
              🕐 {scheduledTime}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalRow: {
    marginTop: 4,
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    color: '#555',
  },
  value: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 10,
  },
  metaBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
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

