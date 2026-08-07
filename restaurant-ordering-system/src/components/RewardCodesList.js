import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CopyButton from './CopyButton';

/**
 * Durable list of unused one-time reward checkout codes with reactive copy.
 * Used codes are filtered out by getMyRewardCodes — not shown grayed out.
 * @param {{ codes: Array, loading?: boolean, brandColor?: string, emptyText?: string }} props
 */
export default function RewardCodesList({
  codes = [],
  loading = false,
  brandColor = '#007AFF',
  emptyText = 'Redeem an offer to get a checkout code here.',
}) {
  if (loading) {
    return <ActivityIndicator color={brandColor} style={{ marginTop: 12 }} />;
  }

  if (!codes.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="pricetag-outline" size={28} color="#ccc" />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {codes.map((item) => {
        const code = String(item.code || '').toUpperCase();
        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.body}>
              <Text style={styles.code}>{code}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {item.title || 'Reward code'}
              </Text>
              <Text style={[styles.readyBadge, { color: brandColor }]}>Ready for checkout</Text>
            </View>
            <CopyButton
              value={code}
              brandColor={brandColor}
              accessibilityLabel={`Copy code ${code}`}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e3e8ee',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
  },
  body: { flex: 1, gap: 2 },
  code: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    letterSpacing: 0.5,
  },
  title: { fontSize: 13, color: '#555', fontWeight: '600' },
  readyBadge: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
});
