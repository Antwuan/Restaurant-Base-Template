import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { confirmAsync } from '../../utils/confirm';

function showError(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export default function CategoryEditor({
  visible,
  category = null,
  menuType = 'regular',
  onSave,
  onDelete,
  onClose,
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEdit = !!category?.id;

  useEffect(() => {
    if (visible) {
      setName(category?.name ?? '');
      setNameError('');
    }
  }, [visible, category]);

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Category name is required');
      return;
    }
    setNameError('');
    setSaving(true);
    try {
      await onSave({ name: name.trim(), menu_type: menuType, id: category?.id });
    } catch (e) {
      showError('Error', e.message || 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmAsync({
      title: 'Delete Category',
      message: `Delete "${category.name}"? This cannot be undone. All items must be removed first.`,
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete(category.id);
    } catch (e) {
      showError('Cannot Delete', e.message || 'Failed to delete category.');
      setDeleting(false);
    }
  };

  const menuTypeLabel = menuType === 'catering' ? 'Catering Menu' : 'Regular Menu';

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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: c.textPrimary }]}>
                {isEdit ? 'Edit Category' : 'New Category'}
              </Text>
              <View style={styles.typeBadge}>
                <Ionicons
                  name={menuType === 'catering' ? 'restaurant-outline' : 'grid-outline'}
                  size={12}
                  color={c.textSecondary}
                />
                <Text style={[styles.typeBadgeText, { color: c.textSecondary }]}>
                  {menuTypeLabel}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={c.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Name field */}
          <View style={styles.body}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Category Name *</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: c.textPrimary,
                  backgroundColor: c.backgroundSunken,
                  borderColor: c.border,
                },
                nameError ? styles.inputError : null,
              ]}
              value={name}
              onChangeText={(v) => { setName(v); setNameError(''); }}
              placeholder="e.g. Appetizers"
              placeholderTextColor={c.textDisabled}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {isEdit && (
              <TouchableOpacity
                style={[
                  styles.deleteBtn,
                  { backgroundColor: theme.mode === 'dark' ? 'rgba(239,68,68,0.15)' : '#fef2f2' },
                  deleting && styles.btnDisabled,
                ]}
                onPress={handleDelete}
                disabled={deleting || saving}
              >
                {deleting
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Ionicons name="trash-outline" size={18} color="#ef4444" />
                }
              </TouchableOpacity>
            )}
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
                ? <ActivityIndicator size="small" color={c.brandText} />
                : (
                  <Text style={[styles.saveBtnText, { color: c.brandText }]}>
                    {isEdit ? 'Save' : 'Create'}
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
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  typeBadgeText: {
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
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
    paddingVertical: 12,
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
