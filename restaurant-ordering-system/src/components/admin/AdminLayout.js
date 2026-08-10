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
import AdminSidebar, { NAV_ITEMS } from './AdminSidebar';
import FocusModeUnlockModal from './FocusModeUnlockModal';
import { FocusModeProvider, useFocusMode } from '../../context/FocusModeContext';
import { useTheme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { confirmAsync } from '../../utils/confirm';

import OrdersScreen from '../../screens/admin/OrdersScreen';
import MenuEditorScreen from '../../screens/admin/MenuEditorScreen';
import HomePageEditorScreen from '../../screens/admin/HomePageEditorScreen';
import SettingsScreen from '../../screens/admin/SettingsScreen';
import AnalyticsScreen from '../../screens/admin/AnalyticsScreen';
import AdminRewardsScreen from '../../screens/admin/RewardsScreen';
import ApplicationsScreen from '../../screens/admin/ApplicationsScreen';
import ReviewsScreen from '../../screens/admin/ReviewsScreen';
import MarketingScreen from '../../screens/admin/MarketingScreen';

const SCREENS = {
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

function firstAllowedSection(allowedTabs) {
  const match = NAV_ITEMS.find((item) => allowedTabs.includes(item.key));
  return match?.key ?? 'Orders';
}

function AdminLayoutInner() {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const { enabled, allowedTabs, sessionUnlocked, isTabAllowed } = useFocusMode();

  const [activeSection, setActiveSection] = useState('Orders');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unlockVisible, setUnlockVisible] = useState(false);
  const pendingSectionRef = useRef(null);
  const signOutGuardUntilRef = useRef(0);
  const signOutInFlightRef = useRef(false);

  const isMobile   = width < MOBILE_BREAKPOINT;
  const isCollapsed = !isMobile && width < COLLAPSE_BREAKPOINT;

  // Close mobile overlay when screen grows
  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

  // If Focus Mode turns on while viewing a locked tab, bounce to an allowed one.
  useEffect(() => {
    if (!enabled || sessionUnlocked) return;
    if (!isTabAllowed(activeSection)) {
      setActiveSection(firstAllowedSection(allowedTabs));
    }
  }, [enabled, sessionUnlocked, allowedTabs, activeSection, isTabAllowed]);

  const openUnlock = useCallback((pendingKey = null) => {
    pendingSectionRef.current = pendingKey;
    setUnlockVisible(true);
  }, []);

  const handleUnlocked = useCallback(() => {
    const pending = pendingSectionRef.current;
    pendingSectionRef.current = null;
    if (pending && pending !== 'UnlockFocus') {
      setActiveSection(pending);
    }
    setMobileMenuOpen(false);
  }, []);

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

    if (key === 'UnlockFocus') {
      openUnlock(null);
      return;
    }

    if (enabled && !sessionUnlocked && !isTabAllowed(key)) {
      openUnlock(key);
      return;
    }

    setActiveSection(key);
    setMobileMenuOpen(false);
  }, [signOut, enabled, sessionUnlocked, isTabAllowed, openUnlock]);

  const ActiveScreen = SCREENS[activeSection] ?? OrdersScreen;

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
          {enabled && !sessionUnlocked && (
            <TouchableOpacity
              style={styles.unlockChip}
              onPress={() => openUnlock(null)}
            >
              <Ionicons name="lock-closed" size={14} color={theme.colors.textSecondary} />
              <Text style={[styles.unlockChipText, { color: theme.colors.textSecondary }]}>
                Focus
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Screen content */}
        <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
          <ActiveScreen />
        </View>
      </View>

      <FocusModeUnlockModal
        visible={unlockVisible}
        onClose={() => {
          pendingSectionRef.current = null;
          setUnlockVisible(false);
        }}
        onUnlocked={handleUnlocked}
      />
    </View>
  );
}

export default function AdminLayout() {
  return (
    <FocusModeProvider>
      <AdminLayoutInner />
    </FocusModeProvider>
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
    flex: 1,
  },
  unlockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  unlockChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
});
