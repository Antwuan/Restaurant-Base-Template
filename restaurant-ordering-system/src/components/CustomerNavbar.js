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
  Pressable,
  Modal,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRestaurantContext } from '../context/RestaurantContext';
import { useCartContext } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import CustomerSignInModal from './CustomerSignInModal';
import { AnimatedBadge } from './motion';

const NAV_LINKS = [
  { label: 'Menu', route: 'Menu' },
  { label: 'Catering', route: 'Catering' },
  { label: 'Careers', route: 'Hiring' },
];

const ACCOUNT_MENU = [
  { label: 'Profile', route: 'Profile', icon: 'person-outline' },
  { label: 'Rewards', route: 'Rewards', icon: 'gift-outline' },
  { label: 'Orders', route: 'OrderTracker', icon: 'receipt-outline' },
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
  // native-stack on web can keep prior routes mounted; hide chrome when unfocused
  // so sticky/relative bars don't stack (duplicate nav).
  const isFocused = useIsFocused();
  const { restaurant } = useRestaurantContext();
  const { itemCount } = useCartContext();
  const {
    user,
    customerProfile,
    linkCustomer,
    isCustomerAuthenticated,
    signOut,
    refreshCustomerProfile,
  } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [signInVisible, setSignInVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const cartPulse = useRef(new Animated.Value(1)).current;
  const prevItemCount = useRef(itemCount);

  useEffect(() => {
    if (!isCustomerAuthenticated || !user?.id || !restaurant?.id || customerProfile) return;
    linkCustomer(restaurant.id, user.email, user).catch(() => {});
  }, [isCustomerAuthenticated, user?.id, user?.email, restaurant?.id, customerProfile, linkCustomer]);

  useEffect(() => {
    if (isCustomerAuthenticated && restaurant?.id) {
      refreshCustomerProfile(restaurant.id);
    }
  }, [isCustomerAuthenticated, restaurant?.id, refreshCustomerProfile]);

  // Cart add acknowledgment: pulse icon when count rises
  useEffect(() => {
    const prev = prevItemCount.current;
    prevItemCount.current = itemCount;
    if (!(itemCount > prev)) return;

    let cancelled = false;
    (async () => {
      let reduceMotion = false;
      try {
        reduceMotion = !!(await AccessibilityInfo.isReduceMotionEnabled?.());
      } catch {
        reduceMotion = false;
      }
      if (cancelled || reduceMotion) return;

      cartPulse.setValue(1);
      Animated.sequence([
        Animated.timing(cartPulse, {
          toValue: 1.18,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.timing(cartPulse, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    })();

    return () => {
      cancelled = true;
    };
  }, [itemCount, cartPulse]);

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

  useEffect(() => {
    if (!isMobile && (mobileMenuOpen || menuMounted)) {
      menuAnim.setValue(0);
      setMobileMenuOpen(false);
      setMenuMounted(false);
    }
  }, [isMobile, mobileMenuOpen, menuMounted, menuAnim]);

  const isSignedIn = isCustomerAuthenticated;
  const points = customerProfile?.points_balance ?? 0;

  const handleNavPress = (route) => {
    closeMobileMenu();
    setAccountMenuOpen(false);
    if (!navigation) return;
    if (route === 'Menu') navigation.navigate('Menu');
    else if (route === 'Home') navigation.navigate('Home');
    else if (route === 'OrderTracker') navigation.navigate('OrderTracker');
    else if (route === 'Catering') navigation.navigate('Catering');
    else if (route === 'Rewards') navigation.navigate('Rewards');
    else if (route === 'Hiring') navigation.navigate('Hiring');
    else if (route === 'Profile') navigation.navigate('Profile');
  };

  const handleSignInPress = () => {
    closeMobileMenu();
    setAccountMenuOpen(false);
    setSignInVisible(true);
  };

  const handleAccountToggle = () => {
    if (!isSignedIn) {
      handleSignInPress();
      return;
    }
    // Mobile menu already lists account links — only open desktop dropdown.
    if (isMobile) return;
    setAccountMenuOpen((open) => !open);
  };

  const handleLogOut = async () => {
    setSigningOut(true);
    try {
      setAccountMenuOpen(false);
      closeMobileMenu();
      await signOut();
      if (navigation) navigation.navigate('Home');
    } catch {
      // ignore — session may already be gone
    } finally {
      setSigningOut(false);
    }
  };

  const handleLogoPress = () => {
    if (navigation) navigation.navigate('Home');
  };

  const menuOpacity = menuAnim;
  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  if (!isFocused) return null;

  const pointsPill = (
    <TouchableOpacity
      style={[styles.pointsPill, isSignedIn && styles.pointsPillActive]}
      onPress={handleAccountToggle}
      activeOpacity={0.75}
      accessibilityLabel={isSignedIn ? `${points} points, open account menu` : 'Sign in'}
    >
      <Ionicons
        name={isSignedIn ? 'gift' : 'person-outline'}
        size={16}
        color="#fff"
        style={{ marginRight: 5 }}
      />
      <Text style={styles.pointsPillText}>
        {isSignedIn ? `${points} pts` : 'Sign in'}
      </Text>
      {isSignedIn ? (
        <Ionicons
          name={accountMenuOpen ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#fff"
          style={{ marginLeft: 4 }}
        />
      ) : null}
    </TouchableOpacity>
  );

  const accountDropdown = accountMenuOpen && isSignedIn ? (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => setAccountMenuOpen(false)}
    >
      <Pressable style={styles.dropdownBackdrop} onPress={() => setAccountMenuOpen(false)}>
        <View style={styles.dropdownAnchor}>
          <Pressable style={styles.dropdown} onPress={(e) => e.stopPropagation?.()}>
            {ACCOUNT_MENU.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={styles.dropdownItem}
                onPress={() => handleNavPress(item.route)}
                activeOpacity={0.7}
              >
                <Ionicons name={item.icon} size={18} color="#333" style={{ marginRight: 10 }} />
                <Text style={styles.dropdownItemText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.dropdownDivider} />
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleLogOut}
              disabled={signingOut}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={18} color="#c0392b" style={{ marginRight: 10 }} />
              <Text style={[styles.dropdownItemText, { color: '#c0392b' }]}>
                {signingOut ? 'Signing out…' : 'Log out'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  ) : null;

  return (
    <>
      <View style={styles.navbarShell}>
        <View style={[styles.navbar, { backgroundColor: theme.colors.brand }]}>
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

          <View style={styles.rightActions}>
            {!isMobile && pointsPill}

            {onOpenCart && (
              <TouchableOpacity
                style={styles.cartBtn}
                onPress={onOpenCart}
                accessibilityLabel={`Open cart${itemCount > 0 ? `, ${itemCount} items` : ''}`}
                activeOpacity={0.7}
              >
                <Animated.View style={{ transform: [{ scale: cartPulse }] }}>
                  <Ionicons name="cart-outline" size={24} color="#fff" />
                </Animated.View>
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
            <View style={styles.mobileAccountRow}>
              {pointsPill}
            </View>
            {isSignedIn
              ? ACCOUNT_MENU.map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    style={styles.mobileNavItem}
                    onPress={() => handleNavPress(item.route)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={item.icon} size={18} color="#fff" style={{ marginRight: 10 }} />
                    <Text style={styles.mobileNavText}>{item.label}</Text>
                  </TouchableOpacity>
                ))
              : null}
            {isSignedIn ? (
              <TouchableOpacity
                style={styles.mobileNavItem}
                onPress={handleLogOut}
                disabled={signingOut}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={18} color="#fff" style={{ marginRight: 10 }} />
                <Text style={styles.mobileNavText}>
                  {signingOut ? 'Signing out…' : 'Log out'}
                </Text>
              </TouchableOpacity>
            ) : null}
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

      {!isMobile ? accountDropdown : null}

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
      // sticky can leak a second bar when native-stack keeps another screen mounted on web
      web: { position: 'relative', top: 0 },
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
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    marginRight: 4,
  },
  pointsPillActive: {
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pointsPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownAnchor: {
    position: 'absolute',
    top: 56,
    right: 56,
    ...Platform.select({
      web: { right: 72 },
    }),
  },
  dropdown: {
    minWidth: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    ...Platform.select({
      web: { boxShadow: '0 8px 28px rgba(0,0,0,0.18)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5e5',
    marginVertical: 4,
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
  mobileAccountRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
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
