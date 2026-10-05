import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminSidebar, { navItemsForRestaurant } from './AdminSidebar';
import { useTheme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { confirmAsync } from '../../utils/confirm';
import { isAppointmentBusiness } from '../../utils/businessType';

import OrdersScreen from '../../screens/admin/OrdersScreen';
import MenuEditorScreen from '../../screens/admin/MenuEditorScreen';
import HomePageEditorScreen from '../../screens/admin/HomePageEditorScreen';
import SettingsScreen from '../../screens/admin/SettingsScreen';
import AnalyticsScreen from '../../screens/admin/AnalyticsScreen';
import AdminRewardsScreen from '../../screens/admin/RewardsScreen';
import ApplicationsScreen from '../../screens/admin/ApplicationsScreen';
import ReviewsScreen from '../../screens/admin/ReviewsScreen';
import MarketingScreen from '../../screens/admin/MarketingScreen';
import AppointmentsScreen from '../../screens/admin/AppointmentsScreen';
import ServicesScreen from '../../screens/admin/ServicesScreen';

const SCREENS = {
  Appointments: AppointmentsScreen,
  Services:     ServicesScreen,
  Orders:       OrdersScreen,
  Analytics:    AnalyticsScreen,
  Menu:         MenuEditorScreen,
  HomePage:     HomePageEditorScreen,
  Rewards:      AdminRewardsScreen,
  Applications: ApplicationsScreen,
  Reviews:      ReviewsScreen,
  Marketing:    MarketingScreen,
  Settings:     SettingsScreen,
};

// Sidebar collapses to icon rail below this breakpoint
const COLLAPSE_BREAKPOINT = 768;
// Sidebar hides entirely (mobile overlay) below this
const MOBILE_BREAKPOINT = 540;
/** Block Sign Out re-entry after cancel (click-through under dismissing modal). */
const SIGN_OUT_CANCEL_GUARD_MS = 450;

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const { restaurant } = useRestaurantContext();

  const [activeSection, setActiveSection] = useState(() => (
    isAppointmentBusiness(restaurant) ? 'Appointments' : 'Orders'
  ));

  useEffect(() => {
    const allowed = navItemsForRestaurant(restaurant).map((item) => item.key);
    if (!allowed.includes(activeSection)) {
      setActiveSection(allowed[0] || 'Settings');
    }
  }, [restaurant?.business_type, activeSection, restaurant]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const signOutGuardUntilRef = useRef(0);
  const signOutInFlightRef = useRef(false);

  const isMobile   = width < MOBILE_BREAKPOINT;
  const isCollapsed = !isMobile && width < COLLAPSE_BREAKPOINT;

  // Close mobile overlay when screen grows
  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  const handleNavigate = useCallback(async (key) => {
    if (key === 'SignOut') {
      if (signOutInFlightRef.current || Date.now() < signOutGuardUntilRef.current) {
        return;
      }
      signOutInFlightRef.current = true;
      try {
        const confirmed = await confirmAsync({
          title: 'Sign Out',
          message: 'Are you sure you want to sign out?',
          confirmText: 'Sign Out',
          destructive: true,
        });
        if (!confirmed) {
          signOutGuardUntilRef.current = Date.now() + SIGN_OUT_CANCEL_GUARD_MS;
          return;
        }
        try {
          await signOut();
        } catch {
          // auth state change will handle UI; nothing to do on error
        }
      } finally {
        signOutInFlightRef.current = false;
      }
      return;
    }

    setActiveSection(key);
    setMobileMenuOpen(false);
  }, [signOut]);

  const ActiveScreen = SCREENS[activeSection] ?? SCREENS[navItemsForRestaurant(restaurant)[0]?.key] ?? OrdersScreen;

  const sectionTitle =
    activeSection === 'HomePage' ? 'Home Page' : activeSection;

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.background }]}>
      {/* ── Mobile sidebar overlay ── */}
      {isMobile && mobileMenuOpen && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      {(!isMobile || mobileMenuOpen) && (
        <View style={[
          styles.sidebarWrapper,
          isMobile && styles.sidebarMobile,
        ]}>
          <AdminSidebar
            activeSection={activeSection}
            onNavigate={handleNavigate}
            collapsed={isCollapsed}
          />
        </View>
      )}

      {/* ── Main content ── */}
      <View style={styles.main}>
        {/* Top bar */}
        <View style={[
          styles.topBar,
          {
            backgroundColor: theme.colors.backgroundCard,
            borderBottomColor: theme.colors.border,
          },
        ]}>
          {isMobile && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setMobileMenuOpen((v) => !v)}
            >
              <Ionicons name="menu" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={[styles.topBarTitle, { color: theme.colors.textPrimary }]}>
            {sectionTitle}
          </Text>
        </View>

        {/* Screen content */}
        <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
          <ActiveScreen />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  sidebarWrapper: {
    flexShrink: 0,
    zIndex: 20,
    alignSelf: 'stretch',
    ...Platform.select({
      web: { height: '100%' },
    }),
  },
  sidebarMobile: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 30,
    ...Platform.select({
      web: {
        boxShadow: '4px 0 16px rgba(0,0,0,0.15)',
      },
    }),
  },
  main: {
    flex: 1,
    flexDirection: 'column',
    minWidth: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
    minHeight: 52,
  },
  menuButton: {
    padding: 10,
    marginLeft: -6,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
