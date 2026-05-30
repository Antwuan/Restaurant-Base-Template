/**
 * MenuScreen
 * - Loads restaurant + menu data via hooks.
 * - Renders MenuCarousel, RestaurantHeader, and CategorySections.
 * - Cart opens via header icon / drawer (parent wrapper).
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useMenu } from '../../hooks/useMenu';
import { useCarousel } from '../../hooks/useCarousel';
import { useCart } from '../../hooks/useCart';
import { useTheme } from '../../theme';
import RestaurantHeader from '../../components/RestaurantHeader';
import CategorySection from '../../components/CategorySection';
import MenuCarousel from '../../components/MenuCarousel';

export default function MenuScreen() {
  const { restaurant } = useRestaurantContext();
  const {
    categoriesWithItems,
    menuByCategory,
    loading,
    error,
    refetch,
  } = useMenu(restaurant?.id);

  const { slides, refetch: refetchCarousel } = useCarousel(restaurant?.id);
  const { addItem } = useCart(restaurant?.id);

  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchCarousel()]);
    setRefreshing(false);
  }, [refetch, refetchCarousel]);

  const isEmpty = !loading && !error && categoriesWithItems.length === 0;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
        <Text style={styles.loadingText}>Loading menu…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load menu.</Text>
        <TouchableOpacity
          onPress={refetch}
          style={[styles.retryBtn, { backgroundColor: theme.colors.brand }]}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={isEmpty ? styles.scrollEmpty : undefined}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
          />
        )}
      >
        <MenuCarousel slides={slides} />
        <RestaurantHeader restaurant={restaurant} />

        {isEmpty ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>No menu items available right now.</Text>
          </View>
        ) : (
          categoriesWithItems.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              items={menuByCategory[category.id]?.items || []}
              onAddToCart={addItem}
            />
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrollEmpty: {
    flexGrow: 1,
  },
  emptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#cc2222',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
