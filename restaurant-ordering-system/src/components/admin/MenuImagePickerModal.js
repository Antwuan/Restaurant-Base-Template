import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../../theme';
import * as menuService from '../../services/menuService';

/**
 * Inline expandable picker for reusing an existing menu item photo
 * (e.g. gallery / About Us "From menu" flow).
 */
export default function MenuImagePickerModal({
  visible,
  restaurantId,
  onSelect,
  onClose,
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width: winW } = useWindowDimensions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !restaurantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    menuService
      .getMenuItems(restaurantId)
      .then((rows) => {
        if (cancelled) return;
        setItems((rows || []).filter((item) => !!item.image_url));
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Could not load menu images.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, restaurantId]);

  if (!visible) return null;

  const gap = 10;
  const cols = winW >= 720 ? 4 : 3;
  const cell = Math.max(72, Math.floor((Math.min(winW - 64, 480) - gap * (cols - 1)) / cols));

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: c.backgroundSunken,
          borderColor: c.border,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Choose a photo already used on a menu item.
        </Text>
        {onClose ? (
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={{ color: c.brand, fontWeight: '600', fontSize: 13 }}>Close</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={{ color: c.textSecondary, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : !items.length ? (
        <View style={styles.centered}>
          <Text style={{ color: c.textSecondary, textAlign: 'center' }}>
            No menu items have photos yet. Upload images in Menu first.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={[styles.grid, { gap }]}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.cell, { width: cell }]}
              onPress={() => onSelect?.(item)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: item.image_url }}
                style={[styles.thumb, { width: cell, height: cell }]}
                resizeMode="cover"
              />
              <Text
                style={[styles.itemName, { color: c.textPrimary }]}
                numberOfLines={2}
              >
                {item.name || 'Untitled'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  hint: { flex: 1, fontSize: 13, lineHeight: 18 },
  centered: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  gridScroll: {
    maxHeight: 280,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 4,
  },
  cell: { marginBottom: 2 },
  thumb: {
    borderRadius: 8,
    backgroundColor: '#e5e5e5',
  },
  itemName: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
