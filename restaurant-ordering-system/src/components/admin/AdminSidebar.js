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
  { key: 'Orders',       label: 'Orders',       icon: 'receipt',          iconOutline: 'receipt-outline'          },
  { key: 'Analytics',    label: 'Analytics',    icon: 'bar-chart',        iconOutline: 'bar-chart-outline'        },
  { key: 'Menu',         label: 'Menu',         icon: 'restaurant',       iconOutline: 'restaurant-outline'       },
  { key: 'Promo',        label: 'Promo',        icon: 'images',           iconOutline: 'images-outline'           },
  { key: 'Rewards',      label: 'Rewards',      icon: 'gift',             iconOutline: 'gift-outline'             },
  { key: 'Applications', label: 'Applications', icon: 'document-text',    iconOutline: 'document-text-outline'    },
  { key: 'Marketing',    label: 'Marketing',    icon: 'megaphone',        iconOutline: 'megaphone-outline'        },
  { key: 'Settings',     label: 'Settings',     icon: 'settings',         iconOutline: 'settings-outline'         },
];

export default function AdminSidebar({ activeSection, onNavigate, collapsed }) {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();

  return (
    <View style={[
      styles.sidebar,
      collapsed && styles.sidebarCollapsed,
      {
        backgroundColor: theme.colors.backgroundCard,
        borderRightColor: theme.colors.border,
      },
    ]}>
      {/* Brand header */}
      <View style={[styles.brandHeader, { borderBottomColor: theme.colors.border }]}>
        <View style={[styles.brandIcon, { backgroundColor: theme.colors.brand }]}>
          <Ionicons name="restaurant" size={18} color="#fff" />
        </View>
        {!collapsed && (
          <View style={styles.brandText}>
            <Text style={[styles.brandName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {restaurant?.name ?? 'Admin'}
            </Text>
            <Text style={[styles.brandSub, { color: theme.colors.textSecondary }]}>Dashboard</Text>
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
                color={isActive ? theme.colors.brand : theme.colors.textSecondary}
                style={styles.navIcon}
              />
              {!collapsed && (
                <Text
                  style={[
                    styles.navLabel,
                    isActive
                      ? { color: theme.colors.brand, fontWeight: '600' }
                      : { color: theme.colors.textPrimary },
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
      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[styles.signOutRow, collapsed && styles.signOutRowCollapsed]}
          onPress={() => onNavigate('SignOut')}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.colors.textSecondary} style={styles.navIcon} />
          {!collapsed && (
            <Text style={[styles.signOutText, { color: theme.colors.textSecondary }]}>Sign out</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 60;

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
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
  },
  brandSub: {
    fontSize: 11,
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
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 10,
  },
  signOutRowCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  signOutText: {
    fontSize: 13,
  },
});

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH };
