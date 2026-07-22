import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
  Text,
} from 'react-native';
import { confirmAsync } from '../../utils/confirm';
import { Ionicons } from '@expo/vector-icons';
import AdminSidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './AdminSidebar';
import { useTheme } from '../../theme';
import { useAuth } from '../../context/AuthContext';

import OrdersScreen from '../../screens/admin/OrdersScreen';
import MenuEditorScreen from '../../screens/admin/MenuEditorScreen';
import CarouselEditorScreen from '../../screens/admin/CarouselEditorScreen';
import SettingsScreen from '../../screens/admin/SettingsScreen';
import AnalyticsScreen from '../../screens/admin/AnalyticsScreen';
import AdminRewardsScreen from '../../screens/admin/RewardsScreen';
import ApplicationsScreen from '../../screens/admin/ApplicationsScreen';
import {
  ReviewsScreen,
  MarketingScreen,
} from '../../screens/admin/PlaceholderScreens';

const SCREENS = {
  Orders:       OrdersScreen,
  Analytics:    AnalyticsScreen,
  Menu:         MenuEditorScreen,
  Promo:        CarouselEditorScreen,
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

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { signOut } = useAuth();

  const [activeSection, setActiveSection] = useState('Orders');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMobile   = width < MOBILE_BREAKPOINT;
  const isCollapsed = !isMobile && width < COLLAPSE_BREAKPOINT;

  // Close mobile overlay when screen grows
  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  const handleNavigate = useCallback(async (key) => {
    if (key === 'SignOut') {
      const confirmed = await confirmAsync({
        title: 'Sign Out',
        message: 'Are you sure you want to sign out?',
        confirmText: 'Sign Out',
      });
      if (confirmed) {
        try {
          await signOut();
        } catch {
          // auth state change will handle UI; nothing to do on error
        }
      }
      return;
    }
    setActiveSection(key);
    setMobileMenuOpen(false);
  }, [signOut]);

  const ActiveScreen = SCREENS[activeSection] ?? OrdersScreen;

  const sectionTitle = activeSection === 'Promo' ? 'Promo Carousel' : activeSection;

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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
