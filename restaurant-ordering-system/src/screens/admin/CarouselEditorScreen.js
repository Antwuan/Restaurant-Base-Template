import React, { useEffect, useState } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useCarousel } from '../../hooks/useCarousel';
import { useTheme } from '../../theme';
import * as carouselService from '../../services/carouselService';
import {
  uploadFileFromUri,
  carouselStoragePath,
} from '../../services/storageService';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import ImageFrameEditor from '../../components/admin/ImageFrameEditor';
import { confirmAsync } from '../../utils/confirm';
import { friendlySupabaseError } from '../../utils/supabaseErrors';

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
  const [frameUri, setFrameUri] = useState(null);
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
      allowsEditing: false,
      quality: isVideo ? 0.85 : 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      if (isVideo) {
        setLocalUri(asset.uri);
        setField('media_type', 'video');
      } else {
        setField('media_type', 'image');
        setFrameUri(asset.uri);
      }
    }
  };

  const reframeCurrent = () => {
    const uri = localUri || form.media_url;
    if (!uri) return;
    setField('media_type', 'image');
    setFrameUri(uri);
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
      Alert.alert('Error', friendlySupabaseError(e, 'save slide'));
    } finally {
      setSaving(false);
    }
  };

  const previewUri = localUri || form.media_url;

  return (
    <>
      <ScrollView
        style={editorStyles.body}
        contentContainerStyle={editorStyles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
          <>
            <Image source={{ uri: previewUri }} style={editorStyles.preview} />
            <View style={editorStyles.imageActions}>
              <TouchableOpacity onPress={reframeCurrent}>
                <Text style={{ color: c.brand, fontWeight: '600', fontSize: 13 }}>
                  Reframe
                </Text>
              </TouchableOpacity>
              <Text style={{ color: c.textSecondary }}>·</Text>
              <TouchableOpacity onPress={() => pickMedia('image')}>
                <Text style={{ color: c.brand, fontWeight: '600', fontSize: 13 }}>
                  Change image
                </Text>
              </TouchableOpacity>
            </View>
          </>
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
      </ScrollView>

      <View style={editorStyles.footer}>
        <TouchableOpacity
          style={[editorStyles.cancelBtn, { borderColor: c.border }]}
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={[editorStyles.cancelBtnText, { color: c.textSecondary }]}>Cancel</Text>
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

      <ImageFrameEditor
        visible={!!frameUri}
        uri={frameUri}
        aspectRatio={16 / 9}
        title="Frame promo image"
        onCancel={() => setFrameUri(null)}
        onConfirm={(framed) => {
          setLocalUri(framed);
          setFrameUri(null);
        }}
      />
    </>
  );
}

function newSlideId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function CarouselEditorScreen({ embedded = false, refreshToken = 0 }) {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const { slides, loading, refetch } = useCarousel(restaurant?.id, { admin: true });
  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (refreshToken > 0) refetch();
  }, [refreshToken, refetch]);

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

  const listHeader = (
    <View style={[styles.header, embedded && styles.headerEmbedded]}>
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
  );

  const emptyState = (
    <AdminEmptyState
      icon="🖼️"
      title="No promo slides yet"
      subtitle="Add a slide to showcase specials, events, or featured items at the top of your menu."
      actionLabel="+ Add Slide"
      onAction={openNew}
    />
  );

  const editorModal = (
    <Modal
      visible={editorVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        setEditorVisible(false);
        setSelectedSlide(null);
      }}
    >
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={modalStyles.backdrop}
          onPress={() => {
            setEditorVisible(false);
            setSelectedSlide(null);
          }}
        />
        <View style={[modalStyles.card, { backgroundColor: c.backgroundCard }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: c.textPrimary }]}>
              {selectedSlide?.id ? 'Edit slide' : 'New slide'}
            </Text>
            <TouchableOpacity
              style={[modalStyles.closeBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={() => {
                setEditorVisible(false);
                setSelectedSlide(null);
              }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={c.textPrimary} />
            </TouchableOpacity>
          </View>
          <SlideEditorForm
            slide={selectedSlide}
            restaurantId={restaurant?.id}
            onSave={persistSlide}
            onCancel={() => {
              setEditorVisible(false);
              setSelectedSlide(null);
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (loading && !slides.length) {
    return (
      <View style={[embedded ? styles.centeredEmbedded : styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  if (embedded) {
    return (
      <View>
        {listHeader}
        {!slides.length
          ? emptyState
          : slides.map((item, index) => (
              <View key={item.id}>{renderSlide({ item, index })}</View>
            ))}
        {editorModal}
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
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.listContent}
      />
      {editorModal}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredEmbedded: { paddingVertical: 40, alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerEmbedded: { marginBottom: 10 },
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

const modalStyles = StyleSheet.create({
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
    maxWidth: 560,
    maxHeight: '100%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const editorStyles = StyleSheet.create({
  body: { flexShrink: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
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
  preview: { width: '100%', height: 160, borderRadius: 8, marginBottom: 8 },
  imageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
