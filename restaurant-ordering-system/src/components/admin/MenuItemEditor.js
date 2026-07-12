// Admin floating-card editor for creating and editing menu items.
// Styled to match the customer MenuItemModal — centered card, dim backdrop,
// hero image at top — so admins immediately see what customers will see.
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { confirmAsync } from '../../utils/confirm';

const DEFAULT_FORM = {
  name: '',
  description: '',
  price: '',
  category_id: '',
  image_url: '',
  is_available: true,
};

export default function MenuItemEditor({
  visible,
  item = null,
  categories = [],
  onSave,
  onDelete,
  onClose,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [localImageUri, setLocalImageUri] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState({});

  const isEdit = !!item?.id;

  useEffect(() => {
    if (visible) {
      if (item) {
        setForm({
          name: item.name || '',
          description: item.description || '',
          price: item.price != null ? String(item.price) : '',
          category_id: item.category_id || '',
          image_url: item.image_url || '',
          is_available: item.is_available ?? true,
        });
      } else {
        setForm({
          ...DEFAULT_FORM,
          category_id: item?.category_id ?? '',
        });
      }
      setLocalImageUri(null);
      setErrors({});
    }
  }, [visible, item]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.price.trim()) {
      newErrors.price = 'Price is required';
    } else if (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) {
      newErrors.price = 'Enter a valid price';
    }
    if (!form.category_id) newErrors.category_id = 'Select a category';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        price: parseFloat(form.price),
        localImageUri,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmAsync({
      title: 'Delete Item',
      message: `Are you sure you want to delete "${form.name}"? This cannot be undone.`,
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to delete item.');
      setDeleting(false);
    }
  };

  const imageSource = localImageUri || form.image_url || null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.card}>
          {/* Hero image — tap to pick */}
          <TouchableOpacity
            style={styles.heroZone}
            onPress={handlePickImage}
            activeOpacity={0.88}
            accessibilityLabel="Tap to change photo"
          >
            {imageSource ? (
              <Image source={{ uri: imageSource }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Ionicons name="camera-outline" size={36} color="#9ca3af" />
                <Text style={styles.heroPlaceholderText}>Tap to add photo</Text>
              </View>
            )}
            {/* Edit overlay */}
            <View style={styles.heroOverlay}>
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.heroOverlayText}>{imageSource ? 'Change' : 'Add Photo'}</Text>
            </View>
          </TouchableOpacity>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color="#1a1a1a" />
          </TouchableOpacity>

          {/* Scrollable form body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Text style={styles.screenTitle}>{isEdit ? 'Edit Item' : 'New Item'}</Text>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Item Name *</Text>
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                placeholder="e.g. Margherita Pizza"
                placeholderTextColor="#aaa"
              />
              {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.description}
                onChangeText={(v) => setField('description', v)}
                placeholder="Brief description of the item..."
                placeholderTextColor="#aaa"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Price */}
            <View style={styles.field}>
              <Text style={styles.label}>Price ($) *</Text>
              <TextInput
                style={[styles.input, styles.priceInput, errors.price && styles.inputError]}
                value={form.price}
                onChangeText={(v) => setField('price', v)}
                placeholder="0.00"
                placeholderTextColor="#aaa"
                keyboardType="decimal-pad"
              />
              {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text style={styles.label}>Category *</Text>
              <View style={[styles.categoryGrid, errors.category_id && styles.inputError]}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      form.category_id === cat.id && styles.categoryChipSelected,
                    ]}
                    onPress={() => setField('category_id', cat.id)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        form.category_id === cat.id && styles.categoryChipTextSelected,
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.category_id ? <Text style={styles.errorText}>{errors.category_id}</Text> : null}
            </View>

            {/* Availability */}
            <View style={styles.field}>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.label}>Available</Text>
                  <Text style={styles.toggleSubtext}>
                    {form.is_available ? 'Showing on menu' : 'Hidden from menu'}
                  </Text>
                </View>
                <Switch
                  value={form.is_available}
                  onValueChange={(v) => setField('is_available', v)}
                  trackColor={{ false: '#d1d5db', true: '#34c759' }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Delete (edit mode only) */}
            {isEdit && (
              <TouchableOpacity
                style={[styles.deleteBtnFull, deleting && styles.btnDisabled]}
                onPress={handleDelete}
                disabled={deleting || saving}
              >
                {deleting
                  ? <ActivityIndicator color="#ef4444" size="small" />
                  : <><Ionicons name="trash-outline" size={16} color="#ef4444" /><Text style={styles.deleteBtnText}>Delete Item</Text></>
                }
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Footer — Cancel / Save */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={saving || deleting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || deleting) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving || deleting}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Add Item'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  heroZone: {
    width: '100%',
    height: 200,
    backgroundColor: '#f3f4f6',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  heroPlaceholderText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroOverlayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    padding: 20,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 18,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  textArea: {
    minHeight: 76,
    paddingTop: 11,
  },
  priceInput: {
    width: 140,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderRadius: 8,
    borderWidth: 0,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  categoryChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  deleteBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    marginTop: 4,
    marginBottom: 4,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
