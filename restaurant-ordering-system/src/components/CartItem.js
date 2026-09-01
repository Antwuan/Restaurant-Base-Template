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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QuantityStepper } from './motion';

const MAX_QTY = 99;
const THUMB = 64;

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

const CartItem = ({ item, onIncrease, onDecrease, onRemove }) => {
  const qty = Math.max(0, Math.min(MAX_QTY, Number(item.quantity) || 0));
  const unit = Number(item.price);
  const lineTotal = Number.isFinite(unit) ? unit * qty : 0;
  const atMax = qty >= MAX_QTY;
  const atMin = qty <= 1;
  const mods = Array.isArray(item.selectedModifiers) ? item.selectedModifiers : [];
  const name = (item.name || 'Item').trim() || 'Item';
  const imageUrl = item.image_url || item.imageUrl || null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.thumbWrap} accessibilityElementsHidden>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="restaurant-outline" size={22} color="#c4c4c4" />
            </View>
          )}
        </View>

        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={3}>
            {name}
          </Text>
          <Text style={styles.unitPrice}>{formatMoney(unit)} each</Text>
          {item.specialInstructions ? (
            <Text style={styles.instructions} numberOfLines={4}>
              Note: {item.specialInstructions}
            </Text>
          ) : null}
          {mods.length > 0 ? (
            <View style={styles.modList}>
              {mods.map((m, idx) => (
                <Text
                  key={m.optionId || `${m.optionName}-${idx}`}
                  style={styles.instructions}
                  numberOfLines={2}
                >
                  {m.optionName || 'Option'}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={styles.lineTotal}>{formatMoney(lineTotal)}</Text>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={onRemove}
          style={styles.removeButton}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name} from cart`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>

        <QuantityStepper
          variant="modal"
          value={qty}
          onDecrease={onDecrease}
          onIncrease={onIncrease}
          max={MAX_QTY}
          decreaseLabel={atMin ? `Remove ${name}` : `Decrease quantity of ${name}`}
          increaseLabel={
            atMax
              ? `Maximum quantity of ${MAX_QTY} reached`
              : `Increase quantity of ${name}`
          }
        />
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
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#f3f4f6',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 3,
  },
  unitPrice: {
    fontSize: 13,
    color: '#666',
  },
  instructions: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
    lineHeight: 16,
  },
  modList: {
    marginTop: 2,
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeButton: {
    paddingVertical: 8,
    paddingRight: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: '600',
  },
});

export default CartItem;
export { MAX_QTY, formatMoney };
