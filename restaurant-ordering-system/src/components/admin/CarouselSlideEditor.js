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
  media_type: 'image',
  media_url: '',
  title: '',
  alt_text: '',
  link_url: '',
  is_active: true,
};

export default function CarouselSlideEditor({
  slide = null,
  onSave,
  onCancel,
}) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [localMediaUri, setLocalMediaUri] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (slide?.id) {
      setForm({
        media_type: slide.media_type || 'image',
        media_url: slide.media_url || '',
        title: slide.title || '',
        alt_text: slide.alt_text || '',
        link_url: slide.link_url || '',
        is_active: slide.is_active ?? true,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setLocalMediaUri(null);
  }, [slide]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your media library.');
      return;
    }

    const isVideo = form.media_type === 'video';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isVideo
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: !isVideo,
      aspect: isVideo ? undefined : [16, 9],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]) {
      setLocalMediaUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!localMediaUri && !form.media_url.trim()) {
      Alert.alert('Media required', 'Upload a file or enter a media URL.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...form,
        localMediaUri,
        id: slide?.id,
        storage_path: slide?.storage_path,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save slide.');
    } finally {
      setSaving(false);
    }
  };

  const previewUri = localMediaUri || form.media_url || null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        {slide?.id ? 'Edit Promo Slide' : 'New Promo Slide'}
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Media type</Text>
        <View style={styles.typeRow}>
          {['image', 'video'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeChip,
                form.media_type === type && styles.typeChipSelected,
              ]}
              onPress={() => setField('media_type', type)}
            >
              <Text
                style={[
                  styles.typeChipText,
                  form.media_type === type && styles.typeChipTextSelected,
                ]}
              >
                {type === 'image' ? 'Image' : 'Video'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.mediaPicker}
        onPress={handlePickMedia}
        activeOpacity={0.8}
      >
        {previewUri && form.media_type === 'image' ? (
          <Image source={{ uri: previewUri }} style={styles.mediaPreview} />
        ) : previewUri && form.media_type === 'video' ? (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoIcon}>🎬</Text>
            <Text style={styles.videoText}>Video selected</Text>
          </View>
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Text style={styles.mediaPlaceholderIcon}>📷</Text>
            <Text style={styles.mediaPlaceholderText}>
              Tap to upload {form.media_type}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.field}>
        <Text style={styles.label}>Or media URL</Text>
        <TextInput
          style={styles.input}
          value={form.media_url}
          onChangeText={(v) => setField('media_url', v)}
          placeholder="https://..."
          placeholderTextColor="#AAA"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Title (caption)</Text>
        <TextInput
          style={styles.input}
          value={form.title}
          onChangeText={(v) => setField('title', v)}
          placeholder="Optional caption"
          placeholderTextColor="#AAA"
        />
      </View>

      {form.media_type === 'image' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Alt text</Text>
          <TextInput
            style={styles.input}
            value={form.alt_text}
            onChangeText={(v) => setField('alt_text', v)}
            placeholder="Accessibility description"
            placeholderTextColor="#AAA"
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Link URL (optional)</Text>
        <TextInput
          style={styles.input}
          value={form.link_url}
          onChangeText={(v) => setField('link_url', v)}
          placeholder="https://..."
          placeholderTextColor="#AAA"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.label}>Active</Text>
          <Text style={styles.toggleSubtext}>
            {form.is_active ? 'Visible on menu' : 'Hidden from menu'}
          </Text>
        </View>
        <Switch
          value={form.is_active}
          onValueChange={(v) => setField('is_active', v)}
          trackColor={{ false: '#DDD', true: '#34C759' }}
          thumbColor="#fff"
        />
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
            <Text style={styles.saveButtonText}>Save Slide</Text>
          )}
        </TouchableOpacity>
      </View>
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
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  typeChipSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
  },
  typeChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  mediaPicker: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F8F8',
  },
  mediaPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  mediaPlaceholderText: {
    fontSize: 14,
    color: '#AAA',
    fontWeight: '500',
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  videoIcon: {
    fontSize: 36,
    marginBottom: 6,
  },
  videoText: {
    color: '#fff',
    fontSize: 14,
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 16,
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
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
});
