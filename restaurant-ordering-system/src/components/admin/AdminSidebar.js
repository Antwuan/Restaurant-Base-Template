import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';

const NAV_ITEMS = [
  { key: 'Orders',   label: 'Orders',    icon: 'receipt',   iconOutline: 'receipt-outline'   },
  { key: 'Menu',     label: 'Menu',      icon: 'restaurant', iconOutline: 'restaurant-outline' },
  { key: 'Promo',    label: 'Promo',     icon: 'images',    iconOutline: 'images-outline'    },
  { key: 'Settings', label: 'Settings',  icon: 'settings',  iconOutline: 'settings-outline'  },
];

export default function AdminSidebar({ activeSection, onNavigate, collapsed }) {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      {/* Brand header */}
      <View style={[styles.brandHeader, { borderBottomColor: theme.colors.border }]}>
        <View style={[styles.brandIcon, { backgroundColor: theme.colors.brand }]}>
          <Ionicons name="restaurant" size={18} color="#fff" />
        </View>
        {!collapsed && (
          <View style={styles.brandText}>
            <Text style={styles.brandName} numberOfLines={1}>
              {restaurant?.name ?? 'Admin'}
            </Text>
            <Text style={styles.brandSub}>Dashboard</Text>
          </View>
        )}
      </View>

      {/* Navigation items */}
      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.navItem,
                isActive && { backgroundColor: theme.colors.brandLight },
              ]}
              onPress={() => onNavigate(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? item.icon : item.iconOutline}
                size={20}
                color={isActive ? theme.colors.brand : '#6b7280'}
                style={styles.navIcon}
              />
              {!collapsed && (
                <Text
                  style={[
                    styles.navLabel,
                    isActive ? { color: theme.colors.brand, fontWeight: '600' } : { color: '#374151' },
                  ]}
                >
                  {item.label}
                </Text>
              )}
              {isActive && !collapsed && (
                <View style={[styles.activeIndicator, { backgroundColor: theme.colors.brand }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {!collapsed && (
          <TouchableOpacity
            style={styles.signOutRow}
            onPress={() => onNavigate('SignOut')}
          >
            <Ionicons name="log-out-outline" size={18} color="#9ca3af" style={styles.navIcon} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 60;

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    flexDirection: 'column',
    ...Platform.select({
      web: { userSelect: 'none' },
    }),
  },
  sidebarCollapsed: {
    width: SIDEBAR_COLLAPSED_WIDTH,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  brandSub: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  navList: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    position: 'relative',
  },
  navIcon: {
    flexShrink: 0,
  },
  navLabel: {
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: 4,
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 10,
  },
  signOutText: {
    fontSize: 13,
    color: '#9ca3af',
  },
});

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH };
