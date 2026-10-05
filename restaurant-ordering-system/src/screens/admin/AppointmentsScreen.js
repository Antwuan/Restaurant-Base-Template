import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { confirmAsync } from '../../utils/confirm';
import * as appointmentService from '../../services/appointmentService';
import {
  addDays,
  clockInZone,
  formatAppointmentWhen,
  formatDateInZone,
  formatTimeInZone,
  monthLabel,
  restaurantTimeZone,
  todayInZone,
  weekdayIndex,
} from '../../utils/appointmentTime';
import { DAY_KEYS, DAY_SHORT, resolveHours } from '../../utils/hoursUtils';

const HOUR_HEIGHT = 56;
const LOOKAHEAD_DAYS = 45;
const UPCOMING_LIMIT = 8;
const WIDE_BREAKPOINT = 1180;
const PALETTE = [
  { bg: '#dbeafe', text: '#1e3a8a' },
  { bg: '#ffedd5', text: '#9a3412' },
  { bg: '#dcfce7', text: '#14532d' },
  { bg: '#f3e8ff', text: '#581c87' },
  { bg: '#fce7f3', text: '#831843' },
  { bg: '#fef9c3', text: '#713f12' },
  { bg: '#ccfbf1', text: '#134e4a' },
  { bg: '#fee2e2', text: '#7f1d1d' },
];

function customerLabel(row) {
  const person = row.restaurant_customers;
  const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ');
  return name || person?.email || person?.phone || 'Customer';
}

function startOfWeek(dateStr) {
  return addDays(dateStr, -weekdayIndex(dateStr));
}

function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function buildMonthCells(monthDate) {
  const start = monthStart(monthDate);
  const lead = weekdayIndex(start);
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push({ key: `pad-${start}-${i}`, empty: true });
  let cursor = start;
  while (cursor.slice(0, 7) === start.slice(0, 7)) {
    cells.push({ key: cursor, date: cursor, empty: false });
    cursor = addDays(cursor, 1);
  }
  return cells;
}

function weekHeading(weekStart, timeZone) {
  const end = addDays(weekStart, 6);
  const startLabel = monthLabel(weekStart, timeZone);
  const endLabel = monthLabel(end, timeZone);
  if (startLabel === endLabel) return startLabel;
  const [startMonth, startYear] = startLabel.split(' ');
  const [endMonth, endYear] = endLabel.split(' ');
  if (startYear === endYear) return `${startMonth} – ${endMonth} ${startYear}`;
  return `${startLabel} – ${endLabel}`;
}

function parseMinutes(value) {
  const [h, m] = String(value || '0:0').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function hourLabel(hour) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

function colorForService(id) {
  const key = String(id || '');
  let n = 0;
  for (let i = 0; i < key.length; i += 1) n = (n + key.charCodeAt(i) * (i + 1)) % PALETTE.length;
  return PALETTE[n];
}

function gridBounds(hoursOfOperation, dates, rows, timeZone) {
  const hours = resolveHours(hoursOfOperation);
  let min = null;
  let max = null;
  dates.forEach((date) => {
    const day = hours[DAY_KEYS[weekdayIndex(date)]];
    if (!day || day.closed) return;
    const open = parseMinutes(day.open);
    const close = parseMinutes(day.close);
    min = min == null ? open : Math.min(min, open);
    max = max == null ? close : Math.max(max, close);
  });
  if (min == null) {
    min = 8 * 60;
    max = 19 * 60;
  }
  rows.forEach((row) => {
    const start = clockInZone(row.starts_at, timeZone).minutes;
    const end = start + (Number(row.duration_minutes) || 30);
    min = Math.min(min, start);
    max = Math.max(max, end);
  });
  const startHour = Math.max(0, Math.floor(min / 60));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(max / 60)));
  return { startHour, endHour };
}

function layoutDay(rows, timeZone) {
  const items = rows
    .map((row) => {
      const start = clockInZone(row.starts_at, timeZone).minutes;
      const duration = Number(row.duration_minutes) || 30;
      return { row, start, end: start + duration };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds = [];
  const placed = items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { ...item, lane };
  });

  return placed.map((item) => {
    const cluster = placed.filter((other) => other.start < item.end && other.end > item.start);
    const laneCount = Math.max(1, ...cluster.map((other) => other.lane + 1));
    return { ...item, laneCount };
  });
}

function Panes({ wide, children }) {
  if (wide) {
    return <View style={styles.panesRow}>{children}</View>;
  }
  return (
    <ScrollView style={styles.stackScroll} contentContainerStyle={styles.panesStacked}>
      {children}
    </ScrollView>
  );
}

export default function AppointmentsScreen() {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const c = theme.colors;
  const tz = restaurantTimeZone(restaurant);
  const wide = width >= WIDE_BREAKPOINT;
  const today = todayInZone(tz);

  const [anchor, setAnchor] = useState(() => todayInZone(tz));
  const [visibleMonth, setVisibleMonth] = useState(() => todayInZone(tz));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const weekStart = startOfWeek(anchor);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const cells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);

  const rangeStart = weekStart < today ? weekStart : today;
  const lookaheadEnd = addDays(today, LOOKAHEAD_DAYS);
  const weekEnd = addDays(weekStart, 7);
  const rangeEnd = weekEnd > lookaheadEnd ? weekEnd : lookaheadEnd;

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    try {
      setRows(await appointmentService.listAppointmentsInRange(
        restaurant.id,
        rangeStart,
        rangeEnd,
        tz,
      ));
    } catch {
      setRows([]);
      Alert.alert('Could not load appointments', 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id, rangeStart, rangeEnd, tz]);

  useEffect(() => { load(); }, [load]);

  const weekRows = useMemo(
    () => rows.filter((row) => {
      const day = formatDateInZone(row.starts_at, tz);
      return day >= weekStart && day < weekEnd;
    }),
    [rows, tz, weekStart, weekEnd],
  );

  const bounds = useMemo(
    () => gridBounds(restaurant?.hours_of_operation, dates, weekRows, tz),
    [restaurant?.hours_of_operation, dates, weekRows, tz],
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((row) => new Date(row.starts_at).getTime() >= now)
      .slice(0, UPCOMING_LIMIT);
  }, [rows]);

  const hours = [];
  for (let hour = bounds.startHour; hour < bounds.endHour; hour += 1) hours.push(hour);

  const shiftWeek = (days) => {
    const next = addDays(weekStart, days);
    setAnchor(next);
    setVisibleMonth(next);
  };

  const jumpTo = (date) => setAnchor(date);

  const handleCancel = async (row) => {
    const confirmed = await confirmAsync({
      title: 'Cancel appointment',
      message: `Cancel ${customerLabel(row)} — ${row.service_name} at ${formatTimeInZone(row.starts_at, tz)}?`,
      confirmText: 'Cancel appointment',
      destructive: true,
    });
    if (!confirmed) return;
    setCancellingId(row.id);
    try {
      await appointmentService.cancelAppointment(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setSelected(null);
    } catch (e) {
      Alert.alert('Could not cancel', e.message || 'Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const monthCursor = monthStart(visibleMonth);

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <View style={[styles.toolbar, { borderBottomColor: c.border }]}>
        <Text style={[styles.heading, { color: c.textPrimary }]}>{weekHeading(weekStart, tz)}</Text>
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            onPress={() => { setAnchor(today); setVisibleMonth(today); }}
            style={[styles.todayBtn, { borderColor: c.border }]}
          >
            <Text style={[styles.todayText, { color: c.textPrimary }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shiftWeek(-7)} style={styles.navBtn} accessibilityLabel="Previous week">
            <Ionicons name="chevron-back" size={18} color={c.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shiftWeek(7)} style={styles.navBtn} accessibilityLabel="Next week">
            <Ionicons name="chevron-forward" size={18} color={c.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <Panes wide={wide}>
        <View style={[styles.monthPane, { borderRightColor: c.border, backgroundColor: c.backgroundCard }, !wide && styles.paneStacked]}>
          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={() => setVisibleMonth((d) => addDays(monthStart(d), -1))}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-up" size={16} color={c.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.monthLabel, { color: c.textPrimary }]}>
              {monthLabel(monthCursor, tz)}
            </Text>
            <TouchableOpacity
              onPress={() => setVisibleMonth((d) => addDays(monthStart(d), 32))}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-down" size={16} color={c.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.miniWeek}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => (
              <Text key={label} style={[styles.miniWeekLabel, { color: c.textSecondary }]}>{label}</Text>
            ))}
          </View>
          <View style={styles.miniGrid}>
            {cells.map((cell) => {
              if (cell.empty) return <View key={cell.key} style={styles.miniCell} />;
              const inWeek = cell.date >= weekStart && cell.date < weekEnd;
              const isToday = cell.date === today;
              return (
                <TouchableOpacity
                  key={cell.key}
                  style={styles.miniCell}
                  onPress={() => jumpTo(cell.date)}
                  accessibilityLabel={cell.date}
                >
                  <View
                    style={[
                      styles.miniDay,
                      inWeek && { backgroundColor: c.brandLight || `${c.brand}22` },
                      isToday && { backgroundColor: c.brand },
                    ]}
                  >
                    <Text
                      style={[
                        styles.miniDayText,
                        { color: isToday ? '#fff' : c.textPrimary },
                        inWeek && !isToday && { fontWeight: '700' },
                      ]}
                    >
                      {Number(cell.date.slice(8))}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.weekPane, !wide && styles.weekPaneStacked, { backgroundColor: c.background }]}>
          {loading ? (
            <ActivityIndicator color={c.brand} style={{ marginTop: 24 }} />
          ) : (
            <ScrollView
              horizontal={!wide}
              style={styles.weekScroll}
              contentContainerStyle={wide ? styles.weekScrollFill : styles.weekScrollWide}
            >
              <View style={[styles.weekInner, !wide && styles.weekInnerMin]}>
                <View style={[styles.dayHeaderRow, { borderBottomColor: c.border }]}>
                  <View style={styles.gutter} />
                  {dates.map((date) => {
                    const isToday = date === today;
                    const key = DAY_KEYS[weekdayIndex(date)];
                    return (
                      <View key={date} style={styles.dayHeader}>
                        <Text style={[styles.dayName, { color: c.textSecondary }]}>{DAY_SHORT[key]}</Text>
                        <View style={[styles.dayBadge, isToday && { backgroundColor: c.brand }]}>
                          <Text style={[styles.dayNum, { color: isToday ? '#fff' : c.textPrimary }]}>
                            {Number(date.slice(8))}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridScrollContent}>
                  <View style={styles.gridBody}>
                    <View style={styles.gutter}>
                      {hours.map((hour) => (
                        <View key={hour} style={styles.hourLabelWrap}>
                          <Text style={[styles.hourLabel, { color: c.textSecondary }]}>{hourLabel(hour)}</Text>
                        </View>
                      ))}
                    </View>
                    {dates.map((date) => {
                      const dayRows = weekRows.filter((row) => formatDateInZone(row.starts_at, tz) === date);
                      const placed = layoutDay(dayRows, tz);
                      const isToday = date === today;
                      return (
                        <View
                          key={date}
                          style={[
                            styles.dayCol,
                            { borderLeftColor: c.border, height: hours.length * HOUR_HEIGHT },
                            isToday && { backgroundColor: c.brandLight || `${c.brand}14` },
                          ]}
                        >
                          {hours.map((hour) => (
                            <View key={hour} style={[styles.hourLine, { borderBottomColor: c.border }]} />
                          ))}
                          {placed.map(({ row, start, lane, laneCount }) => {
                            const color = colorForService(row.service_id || row.service_name);
                            const top = ((start - bounds.startHour * 60) / 60) * HOUR_HEIGHT;
                            const height = Math.max(22, ((Number(row.duration_minutes) || 30) / 60) * HOUR_HEIGHT - 3);
                            const widthPct = 100 / laneCount;
                            return (
                              <TouchableOpacity
                                key={row.id}
                                onPress={() => setSelected(row)}
                                accessibilityLabel={`${customerLabel(row)}, ${row.service_name}, ${formatTimeInZone(row.starts_at, tz)}`}
                                style={[
                                  styles.block,
                                  {
                                    top,
                                    height,
                                    left: `${lane * widthPct}%`,
                                    width: `${widthPct}%`,
                                    backgroundColor: color.bg,
                                  },
                                ]}
                              >
                                <Text style={[styles.blockTitle, { color: color.text }]} numberOfLines={1}>
                                  {customerLabel(row)}
                                </Text>
                                {height > 36 ? (
                                  <Text style={[styles.blockSub, { color: color.text }]} numberOfLines={1}>
                                    {row.service_name}
                                  </Text>
                                ) : null}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>

        <View style={[styles.upcomingPane, { borderLeftColor: c.border, backgroundColor: c.backgroundCard }, !wide && styles.paneStacked]}>
          <Text style={[styles.upcomingTitle, { color: c.textPrimary }]}>Upcoming</Text>
          {upcoming.length === 0 ? (
            <Text style={[styles.upcomingEmpty, { color: c.textSecondary }]}>Nothing coming up.</Text>
          ) : (
            upcoming.map((row) => {
              const color = colorForService(row.service_id || row.service_name);
              return (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setSelected(row)}
                  style={[styles.upcomingCard, { borderColor: c.border }]}
                >
                  <View style={[styles.upcomingSwatch, { backgroundColor: color.bg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.upcomingName, { color: c.textPrimary }]} numberOfLines={1}>
                      {customerLabel(row)}
                    </Text>
                    <Text style={[styles.upcomingMeta, { color: c.textSecondary }]} numberOfLines={1}>
                      {row.service_name}
                    </Text>
                    <Text style={[styles.upcomingMeta, { color: c.textSecondary }]}>
                      {formatAppointmentWhen(row.starts_at, tz)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </Panes>

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.detailOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          {selected ? (
            <View style={[styles.detailCard, { backgroundColor: c.backgroundCard }]}>
              <Text style={[styles.detailTitle, { color: c.textPrimary }]}>{selected.service_name}</Text>
              <Text style={[styles.detailLine, { color: c.textPrimary }]}>{customerLabel(selected)}</Text>
              <Text style={[styles.detailLine, { color: c.textSecondary }]}>
                {formatAppointmentWhen(selected.starts_at, tz)}
              </Text>
              <Text style={[styles.detailLine, { color: c.textSecondary }]}>
                {selected.duration_minutes} min
              </Text>
              <View style={styles.detailActions}>
                <TouchableOpacity
                  onPress={() => handleCancel(selected)}
                  disabled={cancellingId === selected.id}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelText}>
                    {cancellingId === selected.id ? 'Cancelling…' : 'Cancel appointment'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: '700' },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  todayText: { fontSize: 13, fontWeight: '600' },
  navBtn: { padding: 6 },
  panesRow: { flex: 1, flexDirection: 'row', minHeight: 0 },
  stackScroll: { flex: 1 },
  panesStacked: { flexDirection: 'column' },
  weekPaneStacked: { flexGrow: 0, flexBasis: 'auto', height: 520 },
  monthPane: { width: 232, borderRightWidth: 1, padding: 12 },
  paneStacked: { width: '100%', borderRightWidth: 0, borderLeftWidth: 0 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  monthLabel: { fontSize: 13, fontWeight: '700' },
  miniWeek: { flexDirection: 'row' },
  miniWeekLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600', paddingVertical: 4 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  miniDay: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  miniDayText: { fontSize: 12 },
  weekPane: { flex: 1, minWidth: 0, minHeight: 360 },
  weekScroll: { flex: 1 },
  weekScrollFill: { flexGrow: 1 },
  weekScrollWide: { flexGrow: 1 },
  weekInner: { flex: 1 },
  weekInnerMin: { minWidth: 720, flex: undefined },
  dayHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 8 },
  gutter: { width: 56 },
  dayHeader: { flex: 1, alignItems: 'center', gap: 2 },
  dayName: { fontSize: 11, fontWeight: '600' },
  dayBadge: { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  dayNum: { fontSize: 14, fontWeight: '700' },
  gridScroll: { flex: 1 },
  gridScrollContent: { paddingBottom: 24 },
  gridBody: { flexDirection: 'row' },
  hourLabelWrap: { height: HOUR_HEIGHT, justifyContent: 'flex-start' },
  hourLabel: { fontSize: 11, marginTop: -6, paddingRight: 6, textAlign: 'right' },
  dayCol: { flex: 1, borderLeftWidth: 1, position: 'relative' },
  hourLine: { height: HOUR_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  block: {
    position: 'absolute',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  blockTitle: { fontSize: 11, fontWeight: '700' },
  blockSub: { fontSize: 10, marginTop: 1 },
  upcomingPane: { width: 260, borderLeftWidth: 1, padding: 14 },
  upcomingTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  upcomingEmpty: { fontSize: 13, lineHeight: 18 },
  upcomingCard: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  upcomingSwatch: { width: 4, borderRadius: 2 },
  upcomingName: { fontSize: 13, fontWeight: '700' },
  upcomingMeta: { fontSize: 12, marginTop: 2 },
  detailOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  detailCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 18,
    zIndex: 1,
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
    }),
  },
  detailTitle: { fontSize: 18, fontWeight: '700' },
  detailLine: { fontSize: 14, marginTop: 6 },
  detailActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  cancelBtn: { paddingVertical: 8 },
  cancelText: { color: '#FF3B30', fontWeight: '700', fontSize: 14 },
});
