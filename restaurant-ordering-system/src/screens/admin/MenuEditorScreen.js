// Admin menu editor — mirrors the customer MenuScreen layout so admins see
// exactly what customers see, with admin controls layered on top.
//
// Layout (desktop):
//   [Regular Menu] [Catering Menu]          ← tab switcher
//   ─────────────────────────────────────────────────────
//   [Carousel]
//   [Info bar]
//   [Sidebar (sticky)]  │  [Category sections]
//    drag to reorder     │   drag items to reorder
//    + Add Category      │
//
// Mobile:
//   [Tab switcher]
//   [Carousel]  [Info bar]
//   [Horizontal draggable category chips  + Add Category]
//   [Category sections — single column]
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToVerticalAxis,
  restrictToHorizontalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMenu } from '../../hooks/useMenu';
import { useCarousel } from '../../hooks/useCarousel';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import * as menuService from '../../services/menuService';
import {
  uploadFileFromUri,
  menuImageStoragePath,
} from '../../services/storageService';
import MenuCarousel from '../../components/MenuCarousel';
import AdminCategorySection from '../../components/admin/AdminCategorySection';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import MenuItemEditor from '../../components/admin/MenuItemEditor';
import CategoryEditor from '../../components/admin/CategoryEditor';

const SIDEBAR_WIDTH = 210;
const DESKTOP_BREAKPOINT = 768;

const MENU_TABS = [
  { key: 'regular', label: 'Regular Menu', icon: 'grid-outline' },
  { key: 'catering', label: 'Catering Menu', icon: 'restaurant-outline' },
];

function newItemId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Sidebar sortable category row ──────────────────────────────────────────────
function SortableSidebarCategory({ category, isActive, onPress, onEdit, theme }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const c = theme.colors;

  const divStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 0,
    display: 'flex',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: isDragging ? c.backgroundSunken : 'transparent',
  };

  return (
    <div ref={setNodeRef} style={divStyle} {...attributes}>
      {/* Grip handle */}
      <div
        {...listeners}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          padding: '8px 4px 8px 8px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <Ionicons name="reorder-two-outline" size={15} color={c.textDisabled} />
      </div>

      {/* Category name */}
      <TouchableOpacity
        style={[
          sidebarStyles.item,
          isActive && { borderLeftColor: c.brand },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text
          style={[
            sidebarStyles.itemText,
            { color: c.textPrimary },
            isActive && { color: c.brand, fontWeight: '700' },
          ]}
          numberOfLines={2}
        >
          {category.name}
        </Text>
      </TouchableOpacity>

      {/* Edit button */}
      <TouchableOpacity
        style={sidebarStyles.editBtn}
        onPress={onEdit}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
        accessibilityLabel={`Edit ${category.name}`}
      >
        <Ionicons name="pencil-outline" size={12} color={c.textSecondary} />
      </TouchableOpacity>
    </div>
  );
}

// ── Mobile horizontal sortable chip ────────────────────────────────────────────
function SortableMobileChip({ category, isActive, onPress, theme }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const c = theme.colors;

  const divStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 0,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    touchAction: 'none',
  };

  const chipStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 10,
    paddingRight: 14,
    paddingTop: 7,
    paddingBottom: 7,
    borderRadius: 20,
    border: `1px solid ${isActive ? c.brand : c.border}`,
    backgroundColor: isActive ? c.brand : c.backgroundCard,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  };

  const textStyle = {
    fontSize: 13,
    fontWeight: '600',
    color: isActive ? c.brandText : c.textPrimary,
  };

  return (
    <div ref={setNodeRef} style={divStyle} {...attributes}>
      <div
        {...listeners}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          paddingLeft: 6,
          paddingRight: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Ionicons
          name="reorder-two-outline"
          size={13}
          color={isActive ? c.brandText : c.textDisabled}
        />
      </div>
      <div style={chipStyle} onClick={onPress}>
        <span style={textStyle}>{category.name}</span>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MenuEditorScreen() {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const [activeMenuType, setActiveMenuType] = useState('regular');

  const {
    categories,
    allItems,
    loading,
    refetch: refreshMenu,
  } = useMenu(restaurant?.id, activeMenuType);

  const { slides, refetch: refreshCarousel } = useCarousel(restaurant?.id);

  const [itemEditorVisible, setItemEditorVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [catEditorVisible, setCatEditorVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const sectionRefs = useRef({});
  const scrollRef = useRef(null);

  const categorizedMenu = menuService.groupItemsByCategory(categories, allItems);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // ── Scroll to category ────────────────────────────────────────────────────

  const scrollToCategory = useCallback((categoryId) => {
    setActiveCategoryId(categoryId);
    const ref = sectionRefs.current[categoryId];
    if (Platform.OS === 'web' && ref?.scrollIntoView) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // ── Category DnD ──────────────────────────────────────────────────────────

  const handleCategoryDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    try {
      await menuService.reorderCategories(restaurant.id, reordered.map((c) => c.id));
      await refreshMenu();
    } catch {
      Alert.alert('Error', 'Could not reorder categories.');
    }
  }, [categories, restaurant?.id, refreshMenu]);

  // ── Item reorder (called by AdminCategorySection) ─────────────────────────

  const handleItemsReordered = useCallback(async (categoryId, orderedIds) => {
    try {
      await menuService.reorderMenuItems(restaurant.id, orderedIds);
      await refreshMenu();
    } catch {
      Alert.alert('Error', 'Could not reorder items.');
    }
  }, [restaurant?.id, refreshMenu]);

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  const handleAddItem = useCallback((category) => {
    setSelectedItem({ category_id: category?.id ?? '', restaurant_id: restaurant?.id });
    setItemEditorVisible(true);
  }, [restaurant?.id]);

  const handleEditItem = useCallback((item) => {
    setSelectedItem(item);
    setItemEditorVisible(true);
  }, []);

  const handleToggleAvailability = useCallback(async (item) => {
    setTogglingId(item.id);
    try {
      await menuService.toggleItemAvailability(item.id, !item.is_available);
      await refreshMenu();
    } catch {
      Alert.alert('Error', 'Could not update item availability.');
    } finally {
      setTogglingId(null);
    }
  }, [refreshMenu]);

  const persistMenuItem = useCallback(async ({
    name, description, price, category_id, image_url, is_available, localImageUri,
  }) => {
    const isNew = !selectedItem?.id;
    const itemId = selectedItem?.id ?? newItemId();

    let finalImageUrl = image_url ?? '';
    if (localImageUri) {
      const storagePath = menuImageStoragePath(restaurant.id, itemId, 'jpg');
      const { publicUrl } = await uploadFileFromUri({
        path: storagePath,
        uri: localImageUri,
        contentType: 'image/jpeg',
      });
      finalImageUrl = publicUrl;
    }

    const payload = {
      name,
      description: description || null,
      price: typeof price === 'number' ? price : parseFloat(price),
      category_id,
      image_url: finalImageUrl || null,
      is_available: is_available ?? true,
    };

    if (isNew) {
      const siblingItems = allItems.filter((i) => i.category_id === category_id);
      const maxOrder = siblingItems.reduce((m, i) => Math.max(m, i.display_order ?? 0), -1);
      await menuService.createMenuItem({
        id: itemId,
        restaurant_id: restaurant.id,
        display_order: maxOrder + 1,
        ...payload,
      });
    } else {
      await menuService.updateMenuItem(selectedItem.id, { restaurant_id: restaurant.id, ...payload });
    }

    await refreshMenu();
    setItemEditorVisible(false);
    setSelectedItem(null);
  }, [selectedItem, restaurant?.id, refreshMenu, allItems]);

  const handleDeleteFromEditor = useCallback(async (itemId) => {
    try {
      await menuService.deleteMenuItem(itemId, restaurant.id);
      await refreshMenu();
    } finally {
      setItemEditorVisible(false);
      setSelectedItem(null);
    }
  }, [restaurant?.id, refreshMenu]);

  // ── Category CRUD ─────────────────────────────────────────────────────────

  const handleAddCategory = useCallback(() => {
    setSelectedCategory(null);
    setCatEditorVisible(true);
  }, []);

  const handleEditCategory = useCallback((category) => {
    setSelectedCategory(category);
    setCatEditorVisible(true);
  }, []);

  const persistCategory = useCallback(async ({ name, menu_type, id }) => {
    if (!restaurant?.id) {
      throw new Error('Restaurant not loaded. Refresh the page and try again.');
    }
    if (id) {
      await menuService.updateCategory(id, { name });
    } else {
      await menuService.createCategory({ restaurant_id: restaurant.id, name, menu_type });
    }
    await refreshMenu();
    setCatEditorVisible(false);
    setSelectedCategory(null);
  }, [restaurant?.id, refreshMenu]);

  const handleDeleteCategory = useCallback(async (categoryId) => {
    await menuService.deleteCategory(categoryId, restaurant.id);
    await refreshMenu();
    setCatEditorVisible(false);
    setSelectedCategory(null);
  }, [restaurant?.id, refreshMenu]);

  // ── Refresh ───────────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshMenu(), refreshCarousel()]);
    setRefreshing(false);
  }, [refreshMenu, refreshCarousel]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const activeCategory = activeCategoryId || categories[0]?.id;
  const isEmpty = !loading && categorizedMenu.length === 0;

  const renderInfoBar = () => (
    <View style={[styles.infoBar, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
      <View style={styles.infoBarInner}>
        <View style={styles.infoLeft}>
          {restaurant?.name ? (
            <Text style={[styles.infoName, { color: c.textPrimary }]}>{restaurant.name}</Text>
          ) : null}
          <View style={styles.infoMeta}>
            {restaurant?.address ? (
              <View style={styles.infoMetaItem}>
                <Ionicons name="location-outline" size={13} color={c.textSecondary} />
                <Text style={[styles.infoMetaText, { color: c.textSecondary }]} numberOfLines={1}>
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
            style={[styles.phoneBtn, { borderColor: c.border }]}
            onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
            activeOpacity={0.7}
          >
            <Ionicons name="call-outline" size={14} color={c.brand} />
            <Text style={[styles.phoneBtnText, { color: c.brand }]}>
              {restaurant.phone}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderCategoryContent = () => (
    <>
      {categorizedMenu.map((category) => (
        <View
          key={category.id}
          ref={(ref) => { if (ref) sectionRefs.current[category.id] = ref; }}
        >
          <AdminCategorySection
            category={category}
            items={category.items ?? []}
            onEdit={handleEditItem}
            onToggleAvailability={handleToggleAvailability}
            togglingId={togglingId}
            onItemsReordered={handleItemsReordered}
            onEditCategory={handleEditCategory}
          />
        </View>
      ))}
      <View style={{ height: 40 }} />
    </>
  );

  // ── Desktop sidebar ───────────────────────────────────────────────────────

  const renderDesktopSidebar = () => (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        borderRight: `1px solid ${c.border}`,
        paddingTop: 16,
        paddingBottom: 24,
        paddingRight: 8,
        maxHeight: '100vh',
        overflowY: 'auto',
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleCategoryDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {categories.map((category) => (
            <SortableSidebarCategory
              key={category.id}
              category={category}
              isActive={category.id === activeCategory}
              onPress={() => scrollToCategory(category.id)}
              onEdit={() => handleEditCategory(category)}
              theme={theme}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add Category button */}
      <TouchableOpacity
        style={[styles.sidebarAddCatBtn, { borderColor: c.brand }]}
        onPress={handleAddCategory}
        activeOpacity={0.75}
      >
        <Ionicons name="add-circle-outline" size={14} color={c.brand} />
        <Text style={[styles.sidebarAddCatText, { color: c.brand }]}>
          Add Category
        </Text>
      </TouchableOpacity>
    </div>
  );

  // ── Mobile chip nav ───────────────────────────────────────────────────────

  const renderMobileChips = () => (
    <View style={[styles.mobileNav, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleCategoryDragEnd}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
      >
        <SortableContext
          items={categories.map((cat) => cat.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 10,
              alignItems: 'center',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {categories.map((category) => (
              <SortableMobileChip
                key={category.id}
                category={category}
                isActive={category.id === activeCategory}
                onPress={() => scrollToCategory(category.id)}
                theme={theme}
              />
            ))}
            {/* Add Category chip */}
            <TouchableOpacity
              style={[
                styles.addCategoryChip,
                { borderColor: c.brand, backgroundColor: c.backgroundCard },
              ]}
              onPress={handleAddCategory}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={14} color={c.brand} />
              <Text style={[styles.addCategoryChipText, { color: c.brand }]}>
                Category
              </Text>
            </TouchableOpacity>
          </div>
        </SortableContext>
      </DndContext>
    </View>
  );

  // ── Root render ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Tab switcher */}
      <View style={[styles.tabBar, { backgroundColor: c.backgroundCard, borderBottomColor: c.border }]}>
        {MENU_TABS.map((tab) => {
          const isActive = tab.key === activeMenuType;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive && { borderBottomColor: c.brand },
              ]}
              onPress={() => setActiveMenuType(tab.key)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={tab.icon}
                size={15}
                color={isActive ? c.brand : c.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: c.textSecondary },
                  isActive && { color: c.brand },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Add Item button — lives in the tab bar on the right */}
        <View style={styles.tabBarRight}>
          <TouchableOpacity
            style={[styles.addItemBtn, { backgroundColor: c.brand }]}
            onPress={() => handleAddItem(categories[0] ?? { id: '' })}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={15} color={c.brandText} />
            <Text style={[styles.addItemBtnText, { color: c.brandText }]}>Add Item</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main scroll area */}
      {loading && !categorizedMenu.length ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={isEmpty ? styles.scrollEmpty : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.brand}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Carousel (regular menu only) */}
          {activeMenuType === 'regular' && <MenuCarousel slides={slides} />}

          {/* Info bar */}
          {renderInfoBar()}

          {/* Content */}
          {isEmpty ? (
            <AdminEmptyState
              icon={activeMenuType === 'catering' ? '🍱' : '🍽️'}
              title={`No ${activeMenuType === 'catering' ? 'catering' : 'regular menu'} items yet`}
              subtitle="Add a category first, then add items."
              actionLabel="+ Add Category"
              onAction={handleAddCategory}
            />
          ) : (
            <View
              style={[
                styles.menuLayout,
                isDesktop && styles.menuLayoutDesktop,
              ]}
            >
              {/* Desktop: sticky sidebar */}
              {isDesktop && Platform.OS === 'web' && renderDesktopSidebar()}

              {/* Mobile: chip nav */}
              {!isDesktop && Platform.OS === 'web' && renderMobileChips()}

              {/* Items column */}
              <View
                style={[
                  styles.menuItems,
                  isDesktop && styles.menuItemsDesktop,
                ]}
              >
                {renderCategoryContent()}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Item editor floating card */}
      <MenuItemEditor
        visible={itemEditorVisible}
        item={selectedItem}
        categories={categories}
        onSave={persistMenuItem}
        onDelete={handleDeleteFromEditor}
        onClose={() => {
          setItemEditorVisible(false);
          setSelectedItem(null);
        }}
      />

      {/* Category editor floating card */}
      <CategoryEditor
        visible={catEditorVisible}
        category={selectedCategory}
        menuType={activeMenuType}
        onSave={persistCategory}
        onDelete={handleDeleteCategory}
        onClose={() => {
          setCatEditorVisible(false);
          setSelectedCategory(null);
        }}
      />
    </View>
  );
}

// ── Sidebar item styles (used by SortableSidebarCategory) ──────────────────────
const sidebarStyles = StyleSheet.create({
  item: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  itemText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  editBtn: {
    padding: 6,
    borderRadius: 4,
    marginRight: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollEmpty: {
    flexGrow: 1,
  },

  // ── Tab bar
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabBarRight: {
    flex: 1,
    alignItems: 'flex-end',
    paddingVertical: 8,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addItemBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Info bar (mirrors MenuScreen)
  infoBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  statusPillOpen: { backgroundColor: '#D1FAE5' },
  statusPillClosed: { backgroundColor: '#FEE2E2' },
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
  },
  phoneBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Layout (mirrors MenuScreen)
  menuLayout: {
    flex: 1,
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

  // ── Mobile nav
  mobileNav: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  addCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexShrink: 0,
  },
  addCategoryChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Sidebar add category button
  sidebarAddCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  sidebarAddCatText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
