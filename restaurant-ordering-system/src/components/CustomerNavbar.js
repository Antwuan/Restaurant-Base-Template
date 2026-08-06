import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useCartContext } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import CustomerSignInModal from './CustomerSignInModal';
import { AnimatedBadge } from './motion';

const NAV_LINKS = [
  { label: 'Menu', route: 'Menu' },
  { label: 'Catering', route: 'Catering' },
  { label: 'Rewards', route: 'Rewards' },
  { label: 'Careers', route: 'Hiring' },
  { label: 'Order Tracker', route: 'OrderTracker' },
];

const MOBILE_BREAKPOINT = 768;

/** Desktop nav link with soft pill highlight on hover/active. */
function NavLink({ label, isActive, onPress }) {
  const pillOpacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const textOpacity = useRef(new Animated.Value(isActive ? 1 : 0.82)).current;

  const animateTo = (pillTo, opacityTo) => {
    Animated.parallel([
      Animated.timing(pillOpacity, {
        toValue: pillTo,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: opacityTo,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    animateTo(isActive ? 1 : 0, isActive ? 1 : 0.82);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const webHover =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () => !isActive && animateTo(0.65, 1),
          onMouseLeave: () => !isActive && animateTo(0, 0.82),
        }
      : {};

  return (
    <TouchableOpacity
      style={styles.navLinkBtn}
      onPress={onPress}
      activeOpacity={0.7}
      {...webHover}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.navLinkPill,
          {
            opacity: pillOpacity,
            backgroundColor: isActive
              ? 'rgba(255,255,255,0.22)'
              : 'rgba(255,255,255,0.14)',
          },
        ]}
      />
      <Animated.Text style={[styles.navLinkText, { opacity: textOpacity }]}>
        {label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

export default function CustomerNavbar({ navigation, currentRoute, onOpenCart }) {
  const { restaurant } = useRestaurantContext();
  const { itemCount } = useCartContext();
  const { user, customerProfile, linkCustomer, isCustomerAuthenticated } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [signInVisible, setSignInVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Keep menu mounted through the close animation, then unmount so it
  // doesn't reserve layout space while invisible.
  const [menuMounted, setMenuMounted] = useState(false);

  // After email confirm / session restore: ensure restaurant_customers row exists
  useEffect(() => {
    if (!isCustomerAuthenticated || !user?.id || !restaurant?.id || customerProfile) return;
    linkCustomer(restaurant.id, user.email, user).catch(() => {});
  }, [isCustomerAuthenticated, user?.id, user?.email, restaurant?.id, customerProfile, linkCustomer]);

  // Mobile menu slide + fade animation
  const menuAnim = useRef(new Animated.Value(0)).current;

  const animateMenu = (open) => {
    setMobileMenuOpen(open);
    if (open) setMenuMounted(true);
    Animated.spring(menuAnim, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      tension: 220,
      friction: 22,
    }).start(({ finished }) => {
      if (finished && !open) setMenuMounted(false);
    });
  };

  const toggleMobileMenu = () => animateMenu(!mobileMenuOpen);
  const closeMobileMenu = () => animateMenu(false);

  const isMobile = width < MOBILE_BREAKPOINT;

  // Drop mounted menu if viewport leaves mobile
  useEffect(() => {
    if (!isMobile && (mobileMenuOpen || menuMounted)) {
      menuAnim.setValue(0);
      setMobileMenuOpen(false);
      setMenuMounted(false);
    }
  }, [isMobile, mobileMenuOpen, menuMounted, menuAnim]);
  const isSignedIn = isCustomerAuthenticated;
  const accountLabel = isSignedIn ? 'Profile' : 'Sign in';
  const accountIcon = isSignedIn ? 'person-circle' : 'person-outline';

  const handleNavPress = (route) => {
    closeMobileMenu();
    if (!navigation) return;
    if (route === 'Menu') navigation.navigate('Menu');
    else if (route === 'Home') navigation.navigate('Home');
    else if (route === 'OrderTracker') navigation.navigate('OrderTracker');
    else if (route === 'Catering') navigation.navigate('Catering');
    else if (route === 'Rewards') navigation.navigate('Rewards');
    else if (route === 'Hiring') navigation.navigate('Hiring');
  };

  const handleLogoPress = () => {
    if (navigation) navigation.navigate('Home');
  };

  const menuOpacity = menuAnim;
  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  return (
    <>
      <View style={styles.navbarShell}>
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
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.route}
                  label={link.label}
                  isActive={currentRoute === link.route}
                  onPress={() => handleNavPress(link.route)}
                />
              ))}
            </View>
          )}

          {/* Right actions */}
          <View style={styles.rightActions}>
            {!isMobile && (
              <TouchableOpacity
                style={[styles.signInBtn, isSignedIn && styles.profileBtn]}
                onPress={() => setSignInVisible(true)}
                activeOpacity={0.7}
                accessibilityLabel={isSignedIn ? 'Open profile' : 'Sign in'}
              >
                <Ionicons name={accountIcon} size={isSignedIn ? 18 : 16} color="#fff" style={{ marginRight: 4 }} />
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
                <AnimatedBadge value={itemCount > 0 ? itemCount : 0} />
              </TouchableOpacity>
            )}

            {isMobile && (
              <TouchableOpacity
                style={styles.hamburger}
                onPress={toggleMobileMenu}
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

        {/* Mobile dropdown — overlays content; unmounted when fully closed */}
        {isMobile && menuMounted && (
          <Animated.View
            pointerEvents={mobileMenuOpen ? 'auto' : 'none'}
            style={[
              styles.mobileMenu,
              { backgroundColor: theme.colors.brand },
              {
                opacity: menuOpacity,
                transform: [{ translateY: menuTranslateY }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.mobileNavItem}
              onPress={() => { setSignInVisible(true); closeMobileMenu(); }}
              activeOpacity={0.7}
              accessibilityLabel={isSignedIn ? 'Open profile' : 'Sign in'}
            >
              <Ionicons name={accountIcon} size={18} color="#fff" style={{ marginRight: 10 }} />
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
          </Animated.View>
        )}
      </View>

      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  navbarShell: {
    zIndex: 100,
    ...Platform.select({
      web: { position: 'sticky', top: 0 },
    }),
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    zIndex: 100,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' },
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
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  navLinkPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  navLinkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    zIndex: 1,
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
  profileBtn: {
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.14)',
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
  hamburger: {
    padding: 6,
    marginLeft: 4,
  },
  mobileMenu: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 60,
    zIndex: 99,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
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
