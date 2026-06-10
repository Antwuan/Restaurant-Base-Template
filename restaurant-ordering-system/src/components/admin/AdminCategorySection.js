// Admin category section for the menu preview.
// Mirrors the customer CategorySection layout but uses AdminMenuItem
// and shows an "+ Add Item" button in the header so admins can add
// items directly within a category.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import AdminMenuItem from './AdminMenuItem';

export default function AdminCategorySection({
  category,
  items,
  onEdit,
  onDelete,
  onToggleAvailability,
  onAddItem,
  togglingId,
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      {/* Category header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{category.name}</Text>
        <View style={styles.headerLine} />
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.colors.brand }]}
          onPress={() => onAddItem(category)}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Items */}
      {items.length === 0 ? (
        <View style={styles.emptyCategory}>
          <Text style={styles.emptyCategoryText}>No items in this category yet.</Text>
          <TouchableOpacity onPress={() => onAddItem(category)}>
            <Text style={[styles.emptyCategoryLink, { color: theme.colors.brand }]}>
              Add the first item
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        items.map((item) => (
          <AdminMenuItem
            key={item.id}
            item={item}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleAvailability={onToggleAvailability}
            toggling={togglingId === item.id}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    flexShrink: 0,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e8e8e8',
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    flexShrink: 0,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCategory: {
    marginHorizontal: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: 4,
  },
  emptyCategoryText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  emptyCategoryLink: {
    fontSize: 13,
    fontWeight: '600',
  },
});
