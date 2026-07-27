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
import { useTheme } from '../../theme';
import { confirmAsync } from '../../utils/confirm';

const DEFAULT_FORM = {
  name: '',
  description: '',
  price: '',
  cost: '',
  category_id: '',
  image_url: '',
  is_available: true,
};

function emptyGroup(partial = {}) {
  return {
    localId: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    selection_type: 'single',
    is_required: true,
    min_select: 1,
    max_select: 1,
    options: [emptyOption()],
    ...partial,
  };
}

function emptyOption(partial = {}) {
  return {
    localId: `o-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    price_delta: '0',
    is_default: false,
    is_available: true,
    ...partial,
  };
}

function groupsFromItem(item) {
  const groups = item?.modifier_groups;
  if (!Array.isArray(groups) || !groups.length) return [];
  return groups.map((g) => ({
    localId: g.id || `g-${Math.random().toString(36).slice(2, 7)}`,
    id: g.id,
    name: g.name || '',
    selection_type: g.selection_type === 'multi' ? 'multi' : 'single',
    is_required: !!g.is_required,
    min_select: g.min_select ?? (g.is_required ? 1 : 0),
    max_select: g.max_select ?? (g.selection_type === 'multi' ? 99 : 1),
    options: (g.options || []).map((o) => ({
      localId: o.id || `o-${Math.random().toString(36).slice(2, 7)}`,
      id: o.id,
      name: o.name || '',
      price_delta: o.price_delta != null ? String(o.price_delta) : '0',
      is_default: !!o.is_default,
      is_available: o.is_available !== false,
    })),
  }));
}

export default function MenuItemEditor({
  visible,
  item = null,
  categories = [],
  onSave,
  onDelete,
  onClose,
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [form, setForm] = useState(DEFAULT_FORM);
  const [localImageUri, setLocalImageUri] = useState(null);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState({});
  const [categoryOpen, setCategoryOpen] = useState(false);

  const isEdit = !!item?.id;
  const selectedCategory = categories.find((cat) => cat.id === form.category_id);

  useEffect(() => {
    if (visible) {
      if (item) {
        setForm({
          name: item.name || '',
          description: item.description || '',
          price: item.price != null ? String(item.price) : '',
          cost: item.cost != null ? String(item.cost) : '',
          category_id: item.category_id || '',
          image_url: item.image_url || '',
          is_available: item.is_available ?? true,
        });
        setModifierGroups(groupsFromItem(item));
      } else {
        setForm({
          ...DEFAULT_FORM,
          category_id: item?.category_id ?? '',
        });
        setModifierGroups([]);
      }
      setLocalImageUri(null);
      setErrors({});
      setCategoryOpen(false);
    }
  }, [visible, item]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const updateGroup = (localId, patch) => {
    setModifierGroups((prev) =>
      prev.map((g) => (g.localId === localId ? { ...g, ...patch } : g))
    );
  };

  const updateOption = (groupLocalId, optionLocalId, patch) => {
    setModifierGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g;
        return {
          ...g,
          options: g.options.map((o) =>
            o.localId === optionLocalId ? { ...o, ...patch } : o
          ),
        };
      })
    );
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.price.trim()) {
      newErrors.price = 'Price is required';
    } else if (isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0) {
      newErrors.price = 'Enter a valid price';
    }
    if (form.cost.trim() && (isNaN(parseFloat(form.cost)) || parseFloat(form.cost) < 0)) {
      newErrors.cost = 'Enter a valid cost';
    }
    if (!form.category_id) newErrors.category_id = 'Select a category';

    for (const g of modifierGroups) {
      if (!g.name.trim()) {
        newErrors.modifiers = 'Each customization group needs a name';
        break;
      }
      const namedOpts = g.options.filter((o) => o.name.trim());
      if (!namedOpts.length) {
        newErrors.modifiers = `"${g.name || 'Group'}" needs at least one option`;
        break;
      }
    }

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
      const serializedGroups = modifierGroups.map((g, gi) => ({
        name: g.name.trim(),
        selection_type: g.selection_type,
        is_required: !!g.is_required,
        min_select: g.selection_type === 'single'
          ? (g.is_required ? 1 : 0)
          : (g.is_required ? Math.max(1, Number(g.min_select) || 1) : 0),
        max_select: g.selection_type === 'single'
          ? 1
          : Math.max(1, Number(g.max_select) || g.options.filter((o) => o.name.trim()).length || 1),
        display_order: gi,
        options: g.options
          .filter((o) => o.name.trim())
          .map((o, oi) => ({
            name: o.name.trim(),
            price_delta: parseFloat(o.price_delta) || 0,
            is_default: !!o.is_default,
            is_available: o.is_available !== false,
            display_order: oi,
          })),
      }));

      await onSave({
        ...form,
        price: parseFloat(form.price),
        cost: form.cost.trim() !== '' ? parseFloat(form.cost) : null,
        localImageUri,
        modifierGroups: serializedGroups,
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

        <View style={[styles.card, { backgroundColor: c.backgroundCard }]}>
          {/* Hero image — tap to pick */}
          <TouchableOpacity
            style={[styles.heroZone, { backgroundColor: c.backgroundSunken }]}
            onPress={handlePickImage}
            activeOpacity={0.88}
            accessibilityLabel="Tap to change photo"
          >
            {imageSource ? (
              <Image source={{ uri: imageSource }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Ionicons name="camera-outline" size={36} color={c.textSecondary} />
                <Text style={[styles.heroPlaceholderText, { color: c.textSecondary }]}>
                  Tap to add photo
                </Text>
              </View>
            )}
            {/* Edit overlay */}
            <View style={styles.heroOverlay}>
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.heroOverlayText}>{imageSource ? 'Change' : 'Add Photo'}</Text>
            </View>
          </TouchableOpacity>

          {/* Close button */}
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: c.backgroundCard }]}
            onPress={onClose}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={c.textPrimary} />
          </TouchableOpacity>

          {/* Scrollable form body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title */}
            <Text style={[styles.screenTitle, { color: c.textPrimary }]}>
              {isEdit ? 'Edit Item' : 'New Item'}
            </Text>

            {/* Name */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.textSecondary }]}>Item Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: c.textPrimary,
                    backgroundColor: c.backgroundSunken,
                    borderColor: c.border,
                  },
                  errors.name && styles.inputError,
                ]}
                value={form.name}
                onChangeText={(v) => setField('name', v)}
                placeholder="e.g. Margherita Pizza"
                placeholderTextColor={c.textDisabled}
              />
              {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.textSecondary }]}>Description</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    color: c.textPrimary,
                    backgroundColor: c.backgroundSunken,
                    borderColor: c.border,
                  },
                ]}
                value={form.description}
                onChangeText={(v) => setField('description', v)}
                placeholder="Brief description of the item..."
                placeholderTextColor={c.textDisabled}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Price + Cost row */}
            <View style={styles.priceRow}>
              <View style={[styles.field, styles.priceCol]}>
                <Text style={[styles.label, { color: c.textSecondary }]}>Price ($) *</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.priceInput,
                    {
                      color: c.textPrimary,
                      backgroundColor: c.backgroundSunken,
                      borderColor: c.border,
                    },
                    errors.price && styles.inputError,
                  ]}
                  value={form.price}
                  onChangeText={(v) => setField('price', v)}
                  placeholder="0.00"
                  placeholderTextColor={c.textDisabled}
                  keyboardType="decimal-pad"
                />
                {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}
              </View>

              <View style={[styles.field, styles.priceCol]}>
                <Text style={[styles.label, { color: c.textSecondary }]}>Cost ($)</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.priceInput,
                    {
                      color: c.textPrimary,
                      backgroundColor: c.backgroundSunken,
                      borderColor: c.border,
                    },
                    errors.cost && styles.inputError,
                  ]}
                  value={form.cost}
                  onChangeText={(v) => setField('cost', v)}
                  placeholder="0.00"
                  placeholderTextColor={c.textDisabled}
                  keyboardType="decimal-pad"
                />
                {errors.cost ? (
                  <Text style={styles.errorText}>{errors.cost}</Text>
                ) : (
                  <Text style={[styles.fieldHint, { color: c.textDisabled }]}>
                    Used to calculate profit margin in Analytics
                  </Text>
                )}
              </View>
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.textSecondary }]}>Category *</Text>
              <TouchableOpacity
                style={[
                  styles.categoryField,
                  {
                    borderColor: errors.category_id ? '#ef4444' : c.border,
                    backgroundColor: c.backgroundSunken,
                  },
                ]}
                onPress={() => setCategoryOpen(true)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.categoryFieldText,
                    { color: selectedCategory ? c.textPrimary : c.textDisabled },
                  ]}
                  numberOfLines={1}
                >
                  {selectedCategory?.name || 'Select a category'}
                </Text>
                <Ionicons name="chevron-down" size={14} color={c.textSecondary} />
              </TouchableOpacity>
              {errors.category_id ? <Text style={styles.errorText}>{errors.category_id}</Text> : null}

              <Modal
                visible={categoryOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setCategoryOpen(false)}
                statusBarTranslucent
              >
                <Pressable style={styles.categoryBackdrop} onPress={() => setCategoryOpen(false)}>
                  <View style={[styles.categoryDropdownCard, { backgroundColor: c.backgroundCard }]}>
                    <ScrollView
                      style={styles.categoryDropdownScroll}
                      showsVerticalScrollIndicator
                      contentContainerStyle={{ paddingVertical: 4 }}
                      keyboardShouldPersistTaps="handled"
                    >
                      {categories.length === 0 ? (
                        <Text style={[styles.categoryEmpty, { color: c.textSecondary }]}>
                          No categories yet
                        </Text>
                      ) : (
                        categories.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={[
                              styles.categoryOption,
                              form.category_id === cat.id && styles.categoryOptionActive,
                            ]}
                            onPress={() => {
                              setField('category_id', cat.id);
                              setCategoryOpen(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.categoryOptionText,
                                { color: c.textPrimary },
                                form.category_id === cat.id && styles.categoryOptionActiveText,
                              ]}
                            >
                              {cat.name}
                            </Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </Pressable>
              </Modal>
            </View>

            {/* Customizations */}
            <View style={styles.field}>
              <View style={styles.modHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: c.textSecondary }]}>Customizations</Text>
                  <Text style={[styles.fieldHint, { color: c.textDisabled }]}>
                    Option groups (Size, Protein) and priced add-ons
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.modAddBtn, { borderColor: c.border }]}
                  onPress={() => setModifierGroups((prev) => [...prev, emptyGroup()])}
                >
                  <Ionicons name="add" size={16} color={c.brand} />
                  <Text style={[styles.modAddBtnText, { color: c.brand }]}>Group</Text>
                </TouchableOpacity>
              </View>
              {errors.modifiers ? <Text style={styles.errorText}>{errors.modifiers}</Text> : null}

              {modifierGroups.map((group) => (
                <View
                  key={group.localId}
                  style={[styles.modGroupCard, { borderColor: c.border, backgroundColor: c.backgroundSunken }]}
                >
                  <View style={styles.modGroupTop}>
                    <TextInput
                      style={[styles.input, styles.modGroupName, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.backgroundCard }]}
                      value={group.name}
                      onChangeText={(v) => updateGroup(group.localId, { name: v })}
                      placeholder="Group name (e.g. Size)"
                      placeholderTextColor={c.textDisabled}
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setModifierGroups((prev) => prev.filter((g) => g.localId !== group.localId))
                      }
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modTypeRow}>
                    <TouchableOpacity
                      style={[
                        styles.modChip,
                        { borderColor: c.border },
                        group.selection_type === 'single' && { backgroundColor: c.brand, borderColor: c.brand },
                      ]}
                      onPress={() =>
                        updateGroup(group.localId, {
                          selection_type: 'single',
                          max_select: 1,
                          min_select: group.is_required ? 1 : 0,
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.modChipText,
                          { color: group.selection_type === 'single' ? '#fff' : c.textSecondary },
                        ]}
                      >
                        Single choice
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modChip,
                        { borderColor: c.border },
                        group.selection_type === 'multi' && { backgroundColor: c.brand, borderColor: c.brand },
                      ]}
                      onPress={() =>
                        updateGroup(group.localId, {
                          selection_type: 'multi',
                          max_select: Math.max(group.max_select || 1, group.options.length || 1),
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.modChipText,
                          { color: group.selection_type === 'multi' ? '#fff' : c.textSecondary },
                        ]}
                      >
                        Add-ons
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.modRequiredRow}>
                      <Text style={[styles.modChipText, { color: c.textSecondary }]}>Required</Text>
                      <Switch
                        value={!!group.is_required}
                        onValueChange={(v) =>
                          updateGroup(group.localId, {
                            is_required: v,
                            min_select: v ? 1 : 0,
                          })
                        }
                        trackColor={{ false: c.border, true: '#34c759' }}
                        style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                      />
                    </View>
                  </View>

                  {group.options.map((opt) => (
                    <View key={opt.localId} style={styles.modOptionRow}>
                      <TextInput
                        style={[styles.input, styles.modOptName, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.backgroundCard }]}
                        value={opt.name}
                        onChangeText={(v) => updateOption(group.localId, opt.localId, { name: v })}
                        placeholder="Option"
                        placeholderTextColor={c.textDisabled}
                      />
                      <TextInput
                        style={[styles.input, styles.modOptPrice, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.backgroundCard }]}
                        value={opt.price_delta}
                        onChangeText={(v) => updateOption(group.localId, opt.localId, { price_delta: v })}
                        placeholder="+0.00"
                        placeholderTextColor={c.textDisabled}
                        keyboardType="decimal-pad"
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setModifierGroups((prev) =>
                            prev.map((g) =>
                              g.localId !== group.localId
                                ? g
                                : {
                                    ...g,
                                    options: g.options.filter((o) => o.localId !== opt.localId),
                                  }
                            )
                          )
                        }
                        hitSlop={6}
                      >
                        <Ionicons name="close" size={16} color="#aaa" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.modAddOption}
                    onPress={() =>
                      setModifierGroups((prev) =>
                        prev.map((g) =>
                          g.localId === group.localId
                            ? { ...g, options: [...g.options, emptyOption()] }
                            : g
                        )
                      )
                    }
                  >
                    <Ionicons name="add-circle-outline" size={16} color={c.brand} />
                    <Text style={[styles.modAddOptionText, { color: c.brand }]}>Add option</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Availability */}
            <View style={styles.field}>
              <View
                style={[
                  styles.toggleRow,
                  {
                    backgroundColor: c.backgroundSunken,
                    borderColor: c.border,
                  },
                ]}
              >
                <View>
                  <Text style={[styles.label, { color: c.textSecondary }]}>Available</Text>
                  <Text style={[styles.toggleSubtext, { color: c.textDisabled }]}>
                    {form.is_available ? 'Showing on menu' : 'Hidden from menu'}
                  </Text>
                </View>
                <Switch
                  value={form.is_available}
                  onValueChange={(v) => setField('is_available', v)}
                  trackColor={{ false: c.border, true: '#34c759' }}
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
          <View style={[styles.footer, { borderTopColor: c.border }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: c.border }]}
              onPress={onClose}
              disabled={saving || deleting}
            >
              <Text style={[styles.cancelBtnText, { color: c.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: c.brand },
                (saving || deleting) && styles.btnDisabled,
              ]}
              onPress={handleSave}
              disabled={saving || deleting}
            >
              {saving
                ? <ActivityIndicator color={c.brandText} size="small" />
                : (
                  <Text style={[styles.saveBtnText, { color: c.brandText }]}>
                    {isEdit ? 'Save Changes' : 'Add Item'}
                  </Text>
                )}
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
    marginBottom: 18,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  textArea: {
    minHeight: 76,
    paddingTop: 11,
  },
  priceInput: {
    width: '100%',
  },
  priceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceCol: {
    flex: 1,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  categoryField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  categoryFieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    marginRight: 8,
  },
  categoryBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  categoryDropdownCard: {
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    maxHeight: 300,
    ...Platform.select({
      web: { boxShadow: '0 4px 24px rgba(0,0,0,0.15)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
    overflow: 'hidden',
  },
  categoryDropdownScroll: { maxHeight: 300 },
  categoryOption: { paddingVertical: 12, paddingHorizontal: 16 },
  categoryOptionActive: { backgroundColor: '#f0f0f0' },
  categoryOptionText: { fontSize: 15 },
  categoryOptionActiveText: { fontWeight: '700' },
  categoryEmpty: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  modHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  modAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modAddBtnText: { fontSize: 12, fontWeight: '600' },
  modGroupCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  modGroupTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modGroupName: {
    flex: 1,
    paddingVertical: 8,
    marginBottom: 0,
  },
  modTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  modChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modChipText: { fontSize: 11, fontWeight: '600' },
  modRequiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  modOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modOptName: {
    flex: 1,
    paddingVertical: 7,
    marginBottom: 0,
    fontSize: 13,
  },
  modOptPrice: {
    width: 72,
    paddingVertical: 7,
    marginBottom: 0,
    fontSize: 13,
    textAlign: 'center',
  },
  modAddOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  modAddOptionText: { fontSize: 12, fontWeight: '600' },
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
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
