import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHoverTab from './admin/AdminHoverTab';

export const SERVICE_DESKTOP_BREAKPOINT = 768;

export const ALL_SERVICES = 'All';
export const UNCATEGORIZED = 'Services';

export function serviceCategoryKey(service) {
  const name = String(service?.category || '').trim();
  return name || UNCATEGORIZED;
}

export function serviceCategories(services) {
  const seen = [];
  services.forEach((item) => {
    const key = serviceCategoryKey(item);
    if (!seen.includes(key)) seen.push(key);
  });
  return seen;
}

export function filterServices(services, query, category) {
  const q = String(query || '').trim().toLowerCase();
  return services.filter((item) => {
    const key = serviceCategoryKey(item);
    if (category && category !== ALL_SERVICES && key !== category) return false;
    if (!q) return true;
    const hay = `${item.name || ''} ${item.description || ''} ${key}`.toLowerCase();
    return hay.includes(q);
  });
}

export function ServiceSearchEmpty({ colors, query, onClear }) {
  return (
    <View style={styles.noResults}>
      <Ionicons name="search-outline" size={28} color={colors.textDisabled} />
      <Text style={[styles.noResultsText, { color: colors.textSecondary }]}>
        No services match “{String(query || '').trim()}”.
      </Text>
      <TouchableOpacity
        onPress={onClear}
        accessibilityLabel="Clear search"
        style={styles.noResultsAction}
      >
        <Text style={[styles.noResultsActionText, { color: colors.brand }]}>Clear search</Text>
      </TouchableOpacity>
    </View>
  );
}

function SearchField({ colors, query, onChangeQuery, focused, onFocus, onBlur }) {
  return (
    <View
      style={[
        styles.searchBox,
        {
          borderColor: focused ? colors.brand : colors.border,
          backgroundColor: colors.backgroundSunken,
        },
      ]}
    >
      <Ionicons
        name="search-outline"
        size={16}
        color={focused ? colors.brand : colors.textSecondary}
      />
      <TextInput
        style={[styles.searchInput, { color: colors.textPrimary }]}
        placeholder="Search services"
        placeholderTextColor={colors.textDisabled}
        value={query}
        onChangeText={onChangeQuery}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search services by name or description"
      />
      {query.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeQuery('')}
          accessibilityLabel="Clear search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={16} color={colors.textDisabled} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function ServiceCategoryFilter({
  colors,
  query,
  onChangeQuery,
  focused,
  onFocus,
  onBlur,
  categories,
  activeCategory,
  onSelectCategory,
  bleed = 0,
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= SERVICE_DESKTOP_BREAKPOINT;
  const chips = [ALL_SERVICES, ...categories];
  const search = (
    <SearchField
      colors={colors}
      query={query}
      onChangeQuery={onChangeQuery}
      focused={focused}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );

  if (isDesktop) {
    return (
      <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
        <View style={styles.sidebarInner}>
          {search}
          {chips.map((name) => {
            const isActive = name === activeCategory;
            return (
              <AdminHoverTab
                key={name}
                isActive={isActive}
                brandLight={colors.brandLight}
                washRadius={8}
                onPress={() => onSelectCategory(name)}
                style={[
                  styles.sidebarItem,
                  isActive && { backgroundColor: colors.brandLight },
                ]}
                accessibilityLabel={name}
              >
                {({ hovered }) => (
                  <Text
                    style={[
                      styles.sidebarItemText,
                      { color: isActive || hovered ? colors.brand : colors.textSecondary },
                      isActive && { fontWeight: '700' },
                    ]}
                    numberOfLines={2}
                  >
                    {name}
                  </Text>
                )}
              </AdminHoverTab>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.mobileNav,
        bleed ? { marginHorizontal: -bleed } : null,
        { borderBottomColor: colors.border, backgroundColor: colors.background || '#fff' },
      ]}
    >
      {search}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mobileCategoryContent}
      >
        {chips.map((name) => {
          const isActive = name === activeCategory;
          return (
            <AdminHoverTab
              key={name}
              isActive={isActive}
              brandLight={colors.brandLight}
              washRadius={20}
              onPress={() => onSelectCategory(name)}
                style={[
                  styles.chip,
                  {
                    borderColor: isActive ? colors.brand : colors.border,
                    backgroundColor: isActive ? colors.brand : colors.backgroundCard,
                  },
                ]}
              accessibilityLabel={name}
            >
              {({ hovered }) => (
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isActive
                        ? (colors.brandText || '#fff')
                        : hovered
                          ? colors.brand
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {name}
                </Text>
              )}
            </AdminHoverTab>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 188,
    flexShrink: 0,
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingBottom: 24,
    paddingRight: 12,
    ...Platform.select({
      web: { position: 'sticky', top: 0, alignSelf: 'flex-start' },
    }),
  },
  sidebarInner: {
    minWidth: 0,
    width: '100%',
  },
  sidebarItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 40,
    borderRadius: 8,
    justifyContent: 'center',
    marginBottom: 2,
  },
  sidebarItemText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  mobileNav: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    ...Platform.select({
      web: {
        position: 'sticky',
        top: 0,
        zIndex: 30,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      },
    }),
  },
  mobileCategoryContent: {
    paddingBottom: 12,
    gap: 8,
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    marginBottom: 14,
    minWidth: 0,
    maxWidth: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 2,
    ...Platform.select({
      web: { outlineStyle: 'none', width: '100%' },
    }),
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    gap: 10,
  },
  noResultsText: { fontSize: 15, textAlign: 'center' },
  noResultsAction: { marginTop: 4, paddingVertical: 8, paddingHorizontal: 12 },
  noResultsActionText: { fontSize: 14, fontWeight: '600' },
});
