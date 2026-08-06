/**
 * LocationCard — reusable card showing restaurant address, contact, hours, and a map.
 *
 * Props:
 *   restaurant   - restaurant record from RestaurantContext
 *   variant      - 'full' (home page) | 'compact' (checkout confirm)
 *   onOrderPress - optional CTA handler
 *   brandColor   - hex string for accent color
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  useWindowDimensions,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  isOpenNow,
  getTodayHoursLabel,
  getClosedUntilLabel,
  DAY_KEYS,
  DAY_SHORT,
  resolveHours,
  formatTime12,
} from '../utils/hoursUtils';

const DESKTOP_BP = 768;

function WeekHoursGrid({ hours }) {
  return (
    <View style={styles.weekGrid}>
      {DAY_KEYS.map((key) => {
        const d = hours[key];
        return (
          <View key={key} style={styles.weekRow}>
            <Text style={styles.weekDay}>{DAY_SHORT[key]}</Text>
            <Text style={styles.weekTime}>
              {d?.closed ? 'Closed' : `${formatTime12(d?.open)} – ${formatTime12(d?.close)}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function LocationCard({
  restaurant,
  variant = 'full',
  onOrderPress,
  brandColor = '#C8A951',
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;
  const isCompact = variant === 'compact';
  const [hoursOpen, setHoursOpen] = useState(false);

  const open = isOpenNow(restaurant?.hours_of_operation);
  const todayLabel = getTodayHoursLabel(restaurant?.hours_of_operation);
  const closedLabel = !open ? getClosedUntilLabel(restaurant?.hours_of_operation) : null;
  const hours = useMemo(() => resolveHours(restaurant?.hours_of_operation), [restaurant?.hours_of_operation]);

  const addressQuery = encodeURIComponent(restaurant?.address || '');
  const mapEmbedUrl = addressQuery
    ? `https://maps.google.com/maps?q=${addressQuery}&output=embed&z=15`
    : null;

  const handleDirections = () => {
    const url = `https://maps.google.com/?q=${addressQuery}`;
    Linking.openURL(url);
  };

  const handleCall = () => {
    if (restaurant?.phone) Linking.openURL(`tel:${restaurant.phone}`);
  };

  const handleEmail = () => {
    if (restaurant?.email) Linking.openURL(`mailto:${restaurant.email}`);
  };

  // City / state from address (last 2 comma-separated parts if available)
  const cityState = useMemo(() => {
    if (!restaurant?.address) return null;
    const parts = restaurant.address.split(',').map((p) => p.trim());
    return parts.length >= 2 ? parts.slice(-2).join(', ') : restaurant.address;
  }, [restaurant?.address]);

  const card = (
    <View style={[
      styles.card,
      isCompact && styles.cardCompact,
      (isDesktop && !isCompact) && styles.cardDesktop,
    ]}>
      {/* ── Map ─────────────────────────────────────────── */}
      {!isCompact && Platform.OS === 'web' && mapEmbedUrl ? (
        <View style={[styles.mapWrap, isDesktop && styles.mapWrapDesktop]}>
          <iframe
            src={mapEmbedUrl}
            title="Location map"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
            loading="lazy"
            allowFullScreen
          />
        </View>
      ) : !isCompact ? (
        <View style={[styles.mapWrap, styles.mapPlaceholder, isDesktop && styles.mapWrapDesktop]}>
          <Ionicons name="map-outline" size={40} color="#ccc" />
          <Text style={styles.mapPlaceholderText}>Map unavailable</Text>
        </View>
      ) : null}

      {/* ── Info panel ────────────────────────────────── */}
      <View style={[styles.info, (isDesktop && !isCompact) && styles.infoDesktop]}>

        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.brandName}>{restaurant?.name || 'Restaurant'}</Text>
            {cityState ? (
              <Text style={styles.cityState}>{cityState}</Text>
            ) : null}
          </View>
          {!isCompact && (
            <TouchableOpacity
              style={[styles.directionsBtn, { borderColor: brandColor }]}
              onPress={handleDirections}
              activeOpacity={0.75}
            >
              <Ionicons name="navigate-outline" size={14} color={brandColor} />
              <Text style={[styles.directionsBtnText, { color: brandColor }]}>Get directions</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider} />

        {/* Two-column info: Address + Contact */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.colHeading}>Address</Text>
            {restaurant?.address ? (
              <Text style={styles.colBody}>{restaurant.address}</Text>
            ) : (
              <Text style={[styles.colBody, styles.colBodyMuted]}>Not set</Text>
            )}
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.colHeading}>Contact</Text>
            {restaurant?.phone ? (
              <TouchableOpacity onPress={handleCall}>
                <Text style={[styles.colBody, styles.colBodyLink, { color: brandColor }]}>
                  {restaurant.phone}
                </Text>
              </TouchableOpacity>
            ) : null}
            {restaurant?.email ? (
              <TouchableOpacity onPress={handleEmail}>
                <Text style={[styles.colBody, styles.colBodyLink, { color: brandColor }]}>
                  {restaurant.email}
                </Text>
              </TouchableOpacity>
            ) : null}
            {!restaurant?.phone && !restaurant?.email ? (
              <Text style={[styles.colBody, styles.colBodyMuted]}>Not set</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Hours row */}
        <View style={styles.hoursRow}>
          <View style={styles.hoursLeft}>
            <Text style={styles.todayHours}>
              Today: <Text style={styles.todayHoursVal}>{todayLabel}</Text>
            </Text>
            {closedLabel ? (
              <Text style={styles.closedBadge}>{closedLabel}</Text>
            ) : null}
          </View>

          <View style={styles.hoursActions}>
            {!isCompact && (
              <TouchableOpacity
                style={styles.seeHoursBtn}
                onPress={() => setHoursOpen((v) => !v)}
                activeOpacity={0.75}
              >
                <Text style={[styles.seeHoursText, { color: brandColor }]}>
                  {hoursOpen ? 'Hide hours' : 'See hours'}
                </Text>
              </TouchableOpacity>
            )}
            {onOrderPress && !isCompact && (
              <TouchableOpacity
                style={[styles.orderBtn, { backgroundColor: brandColor }]}
                onPress={onOrderPress}
                activeOpacity={0.85}
              >
                <Text style={styles.orderBtnText}>Order online</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Weekly hours — shown on compact */}
        {isCompact && <WeekHoursGrid hours={hours} />}

        {/* Status badge (compact) */}
        {isCompact && (
          <View style={[styles.statusBadge, open ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusText}>{open ? 'Open now' : closedLabel || 'Closed'}</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <>
      {card}
      {!isCompact && (
        <Modal
          visible={hoursOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setHoursOpen(false)}
        >
          <Pressable style={styles.hoursBackdrop} onPress={() => setHoursOpen(false)}>
            <Pressable style={styles.hoursSheet} onPress={() => {}}>
              <View style={styles.hoursSheetHeader}>
                <Text style={styles.hoursSheetTitle}>Hours</Text>
                <TouchableOpacity
                  onPress={() => setHoursOpen(false)}
                  style={styles.hoursCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color="#333" />
                </TouchableOpacity>
              </View>
              <WeekHoursGrid hours={hours} />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e3e8ee',
    backgroundColor: '#fff',
  },
  cardCompact: {
    borderRadius: 10,
  },
  cardDesktop: {
    flexDirection: 'row',
    minHeight: 220,
  },

  // Map
  mapWrap: {
    height: 180,
    backgroundColor: '#e8eeea',
  },
  mapWrapDesktop: {
    width: '35%',
    height: 'auto',
    minHeight: 220,
  },
  mapPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 6,
  },

  // Info panel
  info: {
    padding: 18,
    flex: 1,
  },
  infoDesktop: {
    padding: 22,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  brandName: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 2 },
  cityState: { fontSize: 18, fontWeight: '800', color: '#0a1628', letterSpacing: -0.3 },

  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  directionsBtnText: { fontSize: 13, fontWeight: '600' },

  // Divider
  divider: { height: 1, backgroundColor: '#e8ecef', marginVertical: 12 },

  // Two-column info grid
  infoGrid: { flexDirection: 'row', gap: 16 },
  infoCol: { flex: 1 },
  colHeading: { fontSize: 11, color: '#8a919e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  colBody: { fontSize: 13, color: '#2d3748', lineHeight: 19 },
  colBodyMuted: { color: '#aaa' },
  colBodyLink: { fontWeight: '500' },

  // Hours
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  hoursLeft: { flex: 1 },
  todayHours: { fontSize: 13, color: '#2d3748' },
  todayHoursVal: { fontWeight: '600' },
  closedBadge: { fontSize: 12, color: '#c0392b', marginTop: 3 },

  hoursActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seeHoursBtn: { paddingVertical: 4 },
  seeHoursText: { fontSize: 13, fontWeight: '500' },
  orderBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  orderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Weekly hours (compact + modal)
  weekGrid: { marginTop: 12, gap: 4 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { fontSize: 13, color: '#555', fontWeight: '600', width: 36 },
  weekTime: { fontSize: 13, color: '#333' },

  // Hours modal
  hoursBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  hoursSheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
  },
  hoursSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hoursSheetTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  hoursCloseBtn: { padding: 4 },

  // Status badge (compact)
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusOpen: { backgroundColor: '#e6f9ef' },
  statusClosed: { backgroundColor: '#fde8e8' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#2d3748' },
});
