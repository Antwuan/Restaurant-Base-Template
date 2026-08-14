import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  Linking,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { usePickupLocation } from '../../context/PickupLocationContext';
import { useMenu } from '../../hooks/useMenu';
import { useCartContext } from '../../context/CartContext';
import { useTheme } from '../../theme';
import { useNavbarCollapse } from '../../context/NavbarCollapseContext';
import CategorySection from '../../components/CategorySection';
import MenuItemModal from '../../components/MenuItemModal';
import PickupLocationPicker from '../../components/PickupLocationPicker';
import AdminHoverTab from '../../components/admin/AdminHoverTab';
import {
  getClosedUntilLabel,
  getNotAcceptingReason,
  isAcceptingOrdersNow,
} from '../../utils/hoursUtils';

const SIDEBAR_WIDTH = 188;
const DESKTOP_BREAKPOINT = 768;
const NAVBAR_OFFSET = 60;

export default function MenuScreen() {
  const { restaurant } = useRestaurantContext();
  const { customerProfile, user } = useAuth();
  const {
    locations,
    selectedLocationId,
    selectedLocation,
    setPickupLocation,
    hasSelection,
    loading: locationsLoading,
  } = usePickupLocation();
  const {
    categoriesWithItems,
    menuByCategory,
    allItems,
    loading,
    error,
    refetch,
  } = useMenu(restaurant?.id, 'regular');

  const { addItem, hydrateImages } = useCartContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { setCollapsed: setNavbarCollapsed } = useNavbarCollapse();

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const greetName =
    customerProfile?.first_name
    || user?.user_metadata?.first_name
    || null;
  const multiLocation = locations.length >= 2;

  const [refreshing, setRefreshing] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [hoursTick, setHoursTick] = useState(() => Date.now());
  const c = theme.colors;

  // Backfill image_url on cart lines saved before images were stored.
  useEffect(() => {
    if (!allItems?.length || !hydrateImages) return;
    const imageById = {};
    allItems.forEach((item) => {
      if (item?.id && item.image_url) imageById[item.id] = item.image_url;
    });
    if (Object.keys(imageById).length) hydrateImages(imageById);
  }, [allItems, hydrateImages]);

  // Re-evaluate open/accepting status every minute so the pill flips near close.
  useEffect(() => {
    const id = setInterval(() => setHoursTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const acceptingOrders = useMemo(
    () => isAcceptingOrdersNow(restaurant),
    // hoursTick forces a refresh as closing time approaches
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restaurant?.is_accepting_orders, restaurant?.hours_of_operation, hoursTick],
  );
  const notAcceptingReason = useMemo(
    () => (acceptingOrders ? null : getNotAcceptingReason(restaurant)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acceptingOrders, restaurant?.is_accepting_orders, restaurant?.hours_of_operation, hoursTick],
  );
  // Same closed tag copy as CateringScreen
  const closedLabel = useMemo(
    () => getClosedUntilLabel(restaurant?.hours_of_operation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restaurant?.hours_of_operation, hoursTick],
  );
  const statusTagLabel = closedLabel
    || (notAcceptingReason === 'paused'
      ? 'Not accepting orders'
      : notAcceptingReason === 'closing_soon'
        ? 'Closing soon'
        : null);

  // Refs for each category section (keyed by category id)
  const sectionRefs = useRef({});
  const scrollRef = useRef(null);
  const headerBlockHeight = useRef(0);
  const mobileNavHeight = useRef(0);
  const navbarCollapsedRef = useRef(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleItemPress = useCallback((item) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  // Pick up to 3 available items from OTHER categories for "Goes well with"
  const getSuggestedItems = useCallback((forItem) => {
    if (!forItem) return [];
    const results = [];
    for (const cat of categoriesWithItems) {
      const catItems = menuByCategory[cat.id]?.items || [];
      const eligible = catItems.filter(
        (it) => it.id !== forItem.id && it.is_available,
      );
      if (eligible.length) results.push(eligible[0]);
      if (results.length >= 3) break;
    }
    return results;
  }, [categoriesWithItems, menuByCategory]);

  const handleAddToCart = useCallback((item, quantity = 1, specialInstructions = '', menuType = 'regular', selectedModifiers = [], unitPrice) => {
    // Soft-block: multi-location restaurants need a pickup choice before cart changes.
    if (multiLocation && !hasSelection) {
      Alert.alert(
        'Pickup location needed',
        'Choose where you’ll pick up this order, then add items. Use the location picker near the top of the menu.',
        [{ text: 'Got it' }],
      );
      return;
    }
    addItem(item, quantity, specialInstructions, menuType, selectedModifiers, unitPrice);
    const qtyLabel = quantity > 1 ? `${quantity} × ${item.name}` : item.name;
    AccessibilityInfo.announceForAccessibility?.(`${qtyLabel} added to cart`);
  }, [addItem, multiLocation, hasSelection]);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  useEffect(() => {
    if (!modalVisible) setSelectedItem(null);
  }, [modalVisible]);

  useEffect(() => {
    if (isDesktop) {
      navbarCollapsedRef.current = false;
      setNavbarCollapsed(false);
    }
  }, [isDesktop, setNavbarCollapsed]);

  useEffect(() => () => {
    navbarCollapsedRef.current = false;
    setNavbarCollapsed(false);
  }, [setNavbarCollapsed]);

  const handleHeaderBlockLayout = useCallback((e) => {
    headerBlockHeight.current = e.nativeEvent.layout.height;
  }, []);

  const handleMobileNavLayout = useCallback((e) => {
    mobileNavHeight.current = e.nativeEvent.layout.height;
  }, []);

  const handleScroll = useCallback((e) => {
    if (isDesktop || Platform.OS !== 'web') return;
    const next = (e.nativeEvent.contentOffset?.y ?? 0) >= headerBlockHeight.current
      && headerBlockHeight.current > 0;
    if (next === navbarCollapsedRef.current) return;
    navbarCollapsedRef.current = next;
    setNavbarCollapsed(next);
  }, [isDesktop, setNavbarCollapsed]);

  const handleSidebarPress = useCallback((categoryId) => {
    setActiveCategoryId(categoryId);
    const section = sectionRefs.current[categoryId];
    const scroll = scrollRef.current;
    if (!section || !scroll) return;

    const scrollToSection = (y) => {
      const offset = isDesktop
        ? NAVBAR_OFFSET
        : (navbarCollapsedRef.current
          ? (mobileNavHeight.current || NAVBAR_OFFSET)
          : NAVBAR_OFFSET);
      scroll.scrollTo({ y: Math.max(0, y - offset), animated: true });
    };

    const webFallback = () => {
      if (Platform.OS === 'web' && typeof section.scrollIntoView === 'function') {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    // Prefer measureLayout + scrollTo (web + native); scrollIntoView as web fallback
    if (typeof section.measureLayout === 'function' && typeof scroll.scrollTo === 'function') {
      const relativeTo =
        (typeof scroll.getInnerViewNode === 'function' && scroll.getInnerViewNode()) ||
        (typeof scroll.getInnerViewRef === 'function' && scroll.getInnerViewRef()) ||
        scroll;
      try {
        section.measureLayout(
          relativeTo?.current ?? relativeTo,
          (_x, y) => scrollToSection(y),
          webFallback,
        );
        return;
      } catch (_) {
        webFallback();
        return;
      }
    }

    webFallback();
  }, [isDesktop]);

  const isEmpty = !loading && !error && categoriesWithItems.length === 0;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
        <Text style={styles.loadingText}>Loading menu…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>We couldn’t load the menu.</Text>
        <Text style={styles.errorHint}>Check your connection, then try again.</Text>
        <TouchableOpacity
          onPress={refetch}
          style={[styles.retryBtn, { backgroundColor: theme.colors.brand }]}
          accessibilityRole="button"
          accessibilityLabel="Try loading the menu again"
        >
          <Text style={styles.retryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeCategory = activeCategoryId || categoriesWithItems[0]?.id;

  const query = searchQuery.trim().toLowerCase();
  const itemsForCategory = (categoryId) => {
    const all = menuByCategory[categoryId]?.items || [];
    if (!query) return all;
    return all.filter((it) =>
      (it.name || '').toLowerCase().includes(query) ||
      (it.description || '').toLowerCase().includes(query)
    );
  };
  const visibleCategories = categoriesWithItems.filter(
    (c) => itemsForCategory(c.id).length > 0
  );
  const noResults = query.length > 0 && visibleCategories.length === 0;

  // Info-bar location tracks the selected pickup store (not always HQ address).
  const headerLocationLabel = (() => {
    if (selectedLocation) {
      const locName = selectedLocation.name?.trim();
      const locAddress = selectedLocation.address?.trim();
      const nameDiffers =
        locName &&
        locName.toLowerCase() !== (restaurant?.name || '').trim().toLowerCase();
      if (nameDiffers && locAddress) return `${locName} · ${locAddress}`;
      return locAddress || locName || null;
    }
    return restaurant?.address || null;
  })();

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={isEmpty ? styles.scrollEmpty : undefined}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Slim info bar (replaces RestaurantHeader) ── */}
        <View onLayout={handleHeaderBlockLayout}>
        <View style={[styles.infoBar, { borderBottomColor: c.border }]}>
          <View style={styles.infoBarInner}>
            <View style={styles.infoLeft}>
              {restaurant?.name ? (
                <Text style={[styles.infoName, { color: c.textPrimary }]}>{restaurant.name}</Text>
              ) : null}
              <View style={styles.infoMeta}>
                {headerLocationLabel ? (
                  <View style={styles.infoMetaItem}>
                    <Ionicons name="location-outline" size={13} color={c.textSecondary} />
                    <Text style={[styles.infoMetaText, { color: c.textSecondary }]} numberOfLines={1}>
                      {headerLocationLabel}
                    </Text>
                  </View>
                ) : null}
                {statusTagLabel ? (
                  <View style={styles.closedBadge}>
                    <Text style={styles.closedBadgeText}>{statusTagLabel}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {restaurant?.phone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
                style={[styles.phoneBtn, { borderColor: c.border }]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Call ${restaurant.phone}`}
              >
                <Ionicons name="call-outline" size={14} color={c.brand} />
                <Text style={[styles.phoneBtnText, { color: c.brand }]}>
                  {restaurant.phone}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Pickup location (compact summary → popup with map) */}
        {!locationsLoading && (multiLocation || selectedLocation) ? (
          <View style={[styles.pickupSection, { borderBottomColor: c.border }]}>
            <View style={styles.pickupSectionInner}>
              {multiLocation && !hasSelection ? (
                <Text style={[styles.pickupGreeting, { color: c.textPrimary }]}>
                  {greetName
                    ? `Hi ${greetName} — where are you picking up?`
                    : 'Where are you picking up?'}
                </Text>
              ) : null}
              <PickupLocationPicker
                locations={locations}
                selectedLocationId={selectedLocationId}
                onSelect={(id) => setPickupLocation(id)}
                restaurant={restaurant}
                brandColor={c.brand}
                label=""
                compact
                autoOpenWhenUnset={multiLocation && !hasSelection}
              />
              {multiLocation && !hasSelection ? (
                <Text style={[styles.pickupHint, { color: c.errorText }]}>
                  Choose a location first so we know which kitchen gets your order.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        </View>

        {/* ── Two-column layout: sidebar + menu items ── */}
        {isEmpty ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>This menu doesn’t have items yet.</Text>
            <Text style={styles.emptyHint}>Check back soon, or try another location if you have more than one.</Text>
          </View>
        ) : (
          <View style={[styles.menuLayout, isDesktop && styles.menuLayoutDesktop]}>

            {/* Sidebar — search + category nav (desktop only, sticky) */}
            {isDesktop && (
              <View style={[styles.sidebar, { borderRightColor: c.border }]}>
                <View style={styles.sidebarInner}>
                  <View
                    style={[
                      styles.searchBox,
                      {
                        borderColor: searchFocused ? c.brand : c.border,
                        backgroundColor: c.backgroundSunken,
                      },
                    ]}
                  >
                    <Ionicons
                      name="search-outline"
                      size={16}
                      color={searchFocused ? c.brand : c.textSecondary}
                    />
                    <TextInput
                      style={[styles.searchInput, { color: c.textPrimary }]}
                      placeholder="Search menu"
                      placeholderTextColor={c.textDisabled}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                      accessibilityLabel="Search menu by name or description"
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSearchQuery('')}
                        accessibilityLabel="Clear search"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={16} color={c.textDisabled} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {visibleCategories.map((category) => {
                    const isActive = category.id === activeCategory;
                    return (
                      <AdminHoverTab
                        key={category.id}
                        isActive={isActive}
                        brandLight={c.brandLight}
                        washRadius={8}
                        onPress={() => handleSidebarPress(category.id)}
                        style={[
                          styles.sidebarItem,
                          isActive && { backgroundColor: c.brandLight },
                        ]}
                        accessibilityLabel={category.name}
                      >
                        {({ hovered }) => (
                          <Text
                            style={[
                              styles.sidebarItemText,
                              {
                                color: isActive || hovered ? c.brand : c.textSecondary,
                              },
                              isActive && { fontWeight: '700' },
                            ]}
                            numberOfLines={2}
                          >
                            {category.name}
                          </Text>
                        )}
                      </AdminHoverTab>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Mobile search + horizontal category scroll */}
            {!isDesktop && (
              <View
                onLayout={handleMobileNavLayout}
                style={[styles.mobileNav, { borderBottomColor: c.border, backgroundColor: c.background || '#fff' }]}
              >
                <View
                  style={[
                    styles.searchBox,
                    {
                      borderColor: searchFocused ? c.brand : c.border,
                      backgroundColor: c.backgroundSunken,
                    },
                  ]}
                >
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={searchFocused ? c.brand : c.textSecondary}
                  />
                  <TextInput
                    style={[styles.searchInput, { color: c.textPrimary }]}
                    placeholder="Search menu"
                    placeholderTextColor={c.textDisabled}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    accessibilityLabel="Search menu by name or description"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      accessibilityLabel="Clear search"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={c.textDisabled} />
                    </TouchableOpacity>
                  )}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mobileCategoryContent}
                >
                  {visibleCategories.map((category) => {
                    const isActive = category.id === activeCategory;
                    return (
                      <AdminHoverTab
                        key={category.id}
                        isActive={isActive}
                        brandLight={c.brandLight}
                        washRadius={20}
                        onPress={() => handleSidebarPress(category.id)}
                        style={[
                          styles.mobileCategoryChip,
                          { borderColor: isActive ? c.brand : c.border },
                          isActive && { backgroundColor: c.brand },
                        ]}
                        accessibilityLabel={category.name}
                      >
                        {({ hovered }) => (
                          <Text
                            style={[
                              styles.mobileCategoryChipText,
                              {
                                color: isActive
                                  ? (c.brandText || '#fff')
                                  : hovered
                                    ? c.brand
                                    : c.textSecondary,
                              },
                            ]}
                          >
                            {category.name}
                          </Text>
                        )}
                      </AdminHoverTab>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Menu items */}
            <View style={[styles.menuItems, isDesktop && styles.menuItemsDesktop]}>
              {noResults ? (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={28} color={c.textDisabled} />
                  <Text style={[styles.noResultsText, { color: c.textSecondary }]}>
                    No items match “{searchQuery.trim()}”.
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    style={styles.noResultsAction}
                  >
                    <Text style={[styles.noResultsActionText, { color: c.brand }]}>
                      Clear search
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                visibleCategories.map((category) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    items={itemsForCategory(category.id)}
                    onAddToCart={handleAddToCart}
                    onItemPress={handleItemPress}
                    sectionRef={(ref) => {
                      if (ref) sectionRefs.current[category.id] = ref;
                    }}
                  />
                ))
              )}
              <View style={{ height: 40 }} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Item detail modal */}
      <MenuItemModal
        item={selectedItem}
        visible={modalVisible}
        onClose={handleModalClose}
        onAddToCart={handleAddToCart}
        suggestedItems={getSuggestedItems(selectedItem)}
        menuType="regular"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrollEmpty: {
    flexGrow: 1,
  },

  // ── Info bar
  infoBar: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  infoLeft: {
    flex: 1,
    paddingRight: 12,
  },
  infoName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  infoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  infoMetaText: {
    fontSize: 12,
    color: '#666',
  },
  // Matches CateringScreen closedBadge
  closedBadge: {
    backgroundColor: '#fde8ec',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#c2314f',
  },
  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  phoneBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  pickupSection: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickupSectionInner: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  pickupGreeting: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
  },
  pickupHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Menu layout (no flex:1 — lets outer ScrollView grow with content)
  menuLayout: {
    flexDirection: 'column',
  },
  menuLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },

  // ── Sidebar (desktop)
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    minWidth: 0,
    ...Platform.select({
      web: { position: 'sticky', top: 60, alignSelf: 'flex-start' },
    }),
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#e8e8e8',
    paddingTop: 16,
    paddingBottom: 24,
    paddingRight: 12,
  },
  sidebarInner: {
    paddingHorizontal: 0,
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
    color: '#444',
    lineHeight: 18,
  },

  // ── Search box (shared)
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#e2e2e2',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    marginBottom: 14,
    backgroundColor: '#fafafa',
    minWidth: 0,
    maxWidth: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    color: '#222',
    paddingVertical: 2,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        width: '100%',
      },
    }),
  },

  // ── Mobile nav (search + chips)
  mobileNav: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
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
  mobileCategoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  mobileCategoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },

  // ── Menu items column
  menuItems: {
    flex: 1,
    minWidth: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  menuItemsDesktop: {
    paddingHorizontal: 0,
    paddingLeft: 24,
  },

  // ── No search results
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    gap: 10,
  },
  noResultsText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  noResultsAction: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  noResultsActionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── States
  emptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    minHeight: 200,
    gap: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#cc2222',
    marginBottom: 6,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
