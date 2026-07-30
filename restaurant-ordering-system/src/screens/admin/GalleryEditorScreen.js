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
import { useGallery } from '../../hooks/useGallery';
import { useTheme } from '../../theme';
import * as galleryService from '../../services/galleryService';
import {
  uploadFileFromUri,
  galleryStoragePath,
  aboutImageStoragePath,
  deleteStorageObject,
} from '../../services/storageService';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import ImageFrameEditor from '../../components/admin/ImageFrameEditor';
import MenuImagePickerModal from '../../components/admin/MenuImagePickerModal';
import { confirmAsync } from '../../utils/confirm';
import { friendlySupabaseError } from '../../utils/supabaseErrors';

const LAYOUT_OPTIONS = [
  { key: 'grid_2', label: '2-column' },
  { key: 'grid_3', label: '3-column' },
];

function newImageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ImageEditorForm({ image, restaurantId, onSave, onCancel }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [altText, setAltText] = useState(image?.alt_text || '');
  const [isActive, setIsActive] = useState(image?.is_active ?? true);
  const [localUri, setLocalUri] = useState(null);
  const [frameUri, setFrameUri] = useState(null);
  const [menuPickerOpen, setMenuPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets?.[0]) {
      setFrameUri(result.assets[0].uri);
    }
  };

  const reframeCurrent = () => {
    const uri = localUri || image?.media_url;
    if (uri) setFrameUri(uri);
  };

  const handleSave = async () => {
    if (!image?.media_url && !localUri) {
      Alert.alert('Missing image', 'Upload a photo for this gallery item.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        alt_text: altText.trim() || null,
        is_active: isActive,
        localUri,
      });
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'save gallery image'));
    } finally {
      setSaving(false);
    }
  };

  const previewUri = localUri || image?.media_url;

  return (
    <>
      <ScrollView
        style={editorStyles.body}
        contentContainerStyle={editorStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={[editorStyles.uploadBtn, { backgroundColor: c.backgroundSunken }]}
          onPress={previewUri ? reframeCurrent : pickImage}
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={editorStyles.preview} resizeMode="cover" />
          ) : (
            <View style={editorStyles.uploadPlaceholder}>
              <Ionicons name="image-outline" size={32} color={c.textSecondary} />
              <Text style={[editorStyles.uploadBtnText, { color: c.textPrimary }]}>
                Tap to upload image
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={editorStyles.sourceRow}>
          <TouchableOpacity
            style={[editorStyles.sourceBtn, { backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            onPress={() => {
              setMenuPickerOpen(false);
              pickImage();
            }}
          >
            <Ionicons name="images-outline" size={16} color={c.textPrimary} />
            <Text style={[editorStyles.sourceBtnText, { color: c.textPrimary }]}>
              From device
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              editorStyles.sourceBtn,
              {
                backgroundColor: menuPickerOpen ? c.background : c.backgroundSunken,
                borderColor: menuPickerOpen ? c.brand : c.border,
              },
            ]}
            onPress={() => setMenuPickerOpen((open) => !open)}
          >
            <Ionicons name="restaurant-outline" size={16} color={c.textPrimary} />
            <Text style={[editorStyles.sourceBtnText, { color: c.textPrimary }]}>
              From menu
            </Text>
            <Ionicons
              name={menuPickerOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={c.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <MenuImagePickerModal
          visible={menuPickerOpen}
          restaurantId={restaurantId}
          onClose={() => setMenuPickerOpen(false)}
          onSelect={(item) => {
            setMenuPickerOpen(false);
            if (item?.image_url) setFrameUri(item.image_url);
          }}
        />

        {previewUri ? (
          <View style={editorStyles.imageActions}>
            <TouchableOpacity onPress={reframeCurrent}>
              <Text style={{ color: c.brand, fontWeight: '600', fontSize: 13 }}>
                Reframe
              </Text>
            </TouchableOpacity>
            <Text style={{ color: c.textSecondary }}>·</Text>
            <TouchableOpacity onPress={pickImage}>
              <Text style={{ color: c.brand, fontWeight: '600', fontSize: 13 }}>
                Change image
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={[editorStyles.label, { color: c.textSecondary }]}>Alt text</Text>
        <TextInput
          style={[editorStyles.input, { borderColor: c.border, color: c.textPrimary }]}
          value={altText}
          onChangeText={setAltText}
          placeholder="Describe the photo"
          placeholderTextColor={c.textSecondary}
        />

        <View style={editorStyles.switchRow}>
          <Text style={[editorStyles.label, { color: c.textPrimary, marginBottom: 0 }]}>
            Active on home page
          </Text>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>
      </ScrollView>

      <View style={[editorStyles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[editorStyles.footerBtn, { backgroundColor: c.backgroundSunken }]}
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[editorStyles.footerBtn, { backgroundColor: c.brand }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={c.brandText} />
          ) : (
            <Text style={{ color: c.brandText, fontWeight: '600' }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ImageFrameEditor
        visible={!!frameUri}
        uri={frameUri}
        aspectRatio={4 / 5}
        title="Frame gallery image"
        onCancel={() => setFrameUri(null)}
        onConfirm={(framed) => {
          setLocalUri(framed);
          setFrameUri(null);
        }}
      />
    </>
  );
}

export default function GalleryEditorScreen({ embedded = false, refreshToken = 0 }) {
  const { restaurant, patchRestaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const { images, loading, refetch } = useGallery(restaurant?.id, { admin: true });

  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [aboutBusy, setAboutBusy] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [aboutFrameUri, setAboutFrameUri] = useState(null);
  const [aboutMenuPickerOpen, setAboutMenuPickerOpen] = useState(false);

  useEffect(() => {
    if (refreshToken > 0) refetch();
  }, [refreshToken, refetch]);

  const galleryLayout =
    restaurant?.gallery_layout === 'grid_3' ? 'grid_3' : 'grid_2';
  const aboutImageUrl = restaurant?.about_image_url || null;

  const openNew = () => {
    setSelectedImage({
      restaurant_id: restaurant.id,
      sort_order: images.length,
      is_active: true,
    });
    setEditorVisible(true);
  };

  const openEdit = (image) => {
    setSelectedImage(image);
    setEditorVisible(true);
  };

  const persistImage = async ({ alt_text, is_active, localUri }) => {
    const imageId = selectedImage?.id;
    const isNew = !imageId;
    let mediaUrl = selectedImage?.media_url || null;
    let storagePath = selectedImage?.storage_path || null;

    if (localUri) {
      const idForPath = imageId || newImageId();
      storagePath = galleryStoragePath(restaurant.id, idForPath, 'jpg');
      const { publicUrl } = await uploadFileFromUri({
        path: storagePath,
        uri: localUri,
        contentType: 'image/jpeg',
      });
      mediaUrl = `${publicUrl.split('?')[0]}?v=${Date.now()}`;

      if (isNew) {
        await galleryService.createImage({
          id: idForPath,
          restaurant_id: restaurant.id,
          media_url: mediaUrl,
          storage_path: storagePath,
          alt_text,
          sort_order: images.length,
          is_active,
        });
        await refetch();
        setEditorVisible(false);
        setSelectedImage(null);
        return;
      }
    }

    if (isNew) {
      throw new Error('Upload an image for new gallery items.');
    }

    await galleryService.updateImage(imageId, {
      media_url: mediaUrl,
      storage_path: storagePath,
      alt_text,
      is_active,
    });
    await refetch();
    setEditorVisible(false);
    setSelectedImage(null);
  };

  const handleDelete = async (image) => {
    const confirmed = await confirmAsync({
      title: 'Delete image',
      message: 'Remove this photo from the gallery?',
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    try {
      await galleryService.deleteImage(image);
      await refetch();
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'delete gallery image'));
    }
  };

  const moveImage = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const ordered = images.map((img) => img.id);
    const tmp = ordered[index];
    ordered[index] = ordered[target];
    ordered[target] = tmp;
    setBusyId(images[index].id);
    try {
      await galleryService.reorderImages(ordered);
      await refetch();
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'reorder gallery'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (image) => {
    setBusyId(image.id);
    try {
      await galleryService.updateImage(image.id, { is_active: !image.is_active });
      await refetch();
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'update gallery image'));
    } finally {
      setBusyId(null);
    }
  };

  const pickAboutImage = async () => {
    setAboutMenuPickerOpen(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setAboutFrameUri(result.assets[0].uri);
  };

  const saveAboutFramed = async (framedUri) => {
    setAboutFrameUri(null);
    setAboutBusy(true);
    try {
      const path = aboutImageStoragePath(restaurant.id, 'jpg');
      const { publicUrl } = await uploadFileFromUri({
        path,
        uri: framedUri,
        contentType: 'image/jpeg',
      });
      const url = `${publicUrl.split('?')[0]}?v=${Date.now()}`;
      await galleryService.updateGallerySettings(restaurant.id, {
        about_image_url: url,
      });
      patchRestaurant({ about_image_url: url });
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'save about image'));
    } finally {
      setAboutBusy(false);
    }
  };

  const clearAboutImage = async () => {
    const confirmed = await confirmAsync({
      title: 'Clear About image',
      message: 'Remove the About Us photo from the home page?',
      confirmText: 'Clear',
    });
    if (!confirmed) return;

    setAboutBusy(true);
    try {
      await deleteStorageObject(aboutImageStoragePath(restaurant.id, 'jpg'));
      await galleryService.updateGallerySettings(restaurant.id, {
        about_image_url: null,
      });
      patchRestaurant({ about_image_url: null });
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'clear about image'));
    } finally {
      setAboutBusy(false);
    }
  };

  const setLayout = async (layout) => {
    if (layout === galleryLayout) return;
    setLayoutBusy(true);
    try {
      await galleryService.updateGallerySettings(restaurant.id, {
        gallery_layout: layout,
      });
      patchRestaurant({ gallery_layout: layout });
    } catch (e) {
      Alert.alert('Error', friendlySupabaseError(e, 'update gallery layout'));
    } finally {
      setLayoutBusy(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.sections}>
      {/* About Us image */}
      <View style={[styles.card, { backgroundColor: c.backgroundCard }]}>
        <Text style={[styles.cardTitle, { color: c.textPrimary }]}>About Us image</Text>
        <Text style={[styles.cardHint, { color: c.textSecondary }]}>
          Shown beside the About section on the home page.
        </Text>
        <TouchableOpacity
          style={[styles.aboutPreview, { backgroundColor: c.backgroundSunken }]}
          onPress={pickAboutImage}
          disabled={aboutBusy}
        >
          {aboutImageUrl ? (
            <Image source={{ uri: aboutImageUrl }} style={styles.aboutImage} resizeMode="cover" />
          ) : (
            <View style={styles.aboutPlaceholder}>
              <Ionicons name="image-outline" size={28} color={c.textSecondary} />
              <Text style={[styles.aboutPlaceholderText, { color: c.textSecondary }]}>
                Tap to upload
              </Text>
            </View>
          )}
          {aboutBusy ? (
            <View style={styles.aboutBusy}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </TouchableOpacity>
        <View style={styles.aboutActions}>
          {aboutImageUrl ? (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: c.border }]}
              onPress={() => setAboutFrameUri(aboutImageUrl)}
              disabled={aboutBusy}
            >
              <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>Reframe</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: c.border }]}
            onPress={pickAboutImage}
            disabled={aboutBusy}
          >
            <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>
              {aboutImageUrl ? 'Replace' : 'Upload'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              {
                borderColor: aboutMenuPickerOpen ? c.brand : c.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              },
            ]}
            onPress={() => setAboutMenuPickerOpen((open) => !open)}
            disabled={aboutBusy}
          >
            <Text style={[styles.secondaryBtnText, { color: c.textPrimary }]}>From menu</Text>
            <Ionicons
              name={aboutMenuPickerOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={c.textSecondary}
            />
          </TouchableOpacity>
          {aboutImageUrl ? (
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: c.border }]}
              onPress={clearAboutImage}
              disabled={aboutBusy}
            >
              <Text style={[styles.secondaryBtnText, { color: '#dc2626' }]}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <MenuImagePickerModal
          visible={aboutMenuPickerOpen}
          restaurantId={restaurant?.id}
          onClose={() => setAboutMenuPickerOpen(false)}
          onSelect={(item) => {
            setAboutMenuPickerOpen(false);
            if (item?.image_url) setAboutFrameUri(item.image_url);
          }}
        />
      </View>

      {/* Layout */}
      <View style={[styles.card, { backgroundColor: c.backgroundCard }]}>
        <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Gallery layout</Text>
        <Text style={[styles.cardHint, { color: c.textSecondary }]}>
          Controls how photos appear in the home Gallery section.
        </Text>
        <View style={styles.layoutRow}>
          {LAYOUT_OPTIONS.map((opt) => {
            const active = galleryLayout === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.layoutChip,
                  { borderColor: c.border },
                  active && { backgroundColor: c.brand, borderColor: c.brand },
                ]}
                onPress={() => setLayout(opt.key)}
                disabled={layoutBusy}
              >
                <Text
                  style={[
                    styles.layoutChipText,
                    { color: c.textPrimary },
                    active && { color: c.brandText },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Gallery list header */}
      <View style={styles.listHeader}>
        <Text style={[styles.cardTitle, { color: c.textPrimary, marginBottom: 0 }]}>
          Gallery images
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={openNew}
        >
          <Text style={[styles.addBtnText, { color: c.brandText }]}>+ Add image</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.cardHint, { color: c.textSecondary, marginBottom: 8 }]}>
        {images.length} image{images.length === 1 ? '' : 's'}
      </Text>
    </View>
  );

  const renderImage = ({ item, index }) => (
    <View style={[styles.row, { backgroundColor: c.backgroundCard }]}>
      <Image
        source={{ uri: item.media_url }}
        style={[styles.thumb, { backgroundColor: c.backgroundSunken }]}
      />
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {item.alt_text || '(No alt text)'}
        </Text>
        <Text style={[styles.rowMeta, { color: c.textSecondary }]}>
          Order {item.sort_order}
          {item.is_active ? '' : ' · Hidden'}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity
          onPress={() => moveImage(index, -1)}
          disabled={index === 0 || busyId === item.id}
        >
          <Text style={[styles.orderBtn, { color: c.textPrimary }]}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => moveImage(index, 1)}
          disabled={index === images.length - 1 || busyId === item.id}
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

  const emptyState = (
    <AdminEmptyState
      icon="🖼️"
      title="No gallery images yet"
      subtitle="Add photos to show in the Gallery section on your home page."
      actionLabel="+ Add image"
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
        setSelectedImage(null);
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
            setSelectedImage(null);
          }}
        />
        <View style={[modalStyles.card, { backgroundColor: c.backgroundCard }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: c.textPrimary }]}>
              {selectedImage?.id ? 'Edit image' : 'New image'}
            </Text>
            <TouchableOpacity
              style={[modalStyles.closeBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={() => {
                setEditorVisible(false);
                setSelectedImage(null);
              }}
            >
              <Ionicons name="close" size={20} color={c.textPrimary} />
            </TouchableOpacity>
          </View>
          <ImageEditorForm
            image={selectedImage}
            restaurantId={restaurant?.id}
            onSave={persistImage}
            onCancel={() => {
              setEditorVisible(false);
              setSelectedImage(null);
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const aboutEditors = (
    <ImageFrameEditor
      visible={!!aboutFrameUri}
      uri={aboutFrameUri}
      aspectRatio={4 / 3}
      title="Frame About Us image"
      onCancel={() => setAboutFrameUri(null)}
      onConfirm={saveAboutFramed}
    />
  );

  if (!restaurant) {
    return (
      <View style={[embedded ? styles.centeredEmbedded : styles.centered, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary }}>No restaurant loaded.</Text>
      </View>
    );
  }

  if (loading && !images.length) {
    return (
      <View style={[embedded ? styles.centeredEmbedded : styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.brand} />
      </View>
    );
  }

  if (embedded) {
    return (
      <View>
        {renderHeader()}
        {!images.length
          ? emptyState
          : images.map((item, index) => (
              <View key={item.id}>{renderImage({ item, index })}</View>
            ))}
        {editorModal}
        {aboutEditors}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FlatList
        data={images}
        keyExtractor={(item) => item.id}
        renderItem={renderImage}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={c.brand} />
        }
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.listContent}
      />
      {editorModal}
      {aboutEditors}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredEmbedded: { paddingVertical: 40, alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  sections: { marginBottom: 4 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardHint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  aboutPreview: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 4 / 3,
    alignSelf: 'flex-start',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  aboutImage: { width: '100%', height: '100%' },
  aboutPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  aboutPlaceholderText: { fontSize: 13, fontWeight: '500' },
  aboutBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 13 },
  layoutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  layoutChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  layoutChipText: { fontSize: 13, fontWeight: '600' },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: { fontWeight: '600', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  thumb: { width: 64, height: 48, borderRadius: 6 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderBtn: { fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  editText: { fontWeight: '600', fontSize: 13 },
  deleteText: { color: '#dc2626', fontWeight: '700', fontSize: 14, paddingHorizontal: 4 },
});

const editorStyles = StyleSheet.create({
  body: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  uploadBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
    minHeight: 180,
  },
  preview: { width: '100%', height: 200 },
  uploadPlaceholder: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadBtnText: { fontWeight: '600' },
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sourceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  sourceBtnText: { fontSize: 13, fontWeight: '600' },
  imageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
