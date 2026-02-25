// =============================================================================
// FILE: src/components/CartItem.js
// Phase 7: Customer app – single line item in the cart
// =============================================================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../theme';

const CartItem = ({ item, onIncrease, onDecrease, onRemove }) => {
  const { theme } = useTheme();
  const lineTotal = (item.price * item.quantity).toFixed(2);

  const primary = theme.colors.brand;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {/* Name & Price */}
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.unitPrice}>${item.price.toFixed(2)} each</Text>
          {item.specialInstructions ? (
            <Text style={styles.instructions} numberOfLines={2}>
              Note: {item.specialInstructions}
            </Text>
          ) : null}
        </View>

        {/* Line total */}
        <Text style={styles.lineTotal}>${lineTotal}</Text>
      </View>

      {/* Controls row */}
      <View style={styles.controlsRow}>
        {/* Remove */}
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          style={styles.removeButton}
          accessibilityLabel={`Remove ${item.name}`}
        >
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>

        {/* Quantity controls */}
        <View style={styles.qtyControls}>
          <TouchableOpacity
            onPress={() => onDecrease(item.id)}
            style={[
              styles.qtyButton,
              { borderColor: primary },
            ]}
            accessibilityLabel="Decrease quantity"
          >
            <Text style={[styles.qtyButtonText, { color: primary }]}>−</Text>
          </TouchableOpacity>

          <Text style={styles.qtyText}>{item.quantity}</Text>

          <TouchableOpacity
            onPress={() => onIncrease(item.id)}
            style={[
              styles.qtyButton,
              { backgroundColor: primary, borderColor: primary },
            ]}
            accessibilityLabel="Increase quantity"
          >
            <Text style={[styles.qtyButtonText, { color: '#fff' }]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: { boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
    }),
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  nameBlock: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  unitPrice: {
    fontSize: 13,
    color: '#888',
  },
  instructions: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
    marginTop: 4,
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    alignSelf: 'flex-start',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeButton: {
    paddingVertical: 4,
  },
  removeText: {
    fontSize: 13,
    color: '#e53935',
    fontWeight: '500',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
    color: '#1a1a1a',
  },
});

export default CartItem;

