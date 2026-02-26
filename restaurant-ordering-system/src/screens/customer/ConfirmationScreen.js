/**
 * ConfirmationScreen
 * - Shows an animated success check circle, prominent order number,
 *   itemized order details with totals, estimated ready time, and
 *   restaurant contact info.
 * - Includes an "Order Again" action that resets navigation back to Menu.
 *
 * Depends on:
 * - context: RestaurantContext
 * - theme: useTheme from ../../theme
 * - navigation: expects an `order` param from CheckoutScreen.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';

export default function ConfirmationScreen({ route, navigation }) {
  const { order } = route.params || {};
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();

  const checkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 5,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkScale, contentOpacity]);

  const handleOrderAgain = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Menu' }] });
  };

  const subtotal = order?.subtotal ?? 0;
  const tax = order?.tax ?? 0;
  const total = order?.total ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Success Icon */}
      <Animated.View
        style={[
          styles.checkCircle,
          { backgroundColor: theme.colors.brand },
          { transform: [{ scale: checkScale }] },
        ]}
      >
        <Text style={styles.checkMark}>✓</Text>
      </Animated.View>

      <Animated.View
        style={{ opacity: contentOpacity, alignItems: 'center', width: '100%' }}
      >
        <Text style={styles.successTitle}>Order Placed!</Text>
        <Text style={styles.successSubtitle}>
          We&apos;ve received your order and will start preparing it shortly.
        </Text>

        {/* Order Number */}
        <View
          style={[
            styles.orderNumberCard,
            { borderColor: theme.colors.brand },
          ]}
        >
          <Text style={styles.orderNumberLabel}>Order Number</Text>
          <Text
            style={[styles.orderNumber, { color: theme.colors.brand }]}
          >
            {order?.order_number ?? '—'}
          </Text>
        </View>

        {/* Order Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Order Details</Text>

          {(order?.items ?? []).map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <Text style={styles.lineItemName}>
                {item.quantity}× {item.name}
              </Text>
              <Text style={styles.lineItemPrice}>
                ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.lineItem}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>
              ${subtotal.toFixed(2)}
            </Text>
          </View>
          <View style={styles.lineItem}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>
              ${tax.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.lineItem, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text
              style={[
                styles.totalValue,
                { color: theme.colors.brand },
              ]}
            >
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Estimated Time */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>⏱</Text>
          <View>
            <Text style={styles.infoTitle}>Estimated Time</Text>
            <Text style={styles.infoBody}>
              {order?.scheduled_time
                ? `Ready at ${order.scheduled_time}`
                : order?.order_type === 'delivery'
                  ? '30–45 minutes'
                  : '15–20 minutes'}
            </Text>
          </View>
        </View>

        {/* Restaurant Contact */}
        {restaurant && (
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>{restaurant.name}</Text>
              {restaurant.address && (
                <Text style={styles.infoBody}>{restaurant.address}</Text>
              )}
              {restaurant.phone && (
                <Text
                  style={[
                    styles.infoBody,
                    { color: theme.colors.brand },
                  ]}
                >
                  {restaurant.phone}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: theme.colors.brand },
          ]}
          onPress={handleOrderAgain}
        >
          <Text style={styles.primaryBtnText}>Order Again</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Keep your order number handy. You&apos;ll be notified when your order
          is ready.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 40,
    paddingBottom: 60,
    backgroundColor: '#fff',
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  checkMark: {
    fontSize: 40,
    color: '#fff',
    lineHeight: 48,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  orderNumberCard: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  orderNumberLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  orderNumber: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2,
  },
  detailsCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 12,
  },
  detailsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  lineItemName: {
    fontSize: 14,
    color: '#444',
    flex: 1,
  },
  lineItemPrice: {
    fontSize: 14,
    color: '#444',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#666',
  },
  totalRow: {
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 12,
    gap: 12,
  },
  infoIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },
  infoBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  footerNote: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 19,
  },
});

