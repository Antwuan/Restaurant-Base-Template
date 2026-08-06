import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import MenuItem from './MenuItem';
import { FadeInView } from './motion';

const DESKTOP_BREAKPOINT = 768;
const GUTTER = 12;
const HALF_GUTTER = GUTTER / 2;

const CategorySection = ({ category, items, onAddToCart, onItemPress, sectionRef }) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  if (!items || items.length === 0) return null;

  return (
    <View ref={sectionRef} style={styles.container}>
      <FadeInView duration={380} fromY={12}>
        <Text style={styles.headerText}>{category.name}</Text>
      </FadeInView>
      <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
        {items.map((item, idx) => (
          <FadeInView
            key={item.id}
            delay={idx * 60}
            duration={400}
            fromY={16}
            style={[styles.cell, isDesktop && styles.cellDesktop]}
          >
            <MenuItem
              item={item}
              onAddToCart={onAddToCart}
              onItemPress={onItemPress}
              index={idx}
            />
          </FadeInView>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 36,
  },
  headerText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 14,
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
