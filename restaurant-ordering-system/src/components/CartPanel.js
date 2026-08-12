import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCartContext } from '../context/CartContext';
import { usePickupLocation } from '../context/PickupLocationContext';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useTheme } from '../theme';
import CartItem, { MAX_QTY } from './CartItem';
import OrderSummary from './OrderSummary';
import PickupLocationPicker from './PickupLocationPicker';

const UNDO_MS = 5000;

function confirmClearCart(onConfirm) {
  const title = 'Clear cart?';
  const message = "Remove all items from your order? This can't be undone.";
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear all', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function CartPanel({ onClose, onCheckout }) {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const {
    locations,
    selectedLocationId,
    selectedLocation,
    setPickupLocation,
    hasSelection,
    needsChoice,
    loading: locationsLoading,
  } = usePickupLocation();
  const {
    items,
    removeItem,
    updateQuantity,
    clearCart,
    addItem,
    subtotal,
    tax,
    total,
  } = useCartContext();

  const [undoBanner, setUndoBanner] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const undoTimer = useRef(null);

  const multiLocation = locations.length >= 2;
  const checkoutBlocked =
    (multiLocation && (locationsLoading || !hasSelection || needsChoice))
    || items.length === 0;

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const showUndo = (line) => {
    clearTimeout(undoTimer.current);
    setUndoBanner({
      name: line.name || 'Item',
      snapshot: { ...line },
    });
    AccessibilityInfo.announceForAccessibility?.(
      `${line.name || 'Item'} removed from cart. Undo available.`,
    );
    undoTimer.current = setTimeout(() => setUndoBanner(null), UNDO_MS);
  };

  const handleUndo = () => {
    if (!undoBanner?.snapshot) return;
    const s = undoBanner.snapshot;
    addItem(
      { id: s.id, name: s.name, price: s.price, image_url: s.image_url || null },
      s.quantity,
      s.specialInstructions || '',
      s.menuType || 'regular',
      s.selectedModifiers || [],
      s.price,
    );
    clearTimeout(undoTimer.current);
    setUndoBanner(null);
    AccessibilityInfo.announceForAccessibility?.(
      `${s.name || 'Item'} restored to cart`,
    );
  };

  const handleRemove = (item) => {
    removeItem(item.id, item.specialInstructions, 'regular', item.selectedModifiers);
    showUndo(item);
  };

  const handleDecrease = (item) => {
    if (item.quantity <= 1) {
      handleRemove(item);
      return;
    }
    updateQuantity(
      item.id,
      item.quantity - 1,
      item.specialInstructions,
      'regular',
      item.selectedModifiers,
    );
  };

  const handleIncrease = (item) => {
    if ((item.quantity || 0) >= MAX_QTY) {
      AccessibilityInfo.announceForAccessibility?.(
        `Maximum quantity is ${MAX_QTY}`,
      );
      return;
    }
    updateQuantity(
      item.id,
      item.quantity + 1,
      item.specialInstructions,
      'regular',
      item.selectedModifiers,
    );
  };

  const handleClearAll = () => {
    confirmClearCart(() => {
      clearTimeout(undoTimer.current);
      setUndoBanner(null);
      clearCart();
      AccessibilityInfo.announceForAccessibility?.('Cart cleared');
    });
  };

  const handleCheckoutPress = () => {
    if (checkoutBlocked || checkingOut) return;
    setCheckingOut(true);
    try {
      onCheckout?.();
    } finally {
      setTimeout(() => setCheckingOut(false), 900);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={56} color="#cbd5e1" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Add some items from the menu to get started.
        </Text>
        <TouchableOpacity
          style={[styles.continueBtn, { borderColor: theme.colors.brand }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Browse menu"
        >
          <Text style={[styles.continueBtnText, { color: theme.colors.brand }]}>
            Browse Menu
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const itemCount = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Your order ({itemCount})
        </Text>
        <TouchableOpacity
          onPress={handleClearAll}
          accessibilityRole="button"
          accessibilityLabel="Clear all items from cart"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.clearText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      {!locationsLoading && (multiLocation || selectedLocation) ? (
        <View style={styles.locationBlock}>
          <PickupLocationPicker
            locations={locations}
            selectedLocationId={selectedLocationId}
            onSelect={(id) => setPickupLocation(id)}
            restaurant={restaurant}
            brandColor={theme.colors.brand}
            label=""
            compact
          />
          {checkoutBlocked && multiLocation && !hasSelection ? (
            <Text style={styles.locationHint} accessibilityLiveRegion="polite">
              Choose a pickup location before checkout.
            </Text>
          ) : null}
        </View>
      ) : null}

      {locationsLoading && multiLocation ? (
        <Text style={styles.locationLoading} accessibilityLiveRegion="polite">
          Checking pickup locations…
        </Text>
      ) : null}

      {undoBanner ? (
        <View
          style={styles.undoBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.undoText} numberOfLines={1}>
            Removed {undoBanner.name}
          </Text>
          <TouchableOpacity
            onPress={handleUndo}
            accessibilityRole="button"
            accessibilityLabel={`Undo remove ${undoBanner.name}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.undoAction, { color: theme.colors.brand }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) =>
          `${item.id}-${item.specialInstructions}-${(item.selectedModifiers || []).map((m) => m.optionId).sort().join(',')}`
        }
        renderItem={({ item }) => (
          <CartItem
            item={item}
            onIncrease={() => handleIncrease(item)}
            onDecrease={() => handleDecrease(item)}
            onRemove={() => handleRemove(item)}
          />
        )}
        ListFooterComponent={(
          <View style={styles.summaryWrap}>
            <OrderSummary
              subtotal={subtotal}
              tax={tax}
              total={total}
              orderType="pickup"
              taxLabel="Estimated tax"
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        style={styles.list}
      />

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.continueSmall}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Add more items"
        >
          <Text style={[styles.continueSmallText, { color: theme.colors.brand }]}>
            + Add More
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.checkoutBtn,
            {
              backgroundColor: checkoutBlocked || checkingOut
                ? (theme.colors.textDisabled || '#bbb')
                : theme.colors.brand,
            },
          ]}
          onPress={handleCheckoutPress}
          disabled={checkoutBlocked || checkingOut}
          accessibilityRole="button"
          accessibilityLabel={
            checkoutBlocked && multiLocation && !hasSelection
              ? 'Proceed to checkout unavailable until you choose a pickup location'
              : checkingOut
                ? 'Starting checkout'
                : 'Proceed to checkout'
          }
          accessibilityState={{ disabled: checkoutBlocked || checkingOut }}
        >
          <Text style={styles.checkoutBtnText}>
            {checkingOut ? 'Continuing…' : 'Proceed to Checkout'}
          </Text>
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
  list: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
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
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  clearText: {
    fontSize: 14,
    color: '#b91c1c',
    fontWeight: '600',
  },
  locationBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  locationHint: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#b91c1c',
  },
  locationLoading: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    fontSize: 12,
    color: '#666',
  },
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  undoText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  undoAction: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
  },
  bottomBar: {
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
    minHeight: 44,
    justifyContent: 'center',
  },
  continueSmallText: {
    fontSize: 15,
    fontWeight: '600',
  },
  checkoutBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
