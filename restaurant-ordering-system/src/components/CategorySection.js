import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import MenuItem from './MenuItem';
import { useTheme } from '../theme';

const DESKTOP_BREAKPOINT = 768;
const GUTTER = 12;
const HALF_GUTTER = GUTTER / 2;

const CategorySection = ({ category, items, onAddToCart, onItemPress, sectionRef }) => {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  if (!items || items.length === 0) return null;

  return (
    <View ref={sectionRef} style={styles.container}>
      <Text
        style={[styles.headerText, { color: theme.colors.textPrimary }]}
        accessibilityRole="header"
      >
        {category.name}
      </Text>
      <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[styles.cell, isDesktop && styles.cellDesktop]}
          >
            <MenuItem
              item={item}
              onAddToCart={onAddToCart}
              onItemPress={onItemPress}
            />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 32,
  },
  headerText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'column',
    rowGap: GUTTER,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Cancel cell horizontal padding so outer edges stay flush
    marginHorizontal: -HALF_GUTTER,
  },
  cell: {
    width: '100%',
  },
  cellDesktop: {
    // Two columns with a 12px gutter (RN StyleSheet has no calc())
    width: '50%',
    paddingHorizontal: HALF_GUTTER,
  },
});

export default CategorySection;
