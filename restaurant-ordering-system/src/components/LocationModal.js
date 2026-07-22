/**
 * LocationModal — shows an info card + embedded map for a restaurant location.
 * Matches the screenshot: X close on the top-left, name/address/status on the
 * left, Google Maps embed on the right. Follows the MenuItemModal fade shell.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  isOpenNow,
  getClosedUntilLabel,
  getTodayHoursLabel,
} from '../utils/hoursUtils';

const DESKTOP_BP = 640;

export default function LocationModal({ visible, onClose, restaurant, brandColor = '#C8A951' }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  const open = isOpenNow(restaurant?.hours_of_operation);
  const closedLabel = getClosedUntilLabel(restaurant?.hours_of_operation);
  const todayLabel = getTodayHoursLabel(restaurant?.hours_of_operation);

  const addressQuery = useMemo(
    () => encodeURIComponent(restaurant?.address || ''),
    [restaurant?.address],
  );
  const mapEmbedUrl = addressQuery
    ? `https://maps.google.com/maps?q=${addressQuery}&output=embed&z=15`
    : null;

  const handleDirections = () => {
    if (!restaurant?.address) return;
    Linking.openURL(`https://maps.google.com/?q=${addressQuery}`);
  };

  const handleCall = () => {
    if (restaurant?.phone) Linking.openURL(`tel:${restaurant.phone}`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        {/* Stop propagation so tapping card doesn't close */}
        <Pressable
          style={[s.card, isDesktop && s.cardDesktop]}
          onPress={() => {}}
        >
          {/* ── Info panel ── */}
          <View style={[s.infoPanel, isDesktop && s.infoPanelDesktop]}>
            {/* Close */}
            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color="#333" />
            </TouchableOpacity>

            <View style={s.infoBody}>
              {/* Name */}
              <Text style={s.name} numberOfLines={2}>
                {restaurant?.name || 'Location'}
              </Text>

              {/* Address */}
              {restaurant?.address ? (
                <Text style={s.address}>{restaurant.address}</Text>
              ) : null}

              {/* Open / Closed badge */}
              <View style={[s.badge, open ? s.badgeOpen : s.badgeClosed]}>
                <View style={[s.badgeDot, { backgroundColor: open ? '#22c55e' : '#ef4444' }]} />
                <Text style={[s.badgeText, { color: open ? '#15803d' : '#c2314f' }]}>
                  {open
                    ? (todayLabel ? `Open · ${todayLabel}` : 'Open now')
                    : (closedLabel || 'Closed')}
                </Text>
              </View>

              {/* Phone */}
              {restaurant?.phone ? (
                <TouchableOpacity style={s.metaRow} onPress={handleCall} activeOpacity={0.7}>
                  <Ionicons name="call-outline" size={14} color="#555" />
                  <Text style={s.metaText}>{restaurant.phone}</Text>
                </TouchableOpacity>
              ) : null}

              {/* Directions button */}
              <TouchableOpacity
                style={[s.directionsBtn, { borderColor: brandColor }]}
                onPress={handleDirections}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate-outline" size={15} color={brandColor} />
                <Text style={[s.directionsBtnText, { color: brandColor }]}>Get Directions</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Map panel ── */}
          <View style={[s.mapPanel, isDesktop && s.mapPanelDesktop]}>
            {Platform.OS === 'web' && mapEmbedUrl ? (
              <iframe
                src={mapEmbedUrl}
                title="Location map"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                loading="lazy"
                allowFullScreen
              />
            ) : (
              <View style={s.mapPlaceholder}>
                <Ionicons name="map-outline" size={40} color="#ccc" />
                <Text style={s.mapPlaceholderText}>Map unavailable</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
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
    maxWidth: 680,
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
    maxHeight: 420,
  },

  // Info panel
  infoPanel: {
    padding: 24,
    paddingTop: 20,
    backgroundColor: '#fff',
  },
  infoPanelDesktop: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f4f4f4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoBody: { gap: 10 },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  address: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  badgeOpen: { backgroundColor: '#f0fdf4' },
  badgeClosed: { backgroundColor: '#fde8ec' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  // Meta
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#555' },

  // Directions button
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  directionsBtnText: { fontSize: 13, fontWeight: '600' },

  // Map panel
  mapPanel: {
    height: 220,
    backgroundColor: '#e8ecef',
  },
  mapPanelDesktop: {
    flex: 1,
    height: 'auto',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  mapPlaceholderText: { fontSize: 13, color: '#999' },
});
