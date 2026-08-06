// Admin settings screen. Lets staff edit restaurant contact info, hours of operation,
// toggle accepting orders, switch dark theme, contact support, and sign out.
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import * as restaurantService from '../../services/restaurantService';
import { manageEmailDomain } from '../../services/emailApi';
import { confirmAsync } from '../../utils/confirm';
import {
  DAY_KEYS,
  DAY_LABELS,
  resolveHours,
} from '../../utils/hoursUtils';

// Time options in 15-min increments
const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    TIME_OPTIONS.push(`${hh}:${mm}`);
  }
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Dropdown time picker — shows a modal list of 15-min intervals
function TimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={tp.field}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={tp.fieldText}>{formatTime12(value || '09:00')}</Text>
        <Ionicons name="chevron-down" size={11} color="#999" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={tp.backdrop} onPress={() => setOpen(false)}>
          <View style={tp.dropdownCard}>
            <ScrollView
              style={tp.dropdownScroll}
              showsVerticalScrollIndicator
              contentContainerStyle={{ paddingVertical: 4 }}
            >
              {TIME_OPTIONS.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[tp.option, t === value && tp.optionActive]}
                  onPress={() => { onChange(t); setOpen(false); }}
                >
                  <Text style={[tp.optionText, t === value && tp.optionActiveText]}>
                    {formatTime12(t)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const tp = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    minWidth: 100,
  },
  fieldText: { fontSize: 13, fontWeight: '500', color: '#111', flex: 1, textAlign: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 180,
    maxHeight: 300,
    ...Platform.select({
      web: { boxShadow: '0 4px 24px rgba(0,0,0,0.15)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 300 },
  option: { paddingVertical: 10, paddingHorizontal: 16 },
  optionActive: { backgroundColor: '#f0f0f0' },
  optionText: { fontSize: 14, color: '#333' },
  optionActiveText: { fontWeight: '700', color: '#111' },
});

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { restaurant, refreshRestaurant } = useRestaurantContext();
  const { theme, isDarkMode, setDarkMode } = useTheme();

  const [phone, setPhone] = useState(restaurant?.phone ?? '');
  const [email, setEmail] = useState(restaurant?.email ?? '');
  const [address, setAddress] = useState(restaurant?.address ?? '');
  const [acceptingOrders, setAcceptingOrders] = useState(
    restaurant?.is_accepting_orders ?? true,
  );
  const [hours, setHours] = useState(() => resolveHours(restaurant?.hours_of_operation));
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Email domain onboarding
  const [sendDomain, setSendDomain] = useState('');
  const [fromLocal, setFromLocal] = useState('hello');
  const [dnsRecords, setDnsRecords] = useState([]);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainStatus, setDomainStatus] = useState(restaurant?.email_domain_status ?? 'pending');
  const [fromEmailDisplay, setFromEmailDisplay] = useState(restaurant?.resend_from_email ?? '');

  useEffect(() => {
    setDomainStatus(restaurant?.email_domain_status ?? 'pending');
    setFromEmailDisplay(restaurant?.resend_from_email ?? '');
  }, [restaurant?.email_domain_status, restaurant?.resend_from_email]);

  const updateDayHours = (dayKey, field, value) => {
    setHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!restaurant?.id) return;
    setSaving(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, {
        phone,
        email,
        address,
        is_accepting_orders: acceptingOrders,
        hours_of_operation: hours,
      });
      await refreshRestaurant();
      Alert.alert('Saved', 'Restaurant settings updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    const confirmed = await confirmAsync({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      confirmText: 'Sign Out',
      destructive: true,
    });
    if (!confirmed) return;

    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      Alert.alert('Error', 'Could not sign out.');
      setSigningOut(false);
    }
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@yourdomain.com');
  };

  const handleCreateDomain = async () => {
    if (!restaurant?.id) return;
    if (!sendDomain.trim()) {
      Alert.alert('Domain required', 'Enter a sending subdomain (e.g. mail.yourrestaurant.com).');
      return;
    }
    setDomainBusy(true);
    try {
      const result = await manageEmailDomain({
        action: 'create',
        restaurantId: restaurant.id,
        domain: sendDomain.trim().toLowerCase(),
        fromLocalPart: fromLocal.trim() || 'hello',
      });
      setDnsRecords(result.records || []);
      setDomainStatus(result.status || 'pending');
      setFromEmailDisplay(result.fromEmail || '');
      await refreshRestaurant();
      Alert.alert('Domain created', 'Add the DNS records below, then click Verify.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not create domain.');
    } finally {
      setDomainBusy(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!restaurant?.id) return;
    setDomainBusy(true);
    try {
      const result = await manageEmailDomain({
        action: 'verify',
        restaurantId: restaurant.id,
      });
      setDnsRecords(result.records || []);
      setDomainStatus(result.status || 'pending');
      if (result.fromEmail) setFromEmailDisplay(result.fromEmail);
      await refreshRestaurant();
      if (result.status === 'verified') {
        Alert.alert('Verified', 'Your sending domain is ready.');
      } else {
        Alert.alert('Still pending', `Status: ${result.status}. DNS can take a few minutes to propagate.`);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not verify domain.');
    } finally {
      setDomainBusy(false);
    }
  };

  const handleRefreshDomainStatus = async () => {
    if (!restaurant?.id || !restaurant?.resend_domain_id) return;
    setDomainBusy(true);
    try {
      const result = await manageEmailDomain({
        action: 'status',
        restaurantId: restaurant.id,
      });
      setDnsRecords(result.records || []);
      setDomainStatus(result.status || 'pending');
      await refreshRestaurant();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not refresh domain status.');
    } finally {
      setDomainBusy(false);
    }
  };

  const c = theme.colors;
  const statusColor =
    domainStatus === 'verified' ? '#155724' :
    domainStatus === 'failed' ? '#721C24' : '#856404';
  const statusBg =
    domainStatus === 'verified' ? '#D4EDDA' :
    domainStatus === 'failed' ? '#F8D7DA' : '#FFF3CD';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
      {/* ── Restaurant Info ───────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.textSecondary, marginBottom: 0 }]}>Restaurant Info</Text>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.brand }, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Phone Number</Text>
          <TextInput
            style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="(555) 000-0000"
            placeholderTextColor={c.textDisabled}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Contact Email</Text>
          <TextInput
            style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={email}
            onChangeText={setEmail}
            placeholder="hello@restaurant.com"
            placeholderTextColor={c.textDisabled}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Address</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St, City, State"
            placeholderTextColor={c.textDisabled}
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* ── Hours of Service ──────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.sectionTitle, { color: c.textSecondary, marginBottom: 2 }]}>Hours of Service</Text>
            <Text style={[styles.sectionSub, { color: c.textSecondary, marginBottom: 0 }]}>
              Used on the location card and for catering scheduling.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.brand }, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {DAY_KEYS.map((key) => {
          const day = hours[key] || {};
          const isClosed = !!day.closed;
          return (
            <View
              key={key}
              style={[styles.hoursRow, { borderTopColor: c.border }]}
            >
              {/* Toggle + day name */}
              <View style={styles.hoursDayCol}>
                <Switch
                  value={!isClosed}
                  onValueChange={(val) => updateDayHours(key, 'closed', !val)}
                  trackColor={{ true: '#111', false: '#ccc' }}
                  thumbColor="#fff"
                  style={styles.hoursSwitch}
                />
                <Text style={[styles.hoursDay, { color: isClosed ? c.textDisabled : c.textPrimary }]}>
                  {DAY_LABELS[key]}
                </Text>
              </View>

              {/* From / To pickers or closed indicator */}
              <View style={styles.hoursTimeCol}>
                {isClosed ? (
                  <>
                    <View style={styles.closedSlot}>
                      <Ionicons name="moon-outline" size={14} color={c.textDisabled} />
                      <Text style={[styles.closedSlotText, { color: c.textDisabled }]}>Closed</Text>
                    </View>
                    <View style={styles.closedSlot}>
                      <Ionicons name="moon-outline" size={14} color={c.textDisabled} />
                      <Text style={[styles.closedSlotText, { color: c.textDisabled }]}>Closed</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.hoursTimeGroup}>
                      <Text style={[styles.hoursTimeLabel, { color: c.textSecondary }]}>From</Text>
                      <TimePicker
                        value={day.open || '09:00'}
                        onChange={(v) => updateDayHours(key, 'open', v)}
                      />
                    </View>
                    <View style={styles.hoursTimeGroup}>
                      <Text style={[styles.hoursTimeLabel, { color: c.textSecondary }]}>To</Text>
                      <TimePicker
                        value={day.close || '17:30'}
                        onChange={(v) => updateDayHours(key, 'close', v)}
                      />
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Appearance ────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Appearance</Text>
        <View style={styles.row}>
          <View>
            <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Dark Theme</Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>
              {isDarkMode ? 'Dark mode is on' : 'Light mode is on'}
            </Text>
          </View>
          <Switch
            value={isDarkMode}
            onValueChange={setDarkMode}
            trackColor={{ true: c.brand, false: '#ccc' }}
          />
        </View>
      </View>

      {/* ── Email / Resend domain ─────────────────────────── */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Transactional email</Text>
        <Text style={[styles.sectionSub, { color: c.textSecondary }]}>
          Verify a sending subdomain in Resend so order confirmations, pickup alerts, and marketing send from your brand.
        </Text>

        <View style={[styles.domainStatusPill, { backgroundColor: statusBg }]}>
          <Text style={[styles.domainStatusText, { color: statusColor }]}>
            Status: {domainStatus || 'pending'}
          </Text>
        </View>

        {fromEmailDisplay ? (
          <Text style={[styles.rowSub, { color: c.textSecondary, marginBottom: 10 }]}>
            From: {fromEmailDisplay}
          </Text>
        ) : null}

        {!restaurant?.resend_domain_id ? (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.textSecondary }]}>Sending domain</Text>
              <TextInput
                style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
                value={sendDomain}
                onChangeText={setSendDomain}
                placeholder="mail.yourrestaurant.com"
                placeholderTextColor={c.textDisabled}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: c.textSecondary }]}>From local-part</Text>
              <TextInput
                style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
                value={fromLocal}
                onChangeText={setFromLocal}
                placeholder="hello"
                placeholderTextColor={c.textDisabled}
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: c.brand, alignSelf: 'flex-start' }, domainBusy && styles.saveBtnDisabled]}
              onPress={handleCreateDomain}
              disabled={domainBusy}
            >
              {domainBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Create domain</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: c.brand }, domainBusy && styles.saveBtnDisabled]}
              onPress={handleVerifyDomain}
              disabled={domainBusy}
            >
              {domainBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Verify DNS</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: c.backgroundSunken, borderWidth: 1, borderColor: c.border }, domainBusy && styles.saveBtnDisabled]}
              onPress={handleRefreshDomainStatus}
              disabled={domainBusy}
            >
              <Text style={[styles.saveBtnText, { color: c.textPrimary }]}>Refresh status</Text>
            </TouchableOpacity>
          </View>
        )}

        {dnsRecords.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <Text style={[styles.label, { color: c.textSecondary }]}>DNS records to add</Text>
            {dnsRecords.map((rec, idx) => (
              <View key={idx} style={[styles.dnsRow, { borderColor: c.border, backgroundColor: c.backgroundSunken }]}>
                <Text style={[styles.dnsType, { color: c.brand }]}>{rec.type || rec.record}</Text>
                <Text style={[styles.dnsLine, { color: c.textPrimary }]} selectable>
                  Name: {rec.name || rec.host || '—'}
                </Text>
                <Text style={[styles.dnsLine, { color: c.textSecondary }]} selectable>
                  Value: {rec.value || rec.content || '—'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* ── Order Settings ────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.textSecondary, marginBottom: 0 }]}>Order Settings</Text>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.brand }, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <View>
            <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Accepting Orders</Text>
            <Text style={[styles.rowSub, { color: c.textSecondary }]}>
              {acceptingOrders ? 'Customers can place orders' : 'Orders are paused'}
            </Text>
          </View>
          <Switch
            value={acceptingOrders}
            onValueChange={setAcceptingOrders}
            trackColor={{ true: '#34C759', false: '#ccc' }}
          />
        </View>
      </View>

      {/* ── Account ───────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Account</Text>

        <TouchableOpacity style={styles.linkRow} onPress={handleContactSupport}>
          <Text style={[styles.linkText, { color: c.brand }]}>Contact Support</Text>
          <Text style={[styles.chevron, { color: c.textDisabled }]}>›</Text>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <TouchableOpacity
          style={[styles.signOutBtn, signingOut && { opacity: 0.6 }]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FF3B30" size="small" />
          ) : (
            <Text style={styles.signOutText}>Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={[styles.version, { color: c.textDisabled }]}>
        v1.0.0 — {restaurant?.name}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 48 },
  section: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 15,
  },
  field: { marginBottom: 10 },
  label: { fontSize: 12, marginBottom: 4, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  inputMultiline: { height: 52, textAlignVertical: 'top' },
  saveBtn: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Hours rows
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    gap: 10,
  },
  hoursDayCol: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 },
  hoursSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  hoursDay: { fontSize: 13, fontWeight: '600' },
  hoursTimeCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hoursTimeGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hoursTimeLabel: { fontSize: 11, color: '#999', minWidth: 24 },
  closedSlot: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 72 },
  closedSlotText: { fontSize: 11 },

  // Other rows
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  rowLabel: { fontSize: 14, fontWeight: '500' },
  rowSub: { fontSize: 11, marginTop: 1 },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: { fontSize: 14 },
  chevron: { fontSize: 18 },
  divider: { height: 1, marginVertical: 2 },
  signOutBtn: { paddingVertical: 8, alignItems: 'flex-start' },
  signOutText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 11, marginTop: 4 },
  domainStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  domainStatusText: { fontSize: 12, fontWeight: '700' },
  dnsRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 2,
  },
  dnsType: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2 },
  dnsLine: { fontSize: 12, lineHeight: 16 },
});
