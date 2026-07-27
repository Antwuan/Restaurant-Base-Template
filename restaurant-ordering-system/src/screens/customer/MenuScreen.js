import React, { useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useMenu } from '../../hooks/useMenu';
import { useCarousel } from '../../hooks/useCarousel';
import { useCartContext } from '../../context/CartContext';
import { useTheme } from '../../theme';
import CategorySection from '../../components/CategorySection';
import MenuCarousel from '../../components/MenuCarousel';
import MenuItemModal from '../../components/MenuItemModal';

const SIDEBAR_WIDTH = 188;
const DESKTOP_BREAKPOINT = 768;
const NAVBAR_OFFSET = 60;

export default function MenuScreen() {
  const { restaurant } = useRestaurantContext();
  const {
    categoriesWithItems,
    menuByCategory,
    loading,
    error,
    refetch,
  } = useMenu(restaurant?.id, 'regular');

  const { slides, refetch: refetchCarousel } = useCarousel(restaurant?.id);
  const { addItem } = useCartContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const [refreshing, setRefreshing] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Refs for each category section (keyed by category id)
  const sectionRefs = useRef({});
  const scrollRef = useRef(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchCarousel()]);
    setRefreshing(false);
  }, [refetch, refetchCarousel]);

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
    addItem(item, quantity, specialInstructions, menuType, selectedModifiers, unitPrice);
  }, [addItem]);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleSidebarPress = useCallback((categoryId) => {
    setActiveCategoryId(categoryId);
    const section = sectionRefs.current[categoryId];
    const scroll = scrollRef.current;
    if (!section || !scroll) return;

    const scrollToSection = (y) => {
      scroll.scrollTo({ y: Math.max(0, y - NAVBAR_OFFSET), animated: true });
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
  }, []);

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
        <Text style={styles.errorText}>Failed to load menu.</Text>
        <TouchableOpacity
          onPress={refetch}
          style={[styles.retryBtn, { backgroundColor: theme.colors.brand }]}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
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

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={isEmpty ? styles.scrollEmpty : undefined}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        {/* Carousel */}
        <MenuCarousel slides={slides} />

        {/* ── Slim info bar (replaces RestaurantHeader) ── */}
        <View style={styles.infoBar}>
          <View style={styles.infoBarInner}>
            <View style={styles.infoLeft}>
              {restaurant?.name ? (
                <Text style={styles.infoName}>{restaurant.name}</Text>
              ) : null}
              <View style={styles.infoMeta}>
                {restaurant?.address ? (
                  <View style={styles.infoMetaItem}>
                    <Ionicons name="location-outline" size={13} color="#666" />
                    <Text style={styles.infoMetaText} numberOfLines={1}>
                      {restaurant.address}
                    </Text>
                  </View>
                ) : null}
                {restaurant?.is_accepting_orders === false ? (
                  <View style={[styles.statusPill, styles.statusPillClosed]}>
                    <Text style={styles.statusPillText}>Closed</Text>
                  </View>
                ) : (
                  <View style={[styles.statusPill, styles.statusPillOpen]}>
                    <Text style={styles.statusPillText}>Open Now</Text>
                  </View>
                )}
              </View>
            </View>
            {restaurant?.phone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
                style={styles.phoneBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="call-outline" size={14} color={theme.colors.brand} />
                <Text style={[styles.phoneBtnText, { color: theme.colors.brand }]}>
                  {restaurant.phone}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* ── Not accepting orders banner ── */}
        {restaurant?.is_accepting_orders === false && (
          <View style={styles.closedBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.closedBannerText}>
              Currently not accepting orders
            </Text>
          </View>
        )}

        {/* ── Two-column layout: sidebar + menu items ── */}
        {isEmpty ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>No menu items available right now.</Text>
          </View>
        ) : (
          <View style={[styles.menuLayout, isDesktop && styles.menuLayoutDesktop]}>

            {/* Sidebar — search + category nav (desktop only, sticky) */}
            {isDesktop && (
              <View style={styles.sidebar}>
                <View style={styles.sidebarInner}>
                  <View style={styles.searchBox}>
                    <Ionicons name="search-outline" size={16} color="#999" />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search menu…"
                      placeholderTextColor="#999"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      returnKeyType="search"
                      clearButtonMode="while-editing"
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSearchQuery('')}
                        accessibilityLabel="Clear search"
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={16} color="#bbb" />
                      </TouchableOpacity>
                    )}
                  </View>
                  {visibleCategories.map((category) => {
                    const isActive = category.id === activeCategory;
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.sidebarItem,
                          isActive && { borderLeftColor: theme.colors.brand },
                        ]}
                        onPress={() => handleSidebarPress(category.id)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.sidebarItemText,
                            isActive && { color: theme.colors.brand, fontWeight: '700' },
                          ]}
                          numberOfLines={2}
                        >
                          {category.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Mobile search + horizontal category scroll */}
            {!isDesktop && (
              <View style={styles.mobileNav}>
                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={16} color="#999" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search menu…"
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      accessibilityLabel="Clear search"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#bbb" />
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
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.mobileCategoryChip,
                          isActive && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
                        ]}
                        onPress={() => handleSidebarPress(category.id)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.mobileCategoryChipText,
                            isActive && { color: '#fff' },
                          ]}
                        >
                          {category.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Menu items */}
            <View style={[styles.menuItems, isDesktop && styles.menuItemsDesktop]}>
              {noResults ? (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={28} color="#bbb" />
                  <Text style={styles.noResultsText}>
                    No items match “{searchQuery.trim()}”.
                  </Text>
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
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  statusPillOpen: {
    backgroundColor: '#D1FAE5',
  },
  statusPillClosed: {
    backgroundColor: '#FEE2E2',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  phoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  phoneBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Closed banner
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closedBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  },
  sidebarItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
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
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#222',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },

  // ── Mobile nav (search + chips)
  mobileNav: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e8e8',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  mobileCategoryContent: {
    paddingBottom: 10,
    gap: 8,
  },
  mobileCategoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
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

  // ── States
  emptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#cc2222',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
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
