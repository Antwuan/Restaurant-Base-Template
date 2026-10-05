/**
 * Admin Marketing — review outreach and broadcast history.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { listEmailBroadcasts } from '../../services/emailApi';
import { getReviewOutreachCounts } from '../../services/reviewService';
import * as restaurantService from '../../services/restaurantService';
import { isAppointmentBusiness } from '../../utils/businessType';
import PromoCodesSection from '../../components/admin/PromoCodesSection';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function rate(part, whole) {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function promoLabel(row) {
  const code = row.promo_codes?.code;
  const title = row.promo_codes?.title;
  if (!code && !title) return null;
  if (code && title) return `${code} · ${title}`;
  return code || title;
}

export default function MarketingScreen() {
  const { theme } = useTheme();
  const { restaurant, refreshRestaurant } = useRestaurantContext();
  const c = theme.colors;
  const appointment = isAppointmentBusiness(restaurant);

  const [autoReview, setAutoReview] = useState(restaurant?.auto_review_emails ?? true);
  const [reviewUrl, setReviewUrl] = useState(restaurant?.review_url ?? '');
  const [savingOutreach, setSavingOutreach] = useState(false);
  const [counts, setCounts] = useState({ sent: 0, pending: 0, completed: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);

  useEffect(() => {
    setAutoReview(restaurant?.auto_review_emails ?? true);
    setReviewUrl(restaurant?.review_url ?? '');
  }, [restaurant?.auto_review_emails, restaurant?.review_url]);

  const loadCounts = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingCounts(true);
    try {
      const data = await getReviewOutreachCounts(restaurant.id);
      setCounts(data);
    } catch {
      setCounts({ sent: 0, pending: 0, completed: 0 });
    } finally {
      setLoadingCounts(false);
    }
  }, [restaurant?.id]);

  const loadBroadcasts = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingBroadcasts(true);
    try {
      const data = await listEmailBroadcasts(restaurant.id);
      setBroadcasts(data);
    } catch {
      setBroadcasts([]);
    } finally {
      setLoadingBroadcasts(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    loadCounts();
    loadBroadcasts();
  }, [loadCounts, loadBroadcasts]);

  const handleSaveOutreach = async () => {
    if (!restaurant?.id) return;
    setSavingOutreach(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, {
        auto_review_emails: autoReview,
        review_url: reviewUrl.trim() || null,
      });
      await refreshRestaurant();
      Alert.alert('Saved', 'Review outreach settings updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save settings.');
    } finally {
      setSavingOutreach(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
      {appointment ? <PromoCodesSection /> : null}

      {/* Review outreach */}
      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Review outreach</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          After an order is completed, we email a signed in-app review link. Optional external URL is kept for your records.
        </Text>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: c.backgroundSunken, borderColor: c.border }]}>
            <Text style={[styles.statValue, { color: c.textPrimary }]}>
              {loadingCounts ? '—' : counts.sent}
            </Text>
            <Text style={[styles.statLabel, { color: c.textSecondary }]}>Emails sent</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: c.backgroundSunken, borderColor: c.border }]}>
            <Text style={[styles.statValue, { color: c.textPrimary }]}>
              {loadingCounts ? '—' : counts.pending}
            </Text>
            <Text style={[styles.statLabel, { color: c.textSecondary }]}>Pending completed</Text>
          </View>
        </View>

        <View style={[styles.row, { borderTopColor: c.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowLabel, { color: c.textPrimary }]}>Auto review emails</Text>
            <Text style={[styles.hint, { color: c.textSecondary, marginBottom: 0 }]}>
              Schedule a review request when orders are marked completed
            </Text>
          </View>
          <Switch
            value={autoReview}
            onValueChange={setAutoReview}
            trackColor={{ true: c.brand, false: '#ccc' }}
          />
        </View>

        <Text style={[styles.label, { color: c.textSecondary, marginTop: 4 }]}>
          External review URL (optional)
        </Text>
        <TextInput
          style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
          value={reviewUrl}
          onChangeText={setReviewUrl}
          placeholder="https://g.page/r/..."
          placeholderTextColor={c.textDisabled}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {!restaurant?.email_domain_status || restaurant.email_domain_status !== 'verified' ? (
          <View style={[styles.warn, { backgroundColor: '#FFF3CD', borderColor: '#FFECB5' }]}>
            <Ionicons name="warning-outline" size={16} color="#856404" />
            <Text style={styles.warnText}>
              Verify your sending domain in Settings so review emails can send.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.brand }, savingOutreach && { opacity: 0.6 }]}
          onPress={handleSaveOutreach}
          disabled={savingOutreach}
        >
          {savingOutreach ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save outreach settings</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Broadcast history */}
      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={styles.historyHeader}>
          <Text style={[styles.sectionTitle, { color: c.textSecondary, marginBottom: 0 }]}>
            Broadcast history
          </Text>
          <TouchableOpacity onPress={loadBroadcasts} hitSlop={8}>
            <Ionicons name="refresh" size={18} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Delivered, opened, and clicked counts update from Resend webhooks.
        </Text>

        {loadingBroadcasts ? (
          <ActivityIndicator color={c.brand} style={{ marginVertical: 16 }} />
        ) : broadcasts.length === 0 ? (
          <Text style={[styles.emptyHistory, { color: c.textDisabled }]}>
            {appointment
              ? 'No broadcasts yet. Create a promo above to email customers.'
              : 'No broadcasts yet. Send from Rewards when creating a promo.'}
          </Text>
        ) : (
          broadcasts.map((b) => {
            const delivered = b.delivered_count ?? 0;
            const opened = b.opened_count ?? 0;
            const clicked = b.clicked_count ?? 0;
            const promo = promoLabel(b);
            return (
              <View
                key={b.id}
                style={[styles.broadcastRow, { borderTopColor: c.border }]}
              >
                <Text style={[styles.broadcastSubject, { color: c.textPrimary }]} numberOfLines={1}>
                  {b.subject || '(no subject)'}
                </Text>
                {promo ? (
                  <Text style={[styles.broadcastPromo, { color: c.textSecondary }]} numberOfLines={1}>
                    {promo}
                  </Text>
                ) : null}
                <Text style={[styles.broadcastMeta, { color: c.textSecondary }]}>
                  {formatDateTime(b.sent_at || b.created_at)}
                  {b.name ? ` · ${b.name}` : ''}
                </Text>
                <View style={styles.metricsRow}>
                  <Metric label="Delivered" value={delivered} colors={c} />
                  <Metric label="Opened" value={opened} sub={rate(opened, delivered)} colors={c} />
                  <Metric label="Clicked" value={clicked} sub={rate(clicked, delivered)} colors={c} />
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function Metric({ label, value, sub, colors }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      {sub ? <Text style={[styles.metricSub, { color: colors.textDisabled }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 48, gap: 12 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  hint: { fontSize: 11, marginBottom: 8, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    marginTop: 8,
  },
  rowLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  warn: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  warnText: { flex: 1, fontSize: 12, color: '#856404', lineHeight: 17 },
  saveBtn: {
    marginTop: 14,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  emptyHistory: { fontSize: 13, paddingVertical: 12 },
  broadcastRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  broadcastSubject: { fontSize: 14, fontWeight: '700' },
  broadcastPromo: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  broadcastMeta: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 6,
  },
  metricValue: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 11, marginTop: 2 },
  metricSub: { fontSize: 10, marginTop: 1 },
});
