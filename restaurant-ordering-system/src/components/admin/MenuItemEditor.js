// Admin form for creating and editing menu items. Uses React hooks, React Native
// inputs/layout, `expo-image-picker` for image selection, and delegates saving,
// deletion, and Supabase image upload handling to callbacks from the parent screen.
import React, { useState, useEffect } from 'react';
import {
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const DEFAULT_FORM = {
  name: '',
  description: '',
  price: '',
  category_id: '',
  image_url: '',
  is_available: true,
};

export default function MenuItemEditor({
  item = null,
  categories = [],
  onSave,
  onDelete,
  onCancel,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [localImageUri, setLocalImageUri] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
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
      setForm(DEFAULT_FORM);
    }
  }, [item]);

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

  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${form.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete(item.id);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete item.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const imageSource = localImageUri || form.image_url || null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{item ? 'Edit Menu Item' : 'New Menu Item'}</Text>

      <TouchableOpacity style={styles.imagePicker} onPress={handlePickImage} activeOpacity={0.8}>
        {imageSource ? (
          <Image source={{ uri: imageSource }} style={styles.imagePreview} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderIcon}>📷</Text>
            <Text style={styles.imagePlaceholderText}>Tap to add photo</Text>
          </View>
        )}
        {imageSource && (
          <View style={styles.imageOverlay}>
            <Text style={styles.imageOverlayText}>Change</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.field}>
        <Text style={styles.label}>Item Name *</Text>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          value={form.name}
          onChangeText={(v) => setField('name', v)}
          placeholder="e.g. Margherita Pizza"
          placeholderTextColor="#AAA"
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.description}
          onChangeText={(v) => setField('description', v)}
          placeholder="Brief description of the item..."
          placeholderTextColor="#AAA"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Price ($) *</Text>
        <TextInput
          style={[styles.input, styles.priceInput, errors.price && styles.inputError]}
          value={form.price}
          onChangeText={(v) => setField('price', v)}
          placeholder="0.00"
          placeholderTextColor="#AAA"
          keyboardType="decimal-pad"
        />
        {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
      </View>

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
        {errors.category_id && <Text style={styles.errorText}>{errors.category_id}</Text>}
      </View>

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
            trackColor={{ false: '#DDD', true: '#34C759' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>{item ? 'Save Changes' : 'Add Item'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {item && (
        <TouchableOpacity
          style={[styles.deleteButton, deleting && styles.buttonDisabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#DC3545" size="small" />
          ) : (
            <Text style={styles.deleteButtonText}>🗑 Delete Item</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
  },
  imagePicker: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
  },
  imagePlaceholderIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  imagePlaceholderText: {
    fontSize: 14,
    color: '#AAA',
    fontWeight: '500',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageOverlayText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  inputError: {
    borderColor: '#DC3545',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 11,
  },
  priceInput: {
    width: 140,
  },
  errorText: {
    color: '#DC3545',
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
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  categoryChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deleteButton: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DC3545',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC3545',
  },
});

