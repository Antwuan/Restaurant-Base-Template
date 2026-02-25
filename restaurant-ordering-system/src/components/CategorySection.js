// =============================================================================
// FILE: src/components/CategorySection.js
// Phase 7: Customer app – section for a category and its items
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MenuItem from './MenuItem';

const CategorySection = ({ category, items, onAddToCart }) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{category.name}</Text>
        <View style={styles.headerLine} />
      </View>
      {items.map((item) => (
        <MenuItem
          key={item.id}
          item={item}
          onAddToCart={onAddToCart}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginRight: 12,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e8e8e8',
  },
});

export default CategorySection;

