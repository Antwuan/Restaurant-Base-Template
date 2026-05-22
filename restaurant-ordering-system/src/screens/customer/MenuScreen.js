/**
 * MenuScreen
 * - Loads restaurant + menu data via hooks.
 * - Renders RestaurantHeader plus a CategorySection for each category.
 * - Supports pull‑to‑refresh, loading/error states, and
 *   a floating cart FAB that shows the current item count.
 *
 * Depends on:
 * - context: RestaurantContext
 * - hooks: useMenu, useCart
 * - theme: useTheme from ../../theme
 * - components: RestaurantHeader, CategorySection
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
import { useCart } from '../../hooks/useCart';
import { useTheme } from '../../theme';
import RestaurantHeader from '../../components/RestaurantHeader';
import CategorySection from '../../components/CategorySection';

export default function MenuScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const {
    categoriesWithItems,
    menuByCategory,
    loading,
    error,
    refetch,
  } = useMenu(restaurant?.id);

  const {
    items,
    itemCount,
    addItem,
  } = useCart(restaurant?.id);

  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const totalCartItems = itemCount;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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

        {/* Spacer so FAB doesn't overlap last item */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Floating Cart Button */}
      {items.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.colors.brand }]}
          onPress={() => navigation.navigate('Cart')}
          activeOpacity={0.85}
        >
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{totalCartItems}</Text>
          </View>
          <Text style={styles.fabText}>View Cart</Text>
        </TouchableOpacity>
      )}
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
  fab: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    right: 24,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  fabBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 6,
  },
  fabBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

