// Admin variant of the customer MenuItem card.
// Visually identical to the customer card (text left, image right) but with:
// - A drag-handle grip strip on the far left (web only)
// - A pencil Edit button at the image bottom-right (replacing "+")
// - A tappable Visible/Hidden badge in the info column
import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

const CARD_HEIGHT = 150;
const MEDIA_WIDTH = '42%';

export default function AdminMenuItem({
  item,
  onEdit,
  onToggleAvailability,
  toggling,
  dragHandleListeners,
}) {
  const { theme } = useTheme();
  const isUnavailable = !item.is_available;

  return (
    <View style={[styles.card, isUnavailable && styles.cardUnavailable]}>
      {/* Drag handle strip — web only, renders as a native div so pointer events work */}
      {Platform.OS === 'web' && dragHandleListeners && (
        <div
          {...dragHandleListeners}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            touchAction: 'none',
            width: 28,
            alignSelf: 'stretch',
            flexShrink: 0,
            borderRightWidth: 1,
            borderRightStyle: 'solid',
            borderRightColor: '#f3f4f6',
          }}
        >
          <Ionicons name="reorder-three-outline" size={18} color="#c4c9d4" />
        </div>
      )}

      {/* Left: text info — mirrors customer MenuItem */}
      <View style={styles.info}>
        <Text style={[styles.name, isUnavailable && styles.textMuted]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.price, isUnavailable && styles.textMuted]}>
          ${Number(item.price ?? 0).toFixed(2)}
        </Text>
        {item.description ? (
          <Text
            style={[styles.description, { color: theme.colors.brand }, isUnavailable && styles.textMuted]}
            numberOfLines={3}
          >
            {item.description}
          </Text>
        ) : null}

        {/* Tappable availability badge */}
        <TouchableOpacity
          style={[styles.availBadge, isUnavailable && styles.availBadgeHidden]}
          onPress={() => onToggleAvailability(item)}
          disabled={toggling}
          activeOpacity={0.7}
          accessibilityLabel={item.is_available ? 'Mark as hidden' : 'Mark as visible'}
        >
          {toggling ? (
            <ActivityIndicator size="small" color="#9ca3af" style={{ width: 14, height: 14 }} />
          ) : (
            <View style={[styles.availDot, isUnavailable ? styles.availDotOff : styles.availDotOn]} />
          )}
          <Text style={[styles.availText, isUnavailable && styles.availTextHidden]}>
            {item.is_available ? 'Visible' : 'Hidden'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Right: image + edit button — mirrors customer MenuItem */}
      <View style={styles.media}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={[styles.image, isUnavailable && styles.imageUnavailable]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="restaurant-outline" size={28} color="#cbd5e1" />
          </View>
        )}

        {/* Edit button — same position and style as customer "+" button */}
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => onEdit(item)}
          accessibilityLabel={`Edit ${item.name}`}
          activeOpacity={0.8}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="pencil" size={16} color="#1a1a1a" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: CARD_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#fff',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    }),
  },
  cardUnavailable: {
    opacity: 0.6,
  },
  info: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    justifyContent: 'flex-start',
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    lineHeight: 22,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    fontWeight: '500',
  },
  textMuted: {
    color: '#aaa',
  },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#f0fdf4',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 10,
  },
  availBadgeHidden: {
    backgroundColor: '#f3f4f6',
  },
  availDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  availDotOn: {
    backgroundColor: '#22c55e',
  },
  availDotOff: {
    backgroundColor: '#9ca3af',
  },
  availText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16a34a',
  },
  availTextHidden: {
    color: '#6b7280',
  },
  media: {
    width: MEDIA_WIDTH,
    maxWidth: 220,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: CARD_HEIGHT,
    backgroundColor: '#f3f4f6',
  },
  imageUnavailable: {
    opacity: 0.5,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 5 },
      android: { elevation: 4 },
    }),
  },
});
