import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useCartContext } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import CustomerSignInModal from './CustomerSignInModal';

const NAV_LINKS = [
  { label: 'Menu', route: 'Menu' },
  { label: 'Catering', route: 'Catering' },
  { label: 'Rewards', route: 'Rewards' },
  { label: 'Order Tracker', route: 'OrderTracker' },
];

const MOBILE_BREAKPOINT = 768;

export default function CustomerNavbar({ navigation, currentRoute, onOpenCart }) {
  const { restaurant } = useRestaurantContext();
  const { itemCount } = useCartContext();
  const { user, customerProfile } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [signInVisible, setSignInVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMobile = width < MOBILE_BREAKPOINT;
  const accountLabel = user && customerProfile ? 'Account' : 'Sign in';

  const handleNavPress = (route) => {
    setMobileMenuOpen(false);
    if (!navigation) return;
    if (route === 'Menu') navigation.navigate('Menu');
    else if (route === 'Home') navigation.navigate('Home');
    // Catering, Rewards, OrderTracker are placeholder future screens
  };

  const handleLogoPress = () => {
    if (navigation) navigation.navigate('Home');
  };

  return (
    <>
      <View style={[styles.navbar, { backgroundColor: theme.colors.brand }]}>
        {/* Logo + Restaurant name */}
        <TouchableOpacity
          style={styles.logoBlock}
          onPress={handleLogoPress}
          activeOpacity={0.8}
        >
          {restaurant?.logo_url ? (
            <Image
              source={{ uri: restaurant.logo_url }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoInitial}>
                {restaurant?.name?.charAt(0).toUpperCase() || 'R'}
              </Text>
            </View>
          )}
          <Text style={styles.restaurantName} numberOfLines={1}>
            {restaurant?.name || 'Restaurant'}
          </Text>
        </TouchableOpacity>

        {/* Desktop nav links */}
        {!isMobile && (
          <View style={styles.navLinks}>
            {NAV_LINKS.map((link) => {
              const isActive = currentRoute === link.route;
              return (
                <TouchableOpacity
                  key={link.route}
                  style={styles.navLinkBtn}
                  onPress={() => handleNavPress(link.route)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.navLinkText, isActive && styles.navLinkActive]}>
                    {link.label}
                  </Text>
                  {isActive && <View style={styles.navLinkUnderline} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Right actions */}
        <View style={styles.rightActions}>
          {!isMobile && (
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => setSignInVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.signInText}>{accountLabel}</Text>
            </TouchableOpacity>
          )}

          {onOpenCart && (
            <TouchableOpacity
              style={styles.cartBtn}
              onPress={onOpenCart}
              accessibilityLabel="Open cart"
              activeOpacity={0.7}
            >
              <Ionicons name="cart-outline" size={24} color="#fff" />
              {itemCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {itemCount > 99 ? '99+' : itemCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {isMobile && (
            <TouchableOpacity
              style={styles.hamburger}
              onPress={() => setMobileMenuOpen((v) => !v)}
              accessibilityLabel="Toggle navigation menu"
              activeOpacity={0.7}
            >
              <Ionicons
                name={mobileMenuOpen ? 'close' : 'menu'}
                size={26}
                color="#fff"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Mobile dropdown */}
      {isMobile && mobileMenuOpen && (
        <View style={[styles.mobileMenu, { backgroundColor: theme.colors.brand }]}>
          <TouchableOpacity
            style={styles.mobileNavItem}
            onPress={() => setSignInVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={18} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.mobileNavText}>{accountLabel}</Text>
          </TouchableOpacity>
          {NAV_LINKS.map((link) => (
            <TouchableOpacity
              key={link.route}
              style={styles.mobileNavItem}
              onPress={() => handleNavPress(link.route)}
              activeOpacity={0.7}
            >
              <Text style={styles.mobileNavText}>{link.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    zIndex: 100,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.18)', position: 'sticky', top: 0 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  logoBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    paddingRight: 8,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  logoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  restaurantName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flexShrink: 1,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navLinkBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    position: 'relative',
  },
  navLinkText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
  },
  navLinkActive: {
    color: '#fff',
  },
  navLinkUnderline: {
    position: 'absolute',
    bottom: 2,
    left: 14,
    right: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    marginRight: 4,
  },
  signInText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  cartBtn: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  hamburger: {
    padding: 6,
    marginLeft: 4,
  },
  mobileMenu: {
    zIndex: 99,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        position: 'sticky',
        top: 60,
      },
    }),
  },
  mobileNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  mobileNavText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
