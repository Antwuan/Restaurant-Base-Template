// Admin variant of the customer MenuItem card.
// Renders the same visual card but replaces "+ Add" with Edit / Delete /
// availability toggle controls so admins see exactly what customers see
// while retaining full CRUD access.
import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

export default function AdminMenuItem({ item, onEdit, onDelete, onToggleAvailability, toggling }) {
  const { theme } = useTheme();
  const isUnavailable = !item.is_available;

  return (
    <View style={[styles.card, isUnavailable && styles.cardUnavailable]}>
      {/* Image */}
      <View style={styles.imageContainer}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={[styles.image, isUnavailable && styles.imageUnavailable]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.backgroundSunken }]}>
            <Text style={styles.imagePlaceholderText}>🍽</Text>
          </View>
        )}
        {isUnavailable && (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableBadgeText}>Hidden</Text>
          </View>
        )}
      </View>

      {/* Info + admin actions */}
      <View style={styles.body}>
        {/* Item info — mirrors customer card */}
        <View style={styles.info}>
          <Text style={[styles.name, isUnavailable && styles.textMuted]} numberOfLines={2}>
            {item.name}
          </Text>
          {item.description ? (
            <Text style={[styles.description, isUnavailable && styles.textMuted]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          <Text style={[styles.price, isUnavailable && styles.textMuted]}>
            ${Number(item.price ?? 0).toFixed(2)}
          </Text>
        </View>

        {/* Admin action row */}
        <View style={styles.actions}>
          <View style={styles.availabilityRow}>
            <Text style={styles.availabilityLabel}>
              {item.is_available ? 'Visible' : 'Hidden'}
            </Text>
            <Switch
              value={item.is_available}
              onValueChange={() => onToggleAvailability(item)}
              disabled={toggling}
              trackColor={{ true: '#34C759', false: '#d1d5db' }}
              thumbColor="#fff"
              style={styles.toggle}
            />
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => onEdit(item)}
              accessibilityLabel={`Edit ${item.name}`}
            >
              <Ionicons name="pencil-outline" size={14} color="#374151" />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => onDelete(item)}
              accessibilityLabel={`Delete ${item.name}`}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginVertical: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    }),
  },
  cardUnavailable: {
    opacity: 0.65,
  },
  imageContainer: {
    width: 100,
    flexShrink: 0,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageUnavailable: {
    opacity: 0.5,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 100,
  },
  imagePlaceholderText: {
    fontSize: 32,
  },
  unavailableBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unavailableBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  info: {
    gap: 3,
    marginBottom: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  description: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 4,
  },
  textMuted: {
    color: '#aaa',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 8,
    gap: 8,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  availabilityLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  toggle: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  editBtnText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
});
