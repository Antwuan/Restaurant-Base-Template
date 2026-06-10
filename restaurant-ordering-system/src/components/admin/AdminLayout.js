import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Alert,
  Platform,
  TouchableOpacity,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminSidebar, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './AdminSidebar';
import { useTheme } from '../../theme';
import { useAuth } from '../../context/AuthContext';

import OrdersScreen from '../../screens/admin/OrdersScreen';
import MenuEditorScreen from '../../screens/admin/MenuEditorScreen';
import CarouselEditorScreen from '../../screens/admin/CarouselEditorScreen';
import SettingsScreen from '../../screens/admin/SettingsScreen';

const SCREENS = {
  Orders:   OrdersScreen,
  Menu:     MenuEditorScreen,
  Promo:    CarouselEditorScreen,
  Settings: SettingsScreen,
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

  const handleNavigate = useCallback((key) => {
    if (key === 'SignOut') {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ]);
      return;
    }
    setActiveSection(key);
    setMobileMenuOpen(false);
  }, [signOut]);

  const ActiveScreen = SCREENS[activeSection] ?? OrdersScreen;

  const sectionTitle = activeSection === 'Promo' ? 'Promo Carousel' : activeSection;

  return (
    <View style={styles.shell}>
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
        <View style={[styles.topBar, { borderBottomColor: theme.colors.border }]}>
          {isMobile && (
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setMobileMenuOpen((v) => !v)}
            >
              <Ionicons name="menu" size={24} color="#374151" />
            </TouchableOpacity>
          )}
          <Text style={styles.topBarTitle}>{sectionTitle}</Text>
        </View>

        {/* Screen content */}
        <View style={styles.content}>
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
    backgroundColor: '#f3f4f6',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  sidebarWrapper: {
    flexShrink: 0,
    zIndex: 20,
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
});
