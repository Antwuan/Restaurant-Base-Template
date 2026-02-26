// Admin menu management screen. Groups items by category using `useMenu`,
// lets admins toggle availability, edit/delete items, and opens the shared
// `MenuItemEditor` modal for creating/updating items.
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useMenu } from '../../hooks/useMenu';
import { useRestaurantContext } from '../../context/RestaurantContext';
import * as menuService from '../../services/menuService';
import MenuItemEditor from '../../components/admin/MenuItemEditor';

export default function MenuEditorScreen() {
  const { restaurant } = useRestaurantContext();
  const {
    categories,
    allItems,
    loading,
    refetch: refreshMenu,
  } = useMenu(restaurant?.id);

  const categorizedMenu = menuService.groupItemsByCategory(categories, allItems);

  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const handleToggleAvailability = async (item) => {
    setTogglingId(item.id);
    try {
      await menuService.toggleItemAvailability(item.id, !item.is_available);
      await refreshMenu();
    } catch (e) {
      Alert.alert('Error', 'Could not update item availability.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteItem = (item) => {
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
  };

  const handleEditItem = (item) => {
    setSelectedItem(item);
    setEditorVisible(true);
  };

  const handleAddItem = (category) => {
    setSelectedItem({ category_id: category.id, restaurant_id: restaurant.id });
    setEditorVisible(true);
  };

  const handleSave = async () => {
    setEditorVisible(false);
    setSelectedItem(null);
    await refreshMenu();
  };

  const renderItem = ({ item }) => (
    <View style={styles.menuItem}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemPrice}>${Number(item.price).toFixed(2)}</Text>
      </View>
      <View style={styles.itemActions}>
        <Switch
          value={item.is_available}
          onValueChange={() => handleToggleAvailability(item)}
          disabled={togglingId === item.id}
          trackColor={{ true: '#34C759', false: '#ccc' }}
          style={styles.toggle}
        />
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => handleEditItem(item)}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteItem(item)}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCategory = ({ item: category }) => (
    <View style={styles.categorySection}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryTitle}>{category.name}</Text>
        <TouchableOpacity
          style={styles.addItemBtn}
          onPress={() => handleAddItem(category)}
        >
          <Text style={styles.addItemBtnText}>+ Add Item</Text>
        </TouchableOpacity>
      </View>
      {category.items.map((menuItem) => renderItem({ item: menuItem }))}
    </View>
  );

  if (loading && !categorizedMenu.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={categorizedMenu}
        keyExtractor={(item) => item.id}
        renderItem={renderCategory}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshMenu} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>
              {categorizedMenu.reduce(
                (acc, c) => acc + (c.items?.length || 0),
                0,
              )}{' '}
              items across {categorizedMenu.length} categories
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      <Modal
        visible={editorVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditorVisible(false)}
      >
        <MenuItemEditor
          item={selectedItem}
          categories={categories}
          onSave={handleSave}
          onCancel={() => {
            setEditorVisible(false);
            setSelectedItem(null);
          }}
          onDelete={async (itemId) => {
            try {
              await menuService.deleteMenuItem(itemId, restaurant.id);
              await refreshMenu();
            } finally {
              setEditorVisible(false);
              setSelectedItem(null);
            }
          }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listHeader: {
    marginBottom: 12,
  },
  listHeaderText: {
    fontSize: 13,
    color: '#999',
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  addItemBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addItemBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  menuItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  itemPrice: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggle: {
    marginRight: 4,
  },
  editBtn: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editBtnText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 5,
  },
  deleteBtnText: {
    fontSize: 16,
    color: '#FF3B30',
  },
});

