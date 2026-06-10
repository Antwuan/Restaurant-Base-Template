// Admin menu editor — preview-first design.
// Shows the menu exactly as customers see it (MenuCarousel → RestaurantHeader →
// category/item cards) but each card uses AdminMenuItem with Edit / Delete /
// availability-toggle controls. A toolbar at the top lets admins add items or
// manage categories. Changes persist immediately to Supabase and the preview
// re-renders live via useMenu.refetch().
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import RestaurantHeader from '../../components/RestaurantHeader';
import AdminCategorySection from '../../components/admin/AdminCategorySection';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import MenuItemEditor from '../../components/admin/MenuItemEditor';

// Generates a simple unique id for new items before they're saved
const newItemId = () => `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function MenuEditorScreen() {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();

  const {
    categories,
    allItems,
    loading,
    refetch: refreshMenu,
  } = useMenu(restaurant?.id);

  const { slides, refetch: refreshCarousel } = useCarousel(restaurant?.id);

  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Group all items (including unavailable) by category for the admin preview
  const categorizedMenu = menuService.groupItemsByCategory(categories, allItems);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddItem = useCallback((category) => {
    setSelectedItem({
      category_id: category?.id ?? '',
      restaurant_id: restaurant?.id,
    });
    setEditorVisible(true);
  }, [restaurant?.id]);

  const handleEditItem = useCallback((item) => {
    setSelectedItem(item);
    setEditorVisible(true);
  }, []);

  const handleDeleteItem = useCallback((item) => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await menuService.deleteMenuItem(item.id, restaurant.id);
              await refreshMenu();
            } catch (e) {
              Alert.alert('Error', 'Could not delete item.');
            }
          },
        },
      ],
    );
  }, [restaurant?.id, refreshMenu]);

  const handleToggleAvailability = useCallback(async (item) => {
    setTogglingId(item.id);
    try {
      await menuService.toggleItemAvailability(item.id, !item.is_available);
      await refreshMenu();
    } catch (e) {
      Alert.alert('Error', 'Could not update item availability.');
    } finally {
      setTogglingId(null);
    }
  }, [refreshMenu]);

  // Persist a menu item — mirrors CarouselEditorScreen.persistSlide
  const persistMenuItem = useCallback(async ({ name, description, price, category_id, image_url, is_available, localImageUri }) => {
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
      await menuService.createMenuItem({
        id: itemId,
        restaurant_id: restaurant.id,
        ...payload,
      });
    } else {
      await menuService.updateMenuItem(selectedItem.id, {
        restaurant_id: restaurant.id,
        ...payload,
      });
    }

    await refreshMenu();
    setEditorVisible(false);
    setSelectedItem(null);
  }, [selectedItem, restaurant?.id, refreshMenu]);

  const handleDeleteFromEditor = useCallback(async (itemId) => {
    try {
      await menuService.deleteMenuItem(itemId, restaurant.id);
      await refreshMenu();
    } finally {
      setEditorVisible(false);
      setSelectedItem(null);
    }
  }, [restaurant?.id, refreshMenu]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshMenu(), refreshCarousel()]);
    setRefreshing(false);
  }, [refreshMenu, refreshCarousel]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading && !categorizedMenu.length && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
      </View>
    );
  }

  const isEmpty = !loading && categorizedMenu.length === 0;

  return (
    <View style={styles.container}>
      {/* Admin toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View style={[styles.previewBadge, { backgroundColor: theme.colors.brandLight }]}>
            <Ionicons name="eye-outline" size={13} color={theme.colors.brand} />
            <Text style={[styles.previewBadgeText, { color: theme.colors.brand }]}>
              Customer preview
            </Text>
          </View>
          <Text style={styles.toolbarSub}>
            {allItems.length} item{allItems.length !== 1 ? 's' : ''} · {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.colors.brand }]}
          onPress={() => handleAddItem(categories[0] ?? { id: '' })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Preview scroll area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={isEmpty ? styles.scrollEmpty : styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
          />
        }
      >
        {/* Promo carousel — exactly as customers see it */}
        <MenuCarousel slides={slides} />

        {/* Restaurant header — exactly as customers see it */}
        <RestaurantHeader restaurant={restaurant} />

        {isEmpty ? (
          <AdminEmptyState
            icon="🍽️"
            title="No menu items yet"
            subtitle="Add your first item to preview how customers will see your menu."
            actionLabel="+ Add Item"
            onAction={() => handleAddItem(categories[0] ?? { id: '' })}
          />
        ) : (
          <>
            {categorizedMenu.map((category) => (
              <AdminCategorySection
                key={category.id}
                category={category}
                items={category.items ?? []}
                onEdit={handleEditItem}
                onDelete={handleDeleteItem}
                onToggleAvailability={handleToggleAvailability}
                onAddItem={handleAddItem}
                togglingId={togglingId}
              />
            ))}
            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>

      {/* Item editor modal */}
      <Modal
        visible={editorVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setEditorVisible(false);
          setSelectedItem(null);
        }}
      >
        <MenuItemEditor
          item={selectedItem}
          categories={categories}
          onSave={persistMenuItem}
          onCancel={() => {
            setEditorVisible(false);
            setSelectedItem(null);
          }}
          onDelete={handleDeleteFromEditor}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 1px 0 #e5e7eb' },
    }),
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  previewBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarSub: {
    fontSize: 12,
    color: '#9ca3af',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    flexShrink: 0,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  scrollEmpty: {
    flexGrow: 1,
  },
});
