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
import { useRestaurantContext } from '../context/RestaurantContext';
import { useCartContext } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import { useNavbarCollapse } from '../context/NavbarCollapseContext';
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

function MenuRow({ icon, label, onPress, destructive = false, disabled = false }) {
  const [hovered, setHovered] = useState(false);
  const color = destructive ? '#c0392b' : '#1a1a1a';
  const webHover =
    Platform.OS === 'web' && !disabled
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="menuitem"
      {...webHover}
      style={[
        styles.menuRow,
        hovered && (destructive ? styles.menuRowHoverDestructive : styles.menuRowHover),
        Platform.OS === 'web' && { cursor: disabled ? 'default' : 'pointer' },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
      ) : null}
      <Text style={[styles.menuRowText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CustomerNavbar({ navigation, currentRoute, onOpenCart }) {
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
  const { collapsed } = useNavbarCollapse();
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
  const collapseHeight = useRef(new Animated.Value(60)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [collapseAnimating, setCollapseAnimating] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((enabled) => {
      if (mounted) setReduceMotion(!!enabled);
    });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => setReduceMotion(!!enabled),
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    if (!isMobile) {
      collapseHeight.stopAnimation();
      collapseHeight.setValue(60);
      setCollapseAnimating(false);
      return undefined;
    }
    if (collapsed) closeMobileMenu();
    const target = collapsed ? 0 : 60;
    if (reduceMotion) {
      collapseHeight.stopAnimation();
      collapseHeight.setValue(target);
      setCollapseAnimating(false);
      return undefined;
    }
    setCollapseAnimating(true);
    Animated.timing(collapseHeight, {
      toValue: target,
      duration: 200,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !cancelled) setCollapseAnimating(false);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, isMobile, collapseHeight, reduceMotion]);

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
              <MenuRow
                key={item.route}
                icon={item.icon}
                label={item.label}
                onPress={() => handleNavPress(item.route)}
              />
            ))}
            <View style={styles.dropdownDivider} />
            <MenuRow
              icon="log-out-outline"
              label={signingOut ? 'Signing out…' : 'Log out'}
              onPress={handleLogOut}
              disabled={signingOut}
              destructive
            />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  ) : null;

  return (
    <>
      <Animated.View
        style={[
          styles.navbarShell,
          isMobile && {
            height: collapseHeight,
            minHeight: 0,
            overflow: collapsed || collapseAnimating ? 'hidden' : 'visible',
          },
        ]}
        pointerEvents={isMobile && collapsed ? 'none' : 'auto'}
      >
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
                  {(restaurant?.name || theme.restaurant?.name)?.charAt(0).toUpperCase() || 'R'}
                </Text>
              </View>
            )}
            <Text style={styles.restaurantName} numberOfLines={1}>
              {restaurant?.name || theme.restaurant?.name || 'Restaurant'}
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
              {
                opacity: menuOpacity,
                transform: [{ translateY: menuTranslateY }],
              },
            ]}
          >
            <View style={styles.mobileAccountRow}>
              <TouchableOpacity
                style={[styles.pointsPill, styles.pointsPillOnLight, isSignedIn && styles.pointsPillActiveOnLight]}
                onPress={handleAccountToggle}
                activeOpacity={0.75}
                accessibilityLabel={isSignedIn ? `${points} points, open account menu` : 'Sign in'}
              >
                <Ionicons
                  name={isSignedIn ? 'gift' : 'person-outline'}
                  size={16}
                  color={theme.colors.brand}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.pointsPillText, { color: theme.colors.brand }]}>
                  {isSignedIn ? `${points} pts` : 'Sign in'}
                </Text>
              </TouchableOpacity>
            </View>
            {isSignedIn
              ? ACCOUNT_MENU.map((item) => (
                  <MenuRow
                    key={item.route}
                    icon={item.icon}
                    label={item.label}
                    onPress={() => handleNavPress(item.route)}
                  />
                ))
              : null}
            {isSignedIn ? (
              <>
                <View style={styles.dropdownDivider} />
                <MenuRow
                  icon="log-out-outline"
                  label={signingOut ? 'Signing out…' : 'Log out'}
                  onPress={handleLogOut}
                  disabled={signingOut}
                  destructive
                />
              </>
            ) : null}
            <View style={styles.dropdownDivider} />
            {NAV_LINKS.map((link) => (
              <MenuRow
                key={link.route}
                label={link.label}
                onPress={() => handleNavPress(link.route)}
              />
            ))}
          </Animated.View>
        )}
      </Animated.View>

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
    minHeight: 0,
    ...Platform.select({
      web: { position: 'relative', flexShrink: 0 },
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
  pointsPillOnLight: {
    borderColor: 'rgba(0,0,0,0.12)',
  },
  pointsPillActiveOnLight: {
    borderColor: 'rgba(0,0,0,0.18)',
    backgroundColor: 'rgba(0,0,0,0.04)',
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
    minWidth: 220,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 12,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(18px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.14)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  menuRowHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  menuRowHoverDestructive: {
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 4,
    marginHorizontal: 6,
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
    left: 8,
    right: 8,
    top: 64,
    zIndex: 99,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 14,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(18px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.14)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  mobileAccountRow: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
});
