import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useCarousel } from '../../hooks/useCarousel';
import { useTheme } from '../../theme';
import * as carouselService from '../../services/carouselService';
import {
  uploadFileFromUri,
  carouselStoragePath,
} from '../../services/storageService';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import { confirmAsync } from '../../utils/confirm';

const DEFAULT_FORM = {
  media_type: 'image',
  media_url: '',
  title: '',
  alt_text: '',
  link_url: '',
  is_active: true,
};

function SlideEditorForm({ slide, restaurantId, onSave, onCancel }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [form, setForm] = useState(() => ({
    ...DEFAULT_FORM,
    ...slide,
    media_url: slide?.media_url || '',
  }));
  const [localUri, setLocalUri] = useState(null);
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const pickMedia = async (mediaType) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to upload media.');
      return;
    }

    const isVideo = mediaType === 'video';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isVideo
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: !isVideo,
      aspect: isVideo ? undefined : [16, 9],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setLocalUri(asset.uri);
      setField('media_type', isVideo ? 'video' : 'image');
    }
  };

  const handleSave = async () => {
    if (!form.media_url && !localUri) {
      Alert.alert('Missing media', 'Upload a file or paste a media URL.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ form, localUri });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save slide.');
    } finally {
      setSaving(false);
    }
  };

  const previewUri = localUri || form.media_url;

  return (
    <ScrollView
      style={[editorStyles.container, { backgroundColor: c.backgroundCard }]}
      contentContainerStyle={editorStyles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[editorStyles.title, { color: c.textPrimary }]}>
        {slide?.id ? 'Edit slide' : 'New slide'}
      </Text>

      <View style={editorStyles.typeRow}>
        <TouchableOpacity
          style={[
            editorStyles.typeChip,
            { borderColor: c.border },
            form.media_type === 'image' && {
              backgroundColor: c.brand,
              borderColor: c.brand,
            },
          ]}
          onPress={() => setField('media_type', 'image')}
        >
          <Text
            style={[
              editorStyles.typeChipText,
              { color: c.textPrimary },
              form.media_type === 'image' && { color: c.brandText },
            ]}
          >
            Image
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            editorStyles.typeChip,
            { borderColor: c.border },
            form.media_type === 'video' && {
              backgroundColor: c.brand,
              borderColor: c.brand,
            },
          ]}
          onPress={() => setField('media_type', 'video')}
        >
          <Text
            style={[
              editorStyles.typeChipText,
              { color: c.textPrimary },
              form.media_type === 'video' && { color: c.brandText },
            ]}
          >
            Video
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[editorStyles.uploadBtn, { backgroundColor: c.backgroundSunken }]}
        onPress={() => pickMedia(form.media_type)}
      >
        <Text style={[editorStyles.uploadBtnText, { color: c.textPrimary }]}>
          {form.media_type === 'video' ? 'Pick video' : 'Pick image'}
        </Text>
      </TouchableOpacity>

      {previewUri && form.media_type === 'image' ? (
        <Image source={{ uri: previewUri }} style={editorStyles.preview} />
      ) : null}

      <Text style={[editorStyles.label, { color: c.textSecondary }]}>Or media URL</Text>
      <TextInput
        style={[
          editorStyles.input,
          {
            color: c.textPrimary,
            backgroundColor: c.backgroundSunken,
            borderColor: c.border,
          },
        ]}
        value={form.media_url}
        onChangeText={(v) => setField('media_url', v)}
        placeholder="https://..."
        placeholderTextColor={c.textDisabled}
        autoCapitalize="none"
      />

      <Text style={[editorStyles.label, { color: c.textSecondary }]}>Title (caption)</Text>
      <TextInput
        style={[
          editorStyles.input,
          {
            color: c.textPrimary,
            backgroundColor: c.backgroundSunken,
            borderColor: c.border,
          },
        ]}
        value={form.title}
        onChangeText={(v) => setField('title', v)}
        placeholder="Optional"
        placeholderTextColor={c.textDisabled}
      />

      <Text style={[editorStyles.label, { color: c.textSecondary }]}>Alt text (images)</Text>
      <TextInput
        style={[
          editorStyles.input,
          {
            color: c.textPrimary,
            backgroundColor: c.backgroundSunken,
            borderColor: c.border,
          },
        ]}
        value={form.alt_text}
        onChangeText={(v) => setField('alt_text', v)}
        placeholder="Accessibility description"
        placeholderTextColor={c.textDisabled}
      />

      <Text style={[editorStyles.label, { color: c.textSecondary }]}>Link URL (tap-through)</Text>
      <TextInput
        style={[
          editorStyles.input,
          {
            color: c.textPrimary,
            backgroundColor: c.backgroundSunken,
            borderColor: c.border,
          },
        ]}
        value={form.link_url}
        onChangeText={(v) => setField('link_url', v)}
        placeholder="https://..."
        placeholderTextColor={c.textDisabled}
        autoCapitalize="none"
      />

      <View style={editorStyles.toggleRow}>
        <Text style={[editorStyles.label, { color: c.textSecondary, marginBottom: 0 }]}>
          Active on menu
        </Text>
        <Switch
          value={form.is_active}
          onValueChange={(v) => setField('is_active', v)}
        />
      </View>

      <View style={editorStyles.actions}>
        <TouchableOpacity
          style={[editorStyles.cancelBtn, { borderColor: c.border }]}
          onPress={onCancel}
        >
          <Text style={{ color: c.textPrimary }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            editorStyles.saveBtn,
            { backgroundColor: c.brand },
            saving && editorStyles.disabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={c.brandText} size="small" />
          ) : (
            <Text style={[editorStyles.saveBtnText, { color: c.brandText }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function newSlideId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function CarouselEditorScreen() {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const { slides, loading, refetch } = useCarousel(restaurant?.id, { admin: true });
  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const openNew = () => {
    setSelectedSlide({
      restaurant_id: restaurant.id,
      sort_order: slides.length,
    });
    setEditorVisible(true);
  };

  const openEdit = (slide) => {
    setSelectedSlide(slide);
    setEditorVisible(true);
  };

  const persistSlide = async ({ form, localUri }) => {
    let mediaUrl = form.media_url;
    let storagePath = selectedSlide?.storage_path || null;
    const slideId = selectedSlide?.id;
    const isNew = !slideId;

    if (localUri) {
      const ext = form.media_type === 'video' ? 'mp4' : 'jpg';
      const idForPath = slideId || newSlideId();
      storagePath = carouselStoragePath(restaurant.id, idForPath, ext);
      const contentType = form.media_type === 'video' ? 'video/mp4' : 'image/jpeg';
      const { publicUrl } = await uploadFileFromUri({
        path: storagePath,
        uri: localUri,
        contentType,
      });
      mediaUrl = publicUrl;

      if (isNew) {
        const created = await carouselService.createSlide({
          id: idForPath,
          restaurant_id: restaurant.id,
          media_type: form.media_type,
          media_url: mediaUrl,
          storage_path: storagePath,
          title: form.title || null,
          alt_text: form.alt_text || null,
          link_url: form.link_url || null,
          sort_order: form.sort_order ?? slides.length,
          is_active: form.is_active ?? true,
        });
        await refetch();
        setEditorVisible(false);
        return created;
      }
    }

    const payload = {
      media_type: form.media_type,
      media_url: mediaUrl,
      storage_path: storagePath,
      title: form.title || null,
      alt_text: form.alt_text || null,
      link_url: form.link_url || null,
      is_active: form.is_active ?? true,
    };

    if (isNew) {
      await carouselService.createSlide({
        restaurant_id: restaurant.id,
        ...payload,
        sort_order: slides.length,
      });
    } else {
      await carouselService.updateSlide(slideId, payload);
    }

    await refetch();
    setEditorVisible(false);
    setSelectedSlide(null);
  };

  const handleDelete = async (slide) => {
    const confirmed = await confirmAsync({
      title: 'Delete slide',
      message: 'Remove this carousel slide?',
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    try {
      await carouselService.deleteSlide(slide);
      await refetch();
    } catch {
      Alert.alert('Error', 'Could not delete slide.');
    }
  };

  const moveSlide = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;

    const reordered = [...slides];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(target, 0, removed);

    setBusyId(removed.id);
    try {
      await carouselService.reorderSlides(
        restaurant.id,
        reordered.map((s) => s.id),
      );
      await refetch();
    } catch {
      Alert.alert('Error', 'Could not reorder slides.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (slide) => {
    setBusyId(slide.id);
    try {
      await carouselService.updateSlide(slide.id, {
        is_active: !slide.is_active,
      });
      await refetch();
    } catch {
      Alert.alert('Error', 'Could not update slide.');
    } finally {
      setBusyId(null);
    }
  };

  const renderSlide = ({ item, index }) => (
    <View style={[styles.slideRow, { backgroundColor: c.backgroundCard }]}>
      {item.media_type === 'image' ? (
        <Image
          source={{ uri: item.media_url }}
          style={[styles.thumb, { backgroundColor: c.backgroundSunken }]}
        />
      ) : (
        <View style={[styles.thumb, styles.videoThumb, { backgroundColor: c.backgroundSunken }]}>
          <Text style={[styles.videoLabel, { color: c.textSecondary }]}>VIDEO</Text>
        </View>
      )}
      <View style={styles.slideInfo}>
        <Text style={[styles.slideTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {item.title || '(No title)'}
        </Text>
        <Text style={[styles.slideMeta, { color: c.textSecondary }]}>
          Order {item.sort_order}
          {item.is_active ? '' : ' · Hidden'}
        </Text>
      </View>
      <View style={styles.slideActions}>
        <TouchableOpacity
          onPress={() => moveSlide(index, -1)}
          disabled={index === 0 || busyId === item.id}
        >
          <Text style={[styles.orderBtn, { color: c.textPrimary }]}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => moveSlide(index, 1)}
          disabled={index === slides.length - 1 || busyId === item.id}
        >
          <Text style={[styles.orderBtn, { color: c.textPrimary }]}>↓</Text>
        </TouchableOpacity>
        <Switch
          value={item.is_active}
          onValueChange={() => toggleActive(item)}
          disabled={busyId === item.id}
        />
        <TouchableOpacity onPress={() => openEdit(item)}>
          <Text style={[styles.editText, { color: c.brand }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && !slides.length) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FlatList
        data={slides}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={c.brand} />
        }
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={[styles.headerText, { color: c.textSecondary }]}>
              {slides.length} slide{slides.length === 1 ? '' : 's'}
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: c.brand }]}
              onPress={openNew}
            >
              <Text style={[styles.addBtnText, { color: c.brandText }]}>+ Add slide</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={(
          <AdminEmptyState
            icon="🖼️"
            title="No promo slides yet"
            subtitle="Add a slide to showcase specials, events, or featured items at the top of your menu."
            actionLabel="+ Add Slide"
            onAction={openNew}
          />
        )}
        contentContainerStyle={styles.listContent}
      />

      <Modal
        visible={editorVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditorVisible(false)}
      >
        <SlideEditorForm
          slide={selectedSlide}
          restaurantId={restaurant?.id}
          onSave={persistSlide}
          onCancel={() => {
            setEditorVisible(false);
            setSelectedSlide(null);
          }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: { fontSize: 13 },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: { fontWeight: '600', fontSize: 13 },
  slideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  thumb: { width: 72, height: 48, borderRadius: 6 },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  videoLabel: { fontSize: 10, fontWeight: '700' },
  slideInfo: { flex: 1 },
  slideTitle: { fontSize: 14, fontWeight: '600' },
  slideMeta: { fontSize: 12, marginTop: 2 },
  slideActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderBtn: { fontSize: 16, paddingHorizontal: 4 },
  editText: { fontSize: 13 },
  deleteText: { fontSize: 16, color: '#FF3B30', paddingHorizontal: 4 },
});

const editorStyles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: { fontWeight: '600' },
  uploadBtn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadBtnText: { fontWeight: '600' },
  preview: { width: '100%', height: 160, borderRadius: 8, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
