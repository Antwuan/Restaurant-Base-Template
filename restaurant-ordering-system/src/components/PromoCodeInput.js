import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as promoService from '../services/promoService';

/**
 * Apply / remove a marketing promo code at checkout.
 */
export default function PromoCodeInput({
  restaurantId,
  items = [],
  appliedPromo,
  onApplied,
  onCleared,
  brandColor = '#0a2540',
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleApply = async () => {
    if (!restaurantId || !code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const promo = await promoService.validatePromoCode({
        restaurantId,
        code: code.trim(),
        cartItemIds: items.map((i) => i.id),
        cartItems: items.map((i) => ({ id: i.id, quantity: i.quantity })),
      });
      // Ensure item-based benefits apply before accepting
      promoService.computePromoDiscount(
        items.reduce((sum, i) => sum + i.price * i.quantity, 0),
        items,
        promo,
      );
      onApplied?.(promo);
      setCode('');
    } catch (e) {
      setError(e.message || 'Invalid promo code');
      onCleared?.();
    } finally {
      setLoading(false);
    }
  };

  if (appliedPromo) {
    return (
      <View style={styles.appliedBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appliedLabel}>Promo applied</Text>
          <Text style={[styles.appliedCode, { color: brandColor }]}>
            {appliedPromo.code}
            {appliedPromo.title ? ` · ${appliedPromo.title}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => { setError(null); onCleared?.(); }} hitSlop={8}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(v) => { setCode(v.toUpperCase()); setError(null); }}
          placeholder="Promo code"
          placeholderTextColor="#697386"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: brandColor }, loading && { opacity: 0.6 }]}
          onPress={handleApply}
          disabled={loading || !code.trim()}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.applyText}>Apply</Text>
          )}
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e3e8ee',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0a2540',
    backgroundColor: '#ffffff',
  },
  applyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  error: { color: '#c0392b', fontSize: 12, marginTop: 6 },
  appliedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#c3e6cb',
    backgroundColor: '#f0fff4',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  appliedLabel: { fontSize: 12, color: '#697386', fontWeight: '600' },
  appliedCode: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  removeText: { fontSize: 13, fontWeight: '600', color: '#697386' },
});
