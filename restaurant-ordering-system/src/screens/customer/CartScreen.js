/**
 * CartScreen
 * - Lists cart items in a FlatList with inline quantity controls and remove actions.
 * - Shows an OrderSummary footer and an empty state with a "Browse Menu" CTA.
 * - Provides a sticky bottom bar with "Add More" and "Proceed to Checkout" buttons.
 *
 * Depends on:
 * - hooks: useCart
 * - theme: useTheme from ../../theme
 * - components: CartItem, OrderSummary
 */
import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useCart } from '../../hooks/useCart';
import { useTheme } from '../../theme';
import CartItem from '../../components/CartItem';
import OrderSummary from '../../components/OrderSummary';

export default function CartScreen({ navigation }) {
  const { theme, restaurant } = useTheme();
  const {
    items,
    removeItem,
    updateQuantity,
    clearCart,
    subtotal,
    tax,
    total,
  } = useCart(restaurant?.id);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Add some items from the menu to get started.
        </Text>
        <TouchableOpacity
          style={[styles.continueBtn, { borderColor: theme.colors.brand }]}
          onPress={() => navigation.navigate('Menu')}
        >
          <Text
            style={[
              styles.continueBtnText,
              { color: theme.colors.brand },
            ]}
          >
            Browse Menu
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <CartItem
            item={item}
            onIncrease={() =>
              updateQuantity(
                item.id,
                item.quantity + 1,
                item.specialInstructions,
              )
            }
            onDecrease={() =>
              updateQuantity(
                item.id,
                item.quantity - 1,
                item.specialInstructions,
              )
            }
            onRemove={() => removeItem(item.id, item.specialInstructions)}
          />
        )}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Your Order</Text>
            <TouchableOpacity onPress={clearCart}>
              <Text style={styles.clearText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={(
          <OrderSummary
            subtotal={subtotal}
            tax={tax}
            total={total}
            orderType="pickup"
          />
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Bottom actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.continueSmall}
          onPress={() => navigation.navigate('Menu')}
        >
          <Text
            style={[
              styles.continueSmallText,
              { color: theme.colors.brand },
            ]}
          >
            + Add More
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.checkoutBtn,
            { backgroundColor: theme.colors.brand },
          ]}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginBottom: 28,
  },
  continueBtn: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  clearText: {
    fontSize: 14,
    color: '#cc2222',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 10,
  },
  continueSmall: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  continueSmallText: {
    fontSize: 15,
    fontWeight: '600',
  },
  checkoutBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

