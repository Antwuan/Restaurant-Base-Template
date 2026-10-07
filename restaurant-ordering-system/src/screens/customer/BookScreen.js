import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Modal,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import BottomSheet, { useMobileBottomSheet } from '../../components/BottomSheet';
import ServiceCategoryFilter, {
  ALL_SERVICES,
  SERVICE_DESKTOP_BREAKPOINT,
  filterServices,
  serviceCategories,
  serviceCategoryKey,
  ServiceSearchEmpty,
} from '../../components/ServiceCategoryFilter';
import * as appointmentService from '../../services/appointmentService';
import { createAppointmentCheckout } from '../../services/stripeApi';
import AppointmentCheckoutForm from '../../components/AppointmentCheckoutForm';
import {
  addDays,
  formatServicePrice,
  formatTimeInZone,
  isClosedDate,
  monthLabel,
  noShowFeeCents,
  restaurantTimeZone,
  todayInZone,
  weekdayIndex,
} from '../../utils/appointmentTime';
import { DAY_SHORT } from '../../utils/hoursUtils';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HORIZON_DAYS = 60;

function ServiceCard({ service, onPress, colors }) {
  const cardShadowY = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

  const animateHoverIn = () => {
    setHovered(true);
    Animated.spring(cardShadowY, { toValue: 1, useNativeDriver: true, tension: 200, friction: 18 }).start();
  };
  const animateHoverOut = () => {
    setHovered(false);
    Animated.spring(cardShadowY, { toValue: 0, useNativeDriver: true, tension: 200, friction: 18 }).start();
  };

  const cardTranslateY = cardShadowY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });
  const webHover = Platform.OS === 'web'
    ? { onMouseEnter: animateHoverIn, onMouseLeave: animateHoverOut }
    : {};
  const hoveredBoxShadow = Platform.OS === 'web'
    ? (hovered ? '0 8px 24px rgba(0,0,0,0.14)' : '0 1px 4px rgba(0,0,0,0.06)')
    : undefined;

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        { transform: [{ translateY: cardTranslateY }] },
        Platform.OS === 'web' && { boxShadow: hoveredBoxShadow },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => onPress(service)}
        accessibilityRole="button"
        accessibilityLabel={`${service.name}, ${service.duration_minutes} minutes, ${formatServicePrice(service.price_cents)}`}
        accessibilityHint="Opens available times"
        style={[
          styles.serviceCard,
          { backgroundColor: colors.backgroundCard, borderColor: colors.border },
        ]}
        {...webHover}
      >
        <Text style={[styles.serviceName, { color: colors.textPrimary }]} numberOfLines={2}>
          {service.name}
        </Text>
        <Text style={[styles.price, { color: colors.textPrimary }]}>
          {formatServicePrice(service.price_cents)}
        </Text>
        <Text style={[styles.serviceMeta, { color: colors.textSecondary }]}>
          {service.duration_minutes} min
        </Text>
        {service.description ? (
          <Text style={[styles.serviceDesc, { color: colors.textSecondary }]} numberOfLines={3}>
            {service.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function buildMonthCells(monthDate, today, horizonEnd, hours) {
  const start = monthStart(monthDate);
  const lead = weekdayIndex(start);
  const cells = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({ key: `pad-${i}`, empty: true });
  }
  let cursor = start;
  while (cursor.slice(0, 7) === start.slice(0, 7)) {
    const past = cursor < today;
    const beyond = cursor > horizonEnd;
    const closed = isClosedDate(cursor, hours);
    cells.push({
      key: cursor,
      date: cursor,
      empty: false,
      selectable: !past && !beyond && !closed,
      closed,
    });
    cursor = addDays(cursor, 1);
  }
  return cells;
}

export default function BookScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { user, linkCustomer } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const isDesktop = width >= SERVICE_DESKTOP_BREAKPOINT;
  const mobileSheet = useMobileBottomSheet();
  const c = theme.colors;
  const tz = restaurantTimeZone(restaurant);

  const [services, setServices] = useState([]);
  const [chairs, setChairs] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [service, setService] = useState(null);
  const [addonIds, setAddonIds] = useState([]);
  const [visibleMonth, setVisibleMonth] = useState(() => todayInZone(tz));
  const [selectedDate, setSelectedDate] = useState(null);
  const [chairChoice, setChairChoice] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedStart, setSelectedStart] = useState(null);
  const [booking, setBooking] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [heldAppointment, setHeldAppointment] = useState(null);
  const [signInVisible, setSignInVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState(ALL_SERVICES);
  const pendingStart = useRef(null);
  const pendingChoice = useRef(null);
  const bookingLock = useRef(false);

  const today = todayInZone(tz);
  const horizonEnd = addDays(today, HORIZON_DAYS);

  const loadServices = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingServices(true);
    try {
      const rows = await appointmentService.listServices(restaurant.id, { activeOnly: true });
      const chairRows = await appointmentService.listChairs(restaurant.id, { activeOnly: true });
      setServices(rows);
      setChairs(chairRows);
    } catch {
      setServices([]);
      Alert.alert('Could not load services', 'Please try again.');
    } finally {
      setLoadingServices(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const cells = useMemo(
    () => buildMonthCells(visibleMonth, today, horizonEnd, restaurant?.hours_of_operation),
    [visibleMonth, today, horizonEnd, restaurant?.hours_of_operation],
  );

  const categories = useMemo(() => serviceCategories(services), [services]);

  useEffect(() => {
    if (activeCategory !== ALL_SERVICES && !categories.includes(activeCategory)) {
      setActiveCategory(ALL_SERVICES);
    }
  }, [categories, activeCategory]);

  const filteredServices = useMemo(
    () => filterServices(services, searchQuery, activeCategory),
    [services, searchQuery, activeCategory],
  );

  const serviceGroups = useMemo(() => {
    const groups = new Map();
    filteredServices.forEach((item) => {
      const key = serviceCategoryKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.entries()];
  }, [filteredServices]);

  const clearServiceSearch = () => {
    setSearchQuery('');
    setActiveCategory(ALL_SERVICES);
  };

  const selectedAddons = useMemo(() => {
    const offered = (service?.addons || []).filter((addon) => addon.is_active !== false);
    return offered.filter((addon) => addonIds.includes(addon.id));
  }, [service, addonIds]);

  const totalMinutes = (service?.duration_minutes || 0) + selectedAddons.reduce((sum, addon) => sum + Number(addon.duration_minutes || 0), 0);
  const totalCents = (service?.price_cents || 0) + selectedAddons.reduce((sum, addon) => sum + Number(addon.price_cents || 0), 0);
  const feeCents = noShowFeeCents(totalCents);
  const offeredAddons = (service?.addons || []).filter((addon) => addon.is_active !== false);

  useEffect(() => {
    if (!service?.id || !selectedDate || !chairChoice || !restaurant?.id) {
      setSlots([]);
      return undefined;
    }
    let cancelled = false;
    const chairId = chairChoice === 'any' ? null : chairChoice;
    (async () => {
      setLoadingSlots(true);
      try {
        const rows = await appointmentService.getAvailability(restaurant.id, service.id, selectedDate, {
          chairId,
          addonIds,
        });
        if (!cancelled) {
          setSlots(rows);
          setSelectedStart((current) => (
            rows.some((row) => row.starts_at === current) ? current : null
          ));
        }
      } catch (e) {
        if (!cancelled) {
          setSlots([]);
          Alert.alert('Could not load times', e.message || 'Please try again.');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [service?.id, selectedDate, chairChoice, restaurant?.id, addonIds]);

  const confirmBooking = useCallback(async (startsAt, paymentChoice) => {
    if (!service?.id || !startsAt || !paymentChoice) return;
    setBooking(true);
    try {
      if (user && restaurant?.id) {
        await linkCustomer(restaurant.id, user.email, user);
      }
      const chairId = chairChoice && chairChoice !== 'any' ? chairChoice : null;
      const appointment = await appointmentService.bookAppointment(service.id, startsAt, {
        chairId,
        addonIds,
        paymentChoice,
      });
      const chair = chairs.find((item) => item.id === appointment.chair_id);
      const withChair = {
        ...appointment,
        appointment_chairs: chair ? { name: chair.name, color: chair.color } : null,
      };
      if (appointment.status === 'confirmed') {
        setService(null);
        navigation.navigate('AppointmentConfirmation', { appointment: withChair });
        return;
      }
      const returnUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/booking?appointmentId=${appointment.id}&session_id={CHECKOUT_SESSION_ID}`
        : '';
      try {
        const session = await createAppointmentCheckout(appointment.id, returnUrl);
        if (session.confirmed || session.skipped) {
          setService(null);
          navigation.navigate('AppointmentConfirmation', { appointment: withChair, appointmentId: appointment.id });
          return;
        }
        setHeldAppointment(withChair);
        setClientSecret(session.clientSecret);
      } catch (checkoutError) {
        await appointmentService.cancelAppointment(appointment.id).catch(() => {});
        throw checkoutError;
      }
    } catch (e) {
      Alert.alert('Could not book', e.message || 'That time may have just been taken.');
      if (selectedDate && restaurant?.id && service?.id && chairChoice) {
        const rows = await appointmentService.getAvailability(restaurant.id, service.id, selectedDate, {
          chairId: chairChoice === 'any' ? null : chairChoice,
          addonIds,
        }).catch(() => []);
        setSlots(rows);
        setSelectedStart(null);
      }
    } finally {
      setBooking(false);
    }
  }, [service?.id, user, restaurant?.id, linkCustomer, navigation, selectedDate, chairChoice, addonIds, chairs]);

  const signInWasOpen = useRef(false);
  useEffect(() => {
    if (signInVisible) {
      signInWasOpen.current = true;
      return;
    }
    if (!signInWasOpen.current) return;
    signInWasOpen.current = false;
    const startsAt = pendingStart.current;
    const choice = pendingChoice.current;
    if (!startsAt || !choice || !user || bookingLock.current) return;
    pendingStart.current = null;
    pendingChoice.current = null;
    bookingLock.current = true;
    confirmBooking(startsAt, choice).finally(() => {
      bookingLock.current = false;
    });
  }, [signInVisible, user, confirmBooking]);

  const handlePay = (paymentChoice) => {
    if (!selectedStart || !chairChoice || bookingLock.current) return;
    if (!user) {
      pendingStart.current = selectedStart;
      pendingChoice.current = paymentChoice;
      setSignInVisible(true);
      return;
    }
    bookingLock.current = true;
    confirmBooking(selectedStart, paymentChoice).finally(() => {
      bookingLock.current = false;
    });
  };

  const resetBooking = () => {
    setService(null);
    setAddonIds([]);
    setSelectedDate(null);
    setChairChoice(null);
    setSelectedStart(null);
    setClientSecret(null);
    setHeldAppointment(null);
    setSlots([]);
  };

  const canGoPrev = monthStart(visibleMonth) > monthStart(today);
  const canGoNext = monthStart(visibleMonth) < monthStart(horizonEnd);

  const bookingPanel = (
    <>
      <View style={styles.modalHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.modalKicker, { color: c.brand }]}>Book</Text>
          <Text style={[styles.modalTitle, { color: c.textPrimary }]} numberOfLines={2}>
            {service?.name}
          </Text>
          <Text style={[styles.serviceMeta, { color: c.textSecondary }]}>
            {totalMinutes} min · {formatServicePrice(totalCents)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={resetBooking}
          accessibilityLabel="Close"
          style={[styles.modalClose, { backgroundColor: c.backgroundSunken }]}
        >
          <Ionicons name="close" size={20} color={c.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={mobileSheet ? styles.sheetScroll : styles.modalScroll}
        contentContainerStyle={styles.modalScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {offeredAddons.length > 0 ? (
          <View style={styles.slots}>
            <Text style={[styles.slotHeading, { color: c.textSecondary }]}>Add-ons</Text>
            {offeredAddons.map((addon) => {
              const selected = addonIds.includes(addon.id);
              return (
                <TouchableOpacity
                  key={addon.id}
                  onPress={() => {
                    setAddonIds((current) => (
                      current.includes(addon.id)
                        ? current.filter((id) => id !== addon.id)
                        : [...current, addon.id]
                    ));
                    setSelectedStart(null);
                    setClientSecret(null);
                  }}
                  style={styles.choiceRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? c.brand : c.textSecondary}
                  />
                  <Text style={{ color: c.textPrimary, flex: 1 }}>
                    {addon.name} · {addon.duration_minutes} min · {formatServicePrice(addon.price_cents)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <View style={styles.monthRow}>
          <TouchableOpacity
            onPress={() => canGoPrev && setVisibleMonth((d) => addDays(monthStart(d), -1))}
            disabled={!canGoPrev}
            style={styles.monthBtn}
          >
            <Ionicons name="chevron-back" size={20} color={canGoPrev ? c.textPrimary : c.textDisabled} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: c.textPrimary }]}>
            {monthLabel(monthStart(visibleMonth), tz)}
          </Text>
          <TouchableOpacity
            onPress={() => canGoNext && setVisibleMonth((d) => addDays(monthStart(d), 32))}
            disabled={!canGoNext}
            style={styles.monthBtn}
          >
            <Ionicons name="chevron-forward" size={20} color={canGoNext ? c.textPrimary : c.textDisabled} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={[styles.weekLabel, { color: c.textSecondary }]}>{label}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((cell) => {
            if (cell.empty) return <View key={cell.key} style={styles.dayCell} />;
            const selected = cell.date === selectedDate;
            const dayNum = Number(cell.date.slice(8));
            return (
              <TouchableOpacity
                key={cell.key}
                accessibilityRole="button"
                accessibilityLabel={cell.date}
                accessibilityState={{ disabled: !cell.selectable, selected }}
                style={[
                  styles.dayCell,
                  selected && { backgroundColor: c.brand, borderRadius: 8 },
                ]}
                disabled={!cell.selectable}
                onPress={() => {
                  setSelectedDate(cell.date);
                  setChairChoice(null);
                  setSelectedStart(null);
                  setClientSecret(null);
                }}
              >
                <Text
                  style={[
                    styles.dayNum,
                    { color: cell.selectable ? c.textPrimary : c.textDisabled },
                    selected && { color: '#fff', fontWeight: '700' },
                  ]}
                >
                  {dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedDate ? (
          <View style={styles.slots}>
            <Text style={[styles.slotHeading, { color: c.textSecondary }]}>Who should do this?</Text>
            <TouchableOpacity
              onPress={() => { setChairChoice('any'); setSelectedStart(null); setClientSecret(null); }}
              style={[
                styles.choiceRow,
                { borderColor: c.border },
                chairChoice === 'any' && { borderColor: c.brand, backgroundColor: c.brand },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: chairChoice === 'any' }}
            >
              <Text style={{ color: chairChoice === 'any' ? '#fff' : c.textPrimary, fontWeight: '700' }}>
                No preference
              </Text>
            </TouchableOpacity>
            {chairs.map((chair) => {
              const selected = chairChoice === chair.id;
              return (
                <TouchableOpacity
                  key={chair.id}
                  onPress={() => { setChairChoice(chair.id); setSelectedStart(null); setClientSecret(null); }}
                  style={[
                    styles.choiceRow,
                    { borderColor: c.border },
                    selected && { borderColor: c.brand, backgroundColor: c.brand },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={{ color: selected ? '#fff' : c.textPrimary, fontWeight: '700' }}>{chair.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.empty, { color: c.textSecondary }]}>
            Choose a day, then pick a person or no preference.
          </Text>
        )}

        {selectedDate && chairChoice ? (
          <View style={styles.slots}>
            <Text style={[styles.slotHeading, { color: c.textSecondary }]}>
              {DAY_SHORT[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][weekdayIndex(selectedDate)]]} {selectedDate.slice(5)}
            </Text>
            {loadingSlots ? (
              <ActivityIndicator color={c.brand} style={{ marginVertical: 12 }} />
            ) : slots.length === 0 ? (
              <Text style={[styles.empty, { color: c.textSecondary }]}>No open times this day.</Text>
            ) : (
              <View style={styles.slotWrap}>
                {slots.map((slot) => {
                  const selected = selectedStart === slot.starts_at;
                  return (
                    <TouchableOpacity
                      key={slot.starts_at}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatTimeInZone(slot.starts_at, tz)}, ${slot.remaining} open`}
                      accessibilityState={{ selected }}
                      style={[
                        styles.slot,
                        {
                          borderColor: selected ? c.brand : c.border,
                          backgroundColor: selected ? c.brand : c.background,
                        },
                      ]}
                      onPress={() => {
                        setSelectedStart(slot.starts_at);
                        setClientSecret(null);
                        setHeldAppointment(null);
                      }}
                    >
                      <Text style={[styles.slotTime, { color: selected ? '#fff' : c.textPrimary }]}>
                        {formatTimeInZone(slot.starts_at, tz)}
                      </Text>
                      <Text style={[styles.slotRemain, { color: selected ? '#fff' : c.textSecondary }]}>
                        {slot.remaining} open
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : selectedDate ? (
          <Text style={[styles.empty, { color: c.textSecondary }]}>
            Pick a person to see open times.
          </Text>
        ) : null}

        {clientSecret && heldAppointment ? (
          <AppointmentCheckoutForm
            clientSecret={clientSecret}
            brandColor={c.brand}
            label={heldAppointment.payment_choice === 'prepaid'
              ? `Pay ${formatServicePrice(heldAppointment.price_cents)}`
              : 'Save card'}
            onComplete={() => {
              const appointment = heldAppointment;
              resetBooking();
              navigation.navigate('AppointmentConfirmation', {
                appointment,
                appointmentId: appointment.id,
              });
            }}
          />
        ) : selectedStart ? (
          <View style={styles.slots}>
            <Text style={[styles.slotHeading, { color: c.textSecondary }]}>Payment</Text>
            <Text style={[styles.empty, { color: c.textSecondary }]}>
              Pay {formatServicePrice(totalCents)} now, or save a card. If you don’t show, the saved card is charged {formatServicePrice(feeCents)} — 20% of this visit plus $5.
            </Text>
            <TouchableOpacity
              style={[styles.bookBtn, { backgroundColor: c.brand }, booking && styles.bookBtnDisabled]}
              onPress={() => handlePay('prepaid')}
              disabled={booking}
            >
              {booking ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.bookBtnText}>
                  {totalCents === 0 ? 'Book without paying now' : `Pay ${formatServicePrice(totalCents)} now`}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bookBtn, styles.secondaryBtn, { borderColor: c.brand }, booking && styles.bookBtnDisabled]}
              onPress={() => handlePay('card_on_file')}
              disabled={booking}
            >
              <Text style={[styles.bookBtnText, { color: c.brand }]}>
                Save card · no-show fee {formatServicePrice(feeCents)}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </>
  );

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: c.background }]}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop, isWide && styles.contentWide]}
    >
      <Text style={[styles.kicker, { color: c.brand }]}>Book</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>Choose a service</Text>
      <Text style={[styles.sub, { color: c.textSecondary }]}>
        Pick a service, then a day, then who you’d like. You can pay now or save a card.
      </Text>

      <View style={[styles.browse, isDesktop && services.length > 0 && styles.browseDesktop]}>
      {services.length > 0 ? (
        <ServiceCategoryFilter
          colors={c}
          query={searchQuery}
          onChangeQuery={setSearchQuery}
          focused={searchFocused}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          bleed={20}
        />
      ) : null}

      <View style={[styles.browseMain, isDesktop && services.length > 0 && styles.browseMainDesktop]}>
      {loadingServices ? (
        <ActivityIndicator color={c.brand} style={{ marginVertical: 24 }} />
      ) : services.length === 0 ? (
        <Text style={[styles.empty, { color: c.textSecondary }]}>
          No services are available to book yet.
        </Text>
      ) : filteredServices.length === 0 ? (
        <ServiceSearchEmpty colors={c} query={searchQuery} onClear={clearServiceSearch} />
      ) : (
        <View style={styles.serviceList}>
          {serviceGroups.map(([category, items]) => (
            <View key={category} style={styles.group}>
              <Text style={[styles.groupTitle, { color: c.textSecondary }]}>{category}</Text>
              {items.map((item) => (
                <ServiceCard
                  key={item.id}
                  service={item}
                  colors={c}
                  onPress={(picked) => {
                    setService(picked);
                    setAddonIds([]);
                    setSelectedDate(null);
                    setChairChoice(null);
                    setSelectedStart(null);
                    setClientSecret(null);
                    setHeldAppointment(null);
                    setSlots([]);
                    setVisibleMonth(today);
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      )}
      </View>
      </View>

      {mobileSheet ? (
        <BottomSheet
          visible={!!service}
          onClose={resetBooking}
          expand
          keyboard
          style={{ backgroundColor: c.backgroundCard }}
        >
          <View style={styles.sheetInner}>{bookingPanel}</View>
        </BottomSheet>
      ) : (
        <Modal
          visible={!!service}
          transparent
          animationType="fade"
          onRequestClose={resetBooking}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={resetBooking} />
            <View style={[styles.modalCard, { backgroundColor: c.backgroundCard }]}>
              {bookingPanel}
            </View>
          </View>
        </Modal>
      )}

      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 20, paddingBottom: 48, width: '100%', alignSelf: 'center' },
  contentDesktop: { maxWidth: 1080 },
  contentWide: { paddingTop: 28 },
  browse: { width: '100%' },
  browseDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  browseMain: { width: '100%' },
  browseMainDesktop: { flex: 1, minWidth: 0, paddingLeft: 24 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '700', marginTop: 4, marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  empty: { fontSize: 15, lineHeight: 22, marginVertical: 8 },
  serviceList: { gap: 20 },
  group: { gap: 12 },
  groupTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  cardWrap: {
    borderRadius: 16,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s ease' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  serviceCard: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  serviceName: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  serviceDesc: { fontSize: 13, lineHeight: 19, marginTop: 10, fontWeight: '500' },
  serviceMeta: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  price: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '100%',
    borderRadius: 20,
    zIndex: 1,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  modalKicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { flexShrink: 1 },
  sheetInner: { flex: 1, minHeight: 0 },
  sheetScroll: { flex: 1 },
  modalScrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthBtn: { padding: 8, minWidth: 40, alignItems: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 15 },
  slots: { marginTop: 16 },
  slotHeading: { fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minWidth: 108 },
  slotTime: { fontSize: 15, fontWeight: '700' },
  slotRemain: { fontSize: 12, marginTop: 2 },
  bookBtn: { marginTop: 12, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryBtn: { backgroundColor: 'transparent', borderWidth: 1 },
  bookBtnDisabled: { opacity: 0.45 },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 6,
  },
});
