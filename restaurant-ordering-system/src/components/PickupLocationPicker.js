/**
 * PickupLocationPicker — choose which store location to pick up from.
 *
 * Surface: compact summary of the selected location (or “Choose a location”).
 * Popup: all options + Google Maps embed for the highlighted option.
 *
 * Options should already include the virtual main store (see buildPickupOptions).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Linking,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { useMobileBottomSheet } from './BottomSheet';

const DESKTOP_BP = 640;

function StoreCard({
  name,
  address,
  selected = false,
  onPress,
  brandColor = '#C8A951',
  selectable = false,
}) {
  const content = (
    <>
      <View style={styles.storeIconWrap}>
        <Ionicons
          name={selected ? 'storefront' : 'storefront-outline'}
          size={20}
          color={selected ? brandColor : '#697386'}
        />
      </View>
      <View style={styles.storeText}>
        <Text style={[styles.storeName, selected && { color: brandColor }]} numberOfLines={2}>
          {name || 'Store'}
        </Text>
        {address ? (
          <Text style={styles.storeAddress} numberOfLines={3}>{address}</Text>
        ) : (
          <Text style={styles.storeAddressMuted}>Address not set</Text>
        )}
      </View>
      {selectable ? (
        <View style={[
          styles.radio,
          selected && { borderColor: brandColor, backgroundColor: brandColor },
        ]}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
      ) : selected ? (
        <Ionicons name="checkmark-circle" size={22} color={brandColor} />
      ) : null}
    </>
  );

  if (!selectable || !onPress) {
    return (
      <View
        style={[
          styles.storeCard,
          styles.storeCardStatic,
          selected && { borderColor: brandColor, backgroundColor: `${brandColor}0D` },
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.storeCard,
        selected && { borderColor: brandColor, backgroundColor: `${brandColor}0D` },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {content}
    </TouchableOpacity>
  );
}

function MapPanel({ address, brandColor, fill = false }) {
  const addressQuery = address ? encodeURIComponent(address) : '';
  const mapEmbedUrl = addressQuery
    ? `https://maps.google.com/maps?q=${addressQuery}&output=embed&z=15`
    : null;

  const handleDirections = () => {
    if (!addressQuery) return;
    Linking.openURL(`https://maps.google.com/?q=${addressQuery}`);
  };

  return (
    <View style={fill ? { flex: 1, minHeight: 220 } : undefined}>
      {Platform.OS === 'web' && mapEmbedUrl ? (
        <iframe
          src={mapEmbedUrl}
          title="Pickup location map"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block', minHeight: 220 }}
          loading="lazy"
          allowFullScreen
        />
      ) : (
        <View style={[modalStyles.mapPlaceholder, fill && { flex: 1 }]}>
          <Ionicons name="map-outline" size={40} color="#ccc" />
          <Text style={modalStyles.mapPlaceholderText}>
            {address ? 'Map preview on web' : 'Address not set'}
          </Text>
          {address ? (
            <TouchableOpacity
              style={[modalStyles.directionsBtn, { borderColor: brandColor }]}
              onPress={handleDirections}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate-outline" size={15} color={brandColor} />
              <Text style={[modalStyles.directionsBtnText, { color: brandColor }]}>
                Open in Maps
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

export default function PickupLocationPicker({
  locations = [],
  selectedLocationId = null,
  onSelect,
  restaurant,
  brandColor = '#C8A951',
  /** When true, show a required asterisk / error for multi-location */
  error = null,
  compact = false,
  /** Read-only display of the selected (or only) location — no chooser. */
  readOnly = false,
  label = 'Pickup location',
  prompt = 'Which location would you like to pick up from?',
  /** Open the popup automatically when multi-location and nothing selected yet. */
  autoOpenWhenUnset = false,
}) {
  const { width } = useWindowDimensions();
  const mobileSheet = useMobileBottomSheet();
  const isDesktop = width >= DESKTOP_BP && !mobileSheet;

  const count = locations.length;
  const multi = count >= 2;
  const selected = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)
    : null;

  const fallbackName = restaurant?.name || 'Store';
  const fallbackAddress = restaurant?.address || '';

  const [modalVisible, setModalVisible] = useState(false);
  const [draftId, setDraftId] = useState(selectedLocationId);

  // Keep draft in sync when opening / when external selection changes while closed.
  useEffect(() => {
    if (!modalVisible) {
      setDraftId(selectedLocationId || (count === 1 ? locations[0]?.id : null));
    }
  }, [selectedLocationId, locations, count, modalVisible]);

  // Auto-open when caller asks and user still needs to pick.
  useEffect(() => {
    if (readOnly) return;
    if (!autoOpenWhenUnset) return;
    if (multi && !selectedLocationId) {
      setModalVisible(true);
    }
  }, [autoOpenWhenUnset, multi, selectedLocationId, readOnly]);

  const draftLocation = useMemo(() => {
    if (draftId) {
      const match = locations.find((l) => l.id === draftId);
      if (match) return match;
    }
    if (count === 1) return locations[0];
    return null;
  }, [draftId, locations, count]);

  const openModal = () => {
    setDraftId(selectedLocationId || (count === 1 ? locations[0]?.id : null));
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  const confirmSelection = () => {
    if (draftId && onSelect) onSelect(draftId);
    setModalVisible(false);
  };

  const surfaceName = selected?.name
    || (count === 1 ? locations[0]?.name : null)
    || (multi && !selected ? null : fallbackName);
  const surfaceAddress = selected?.address
    || (count === 1 ? locations[0]?.address : null)
    || (multi && !selected ? '' : fallbackAddress);
  const needsChoice = multi && !selected;
  const canChange = !readOnly && (multi || count >= 1);

  if (readOnly) {
    const loc = selected || (count === 1 ? locations[0] : null);
    return (
      <View style={compact ? null : styles.wrap}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <StoreCard
          name={loc?.name || fallbackName}
          address={loc?.address || fallbackAddress}
          selected
          brandColor={brandColor}
        />
      </View>
    );
  }

  return (
    <View style={compact ? null : styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        style={[
          styles.summaryCard,
          needsChoice && styles.summaryCardPrompt,
          needsChoice && { borderColor: `${brandColor}88` },
          selected && { borderColor: brandColor, backgroundColor: `${brandColor}0D` },
        ]}
        onPress={canChange ? openModal : undefined}
        activeOpacity={canChange ? 0.8 : 1}
        disabled={!canChange}
        accessibilityRole="button"
        accessibilityLabel={
          needsChoice
            ? 'Choose a pickup location'
            : `Pickup location ${surfaceName || ''}. Tap to change.`
        }
      >
        <View style={styles.storeIconWrap}>
          <Ionicons
            name={needsChoice ? 'location-outline' : 'storefront'}
            size={20}
            color={needsChoice ? brandColor : brandColor}
          />
        </View>
        <View style={styles.storeText}>
          <Text style={styles.summaryEyebrow}>
            {needsChoice ? 'Pickup location' : 'Picking up from'}
          </Text>
          <Text
            style={[styles.storeName, { color: needsChoice ? brandColor : '#0a2540' }]}
            numberOfLines={2}
          >
            {needsChoice ? 'Choose a location' : (surfaceName || 'Store')}
          </Text>
          {!needsChoice && surfaceAddress ? (
            <Text style={styles.storeAddress} numberOfLines={2}>{surfaceAddress}</Text>
          ) : needsChoice ? (
            <Text style={styles.storeAddressMuted}>Tap to select where you'll pick up</Text>
          ) : null}
        </View>
        {canChange ? (
          <View style={styles.summaryAction}>
            <Text style={[styles.summaryActionText, { color: brandColor }]}>
              {needsChoice ? 'Choose' : (multi ? 'Change' : 'Map')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={brandColor} />
          </View>
        ) : (
          <Ionicons name="checkmark-circle" size={22} color={brandColor} />
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {(() => {
        const pickerBody = (
          <>
            <View style={[modalStyles.listPanel, isDesktop && modalStyles.listPanelDesktop]}>
              <TouchableOpacity style={modalStyles.closeBtn} onPress={closeModal} hitSlop={8}>
                <Ionicons name="close" size={18} color="#333" />
              </TouchableOpacity>

              <Text style={modalStyles.title}>Pickup location</Text>
              {prompt ? <Text style={modalStyles.prompt}>{prompt}</Text> : null}

              <ScrollView
                style={modalStyles.listScroll}
                contentContainerStyle={modalStyles.list}
                showsVerticalScrollIndicator={false}
              >
                {count > 0 ? (
                  locations.map((loc) => (
                    <StoreCard
                      key={loc.id}
                      name={loc.name}
                      address={loc.address}
                      selected={loc.id === draftId}
                      onPress={() => setDraftId(loc.id)}
                      brandColor={brandColor}
                      selectable
                    />
                  ))
                ) : (
                  <StoreCard
                    name={fallbackName}
                    address={fallbackAddress}
                    selected
                    brandColor={brandColor}
                  />
                )}
              </ScrollView>

              <View style={modalStyles.footer}>
                <TouchableOpacity
                  style={modalStyles.cancelBtn}
                  onPress={closeModal}
                  activeOpacity={0.8}
                >
                  <Text style={modalStyles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    modalStyles.confirmBtn,
                    { backgroundColor: brandColor },
                    !draftId && count > 1 && modalStyles.confirmBtnDisabled,
                  ]}
                  onPress={confirmSelection}
                  disabled={!draftId && count > 1}
                  activeOpacity={0.85}
                >
                  <Text style={modalStyles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[modalStyles.mapColumn, isDesktop && modalStyles.mapColumnDesktop]}>
              {draftLocation ? (
                <View style={modalStyles.mapHeader}>
                  <Text style={modalStyles.mapHeaderName} numberOfLines={1}>
                    {draftLocation.name || 'Store'}
                  </Text>
                  {draftLocation.address ? (
                    <Text style={modalStyles.mapHeaderAddress} numberOfLines={2}>
                      {draftLocation.address}
                    </Text>
                  ) : null}
                  {Platform.OS === 'web' && draftLocation.address ? (
                    <TouchableOpacity
                      style={[modalStyles.directionsBtn, { borderColor: brandColor }]}
                      onPress={() => {
                        const q = encodeURIComponent(draftLocation.address);
                        Linking.openURL(`https://maps.google.com/?q=${q}`);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="navigate-outline" size={14} color={brandColor} />
                      <Text style={[modalStyles.directionsBtnText, { color: brandColor }]}>
                        Get Directions
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <View style={modalStyles.mapHeader}>
                  <Text style={modalStyles.mapHeaderAddress}>Select a location to preview the map</Text>
                </View>
              )}
              <View style={[modalStyles.mapPanel, isDesktop && modalStyles.mapPanelDesktop]}>
                <MapPanel address={draftLocation?.address || ''} brandColor={brandColor} fill />
              </View>
            </View>
          </>
        );

        if (mobileSheet) {
          return (
            <BottomSheet visible={modalVisible} onClose={closeModal} expand>
              <View style={modalStyles.sheetCard}>{pickerBody}</View>
            </BottomSheet>
          );
        }

        return (
          <Modal
            visible={modalVisible}
            transparent
            animationType="fade"
            onRequestClose={closeModal}
            statusBarTranslucent
          >
            <Pressable style={modalStyles.backdrop} onPress={closeModal}>
              <Pressable
                style={[modalStyles.card, isDesktop && modalStyles.cardDesktop]}
                onPress={() => {}}
              >
                {pickerBody}
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}
    </View>
  );
}

/** Helper: whether a pickup location id is required / valid for ordering. */
export function isPickupLocationReady(locations, selectedLocationId) {
  if (!locations?.length) return true; // no store options at all
  if (locations.length === 1) return true; // single store is implied / auto-selected
  return Boolean(selectedLocationId && locations.some((l) => l.id === selectedLocationId));
}

/** Resolve the location option for display / order payload shaping. */
export function resolvePickupLocation(locations, selectedLocationId) {
  if (!locations?.length) return null;
  if (selectedLocationId != null) {
    const match = locations.find((l) => l.id === selectedLocationId);
    if (match) return match;
  }
  if (locations.length === 1) return locations[0];
  return null;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0a2540',
    marginBottom: 6,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#e3e8ee',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  summaryCardPrompt: {
    backgroundColor: '#fffef8',
  },
  summaryEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8a919e',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  summaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  summaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#e3e8ee',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  storeCardStatic: {
    borderColor: '#e3e8ee',
    backgroundColor: '#fafbfc',
  },
  storeIconWrap: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  storeText: { flex: 1, minWidth: 0 },
  storeName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0a2540',
    marginBottom: 2,
  },
  storeAddress: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  storeAddressMuted: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#c5ccd6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: '#c0392b',
    marginTop: 8,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  card: {
    width: '100%',
    maxWidth: 920,
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  cardDesktop: {
    flexDirection: 'row',
    maxHeight: 640,
    minHeight: 560,
  },
  sheetCard: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#fff',
  },
  listPanel: {
    padding: 20,
    paddingTop: 16,
    backgroundColor: '#fff',
    maxHeight: 420,
  },
  listPanelDesktop: {
    width: 320,
    maxHeight: '100%',
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f4f4f4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  prompt: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    marginBottom: 12,
  },
  listScroll: {
    flexGrow: 1,
    flexShrink: 1,
    maxHeight: 240,
    ...Platform.select({
      web: { maxHeight: 280 },
    }),
  },
  list: { gap: 8, paddingBottom: 4 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    flexShrink: 0,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e8ee',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fafbfc',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  confirmBtn: {
    flex: 1.2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  mapColumn: {
    backgroundColor: '#e8ecef',
  },
  mapColumnDesktop: {
    flex: 1,
    minWidth: 0,
    minHeight: 560,
  },
  mapHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 4,
  },
  mapHeaderName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  mapHeaderAddress: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  mapPanel: {
    height: 280,
    backgroundColor: '#e8ecef',
    ...Platform.select({
      web: { height: 320 },
    }),
  },
  mapPanelDesktop: {
    flex: 1,
    height: 'auto',
    minHeight: 0,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    minHeight: 220,
  },
  mapPlaceholderText: { fontSize: 13, color: '#999' },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#fff',
  },
  directionsBtnText: { fontSize: 12, fontWeight: '600' },
});
