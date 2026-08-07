/**
 * Admin Marketing — review outreach, promo composer, and broadcast history.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { sendBroadcast, listEmailBroadcasts } from '../../services/emailApi';
import { getReviewOutreachCounts } from '../../services/reviewService';
import * as restaurantService from '../../services/restaurantService';
import * as promoService from '../../services/promoService';
import { confirmAsync } from '../../utils/confirm';

const UNSUBSCRIBE_TOKEN = '{{{RESEND_UNSUBSCRIBE_URL}}}';

const DEFAULT_HTML = `<p>Hi {{{FIRST_NAME|there}}},</p>
<p>We have something special for you this week.</p>
<p><a href="${UNSUBSCRIBE_TOKEN}">Unsubscribe</a></p>`;

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

export default function MarketingScreen() {
  const { theme } = useTheme();
  const { restaurant, refreshRestaurant } = useRestaurantContext();
  const c = theme.colors;

  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [sending, setSending] = useState(false);

  const [autoReview, setAutoReview] = useState(restaurant?.auto_review_emails ?? true);
  const [reviewUrl, setReviewUrl] = useState(restaurant?.review_url ?? '');
  const [savingOutreach, setSavingOutreach] = useState(false);
  const [counts, setCounts] = useState({ sent: 0, pending: 0, completed: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [broadcasts, setBroadcasts] = useState([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);
  const [promos, setPromos] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [selectedPromoId, setSelectedPromoId] = useState(null);

  const domainOk = restaurant?.email_domain_status === 'verified' && restaurant?.resend_from_email;
  const segmentOk = Boolean(restaurant?.resend_segment_id && restaurant?.resend_marketing_topic_id);
  const selectedPromo = useMemo(
    () => promos.find((p) => p.id === selectedPromoId) || null,
    [promos, selectedPromoId],
  );

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

  const loadPromos = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingPromos(true);
    try {
      const data = await promoService.getActivePromos(restaurant.id);
      setPromos(data);
      setSelectedPromoId((prev) => {
        if (prev && data.some((p) => p.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch {
      setPromos([]);
      setSelectedPromoId(null);
    } finally {
      setLoadingPromos(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    loadCounts();
    loadBroadcasts();
    loadPromos();
  }, [loadCounts, loadBroadcasts, loadPromos]);

  const insertPromoIntoHtml = () => {
    if (!selectedPromo) {
      Alert.alert('No promo', 'Create an active marketing promo on the Rewards screen first.');
      return;
    }
    const snippet = promoService.formatPromoEmailHtml(selectedPromo);
    setHtml((prev) => {
      const unsubIdx = prev.indexOf(UNSUBSCRIBE_TOKEN);
      if (unsubIdx === -1) return `${prev.trimEnd()}\n${snippet}`;
      const before = prev.slice(0, unsubIdx);
      const pStart = before.lastIndexOf('<p');
      if (pStart >= 0) {
        return `${prev.slice(0, pStart)}${snippet}${prev.slice(pStart)}`;
      }
      return `${prev.slice(0, unsubIdx)}${snippet}${prev.slice(unsubIdx)}`;
    });
  };

  const copyPromoBlurb = async () => {
    if (!selectedPromo) {
      Alert.alert('No promo', 'Create an active marketing promo on the Rewards screen first.');
      return;
    }
    const blurb = promoService.formatPromoEmailBlurb(selectedPromo);
    try {
      await promoService.copyTextToClipboard(blurb);
      Alert.alert('Copied', 'Promo blurb copied to clipboard.');
    } catch {
      Alert.alert('Promo blurb', blurb);
    }
  };

  const previewHtml = useMemo(() => {
    return html
      .replaceAll(UNSUBSCRIBE_TOKEN, '#unsubscribe')
      .replaceAll('{{{FIRST_NAME|there}}}', 'there');
  }, [html]);

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

  const handleSend = async () => {
    if (!restaurant?.id) return;
    if (!subject.trim()) {
      Alert.alert('Missing subject', 'Enter a subject line.');
      return;
    }
    if (!html.includes(UNSUBSCRIBE_TOKEN)) {
      Alert.alert(
        'Unsubscribe required',
        `Include ${UNSUBSCRIBE_TOKEN} in the email body.`,
      );
      return;
    }
    if (!domainOk || !segmentOk) {
      Alert.alert(
        'Email not ready',
        'Verify your sending domain in Settings before sending marketing emails.',
      );
      return;
    }

    const confirmed = await confirmAsync({
      title: 'Send broadcast?',
      message: `Send “${subject.trim()}” to opted-in contacts for ${restaurant.name}?`,
      confirmText: 'Send',
    });
    if (!confirmed) return;

    setSending(true);
    try {
      await sendBroadcast({
        restaurantId: restaurant.id,
        subject: subject.trim(),
        html: html.trim(),
        previewText: previewText.trim() || undefined,
      });
      Alert.alert('Sent', 'Your marketing email is on its way.');
      setSubject('');
      setPreviewText('');
      setHtml(DEFAULT_HTML);
      loadBroadcasts();
    } catch (e) {
      Alert.alert('Send failed', e.message || 'Could not send broadcast.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
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

      {!domainOk || !segmentOk ? (
        <View style={[styles.banner, { backgroundColor: '#FFF3CD', borderColor: '#FFECB5' }]}>
          <Ionicons name="warning-outline" size={18} color="#856404" />
          <Text style={styles.bannerText}>
            Complete email domain setup in Settings (verified domain + marketing segment) before sending.
          </Text>
        </View>
      ) : (
        <View style={[styles.banner, { backgroundColor: '#D4EDDA', borderColor: '#C3E6CB' }]}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#155724" />
          <Text style={[styles.bannerText, { color: '#155724' }]}>
            Sending as {restaurant.resend_from_email}
          </Text>
        </View>
      )}

      {/* Promo composer */}
      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Promo broadcast</Text>
        <Text style={[styles.label, { color: c.textSecondary }]}>Subject</Text>
        <TextInput
          style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
          value={subject}
          onChangeText={setSubject}
          placeholder="This week at the restaurant…"
          placeholderTextColor={c.textDisabled}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>Preview text</Text>
        <TextInput
          style={[styles.input, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
          value={previewText}
          onChangeText={setPreviewText}
          placeholder="Shown in inbox after the subject"
          placeholderTextColor={c.textDisabled}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>HTML body</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Must include {UNSUBSCRIBE_TOKEN}. You can use {'{{{FIRST_NAME|there}}}'}.
        </Text>

        <View style={[styles.promoHelper, { borderColor: c.border, backgroundColor: c.backgroundSunken }]}>
          <Text style={[styles.promoHelperTitle, { color: c.textPrimary }]}>Insert promo code</Text>
          <Text style={[styles.hint, { color: c.textSecondary, marginBottom: 8 }]}>
            Active codes from Rewards → Marketing promos.
          </Text>
          {loadingPromos ? (
            <ActivityIndicator color={c.brand} />
          ) : promos.length === 0 ? (
            <Text style={[styles.hint, { color: c.textSecondary, marginBottom: 0 }]}>
              No active promos yet. Create one on the Rewards screen.
            </Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={styles.promoChipRow}>
                  {promos.map((p) => {
                    const selected = p.id === selectedPromoId;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.promoChip,
                          {
                            borderColor: selected ? c.brand : c.border,
                            backgroundColor: selected ? c.brand : c.backgroundCard,
                          },
                        ]}
                        onPress={() => setSelectedPromoId(p.id)}
                      >
                        <Text style={{ color: selected ? '#fff' : c.textPrimary, fontWeight: '700', fontSize: 13 }}>
                          {p.code}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.promoActions}>
                <TouchableOpacity
                  style={[styles.promoActionBtn, { borderColor: c.border }]}
                  onPress={insertPromoIntoHtml}
                >
                  <Ionicons name="add-circle-outline" size={16} color={c.brand} />
                  <Text style={[styles.promoActionText, { color: c.brand }]}>Insert into HTML</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.promoActionBtn, { borderColor: c.border }]}
                  onPress={copyPromoBlurb}
                >
                  <Ionicons name="copy-outline" size={16} color={c.textSecondary} />
                  <Text style={[styles.promoActionText, { color: c.textSecondary }]}>Copy blurb</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <TextInput
          style={[
            styles.input,
            styles.htmlInput,
            { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border },
          ]}
          value={html}
          onChangeText={setHtml}
          multiline
          textAlignVertical="top"
          placeholderTextColor={c.textDisabled}
        />

        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: c.brand }, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={styles.sendText}>Send to marketing list</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Preview</Text>
        <Text style={[styles.previewSubject, { color: c.textPrimary }]}>
          {subject.trim() || '(no subject)'}
        </Text>
        {previewText ? (
          <Text style={[styles.hint, { color: c.textSecondary }]}>{previewText}</Text>
        ) : null}
        <View style={[styles.previewBox, { borderColor: c.border, backgroundColor: c.backgroundSunken }]}>
          <Text style={{ color: c.textPrimary, fontSize: 13, lineHeight: 20 }}>
            {previewHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
          </Text>
        </View>
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
            No broadcasts yet. Send a promo above to see metrics here.
          </Text>
        ) : (
          broadcasts.map((b) => {
            const delivered = b.delivered_count ?? 0;
            const opened = b.opened_count ?? 0;
            const clicked = b.clicked_count ?? 0;
            return (
              <View
                key={b.id}
                style={[styles.broadcastRow, { borderTopColor: c.border }]}
              >
                <Text style={[styles.broadcastSubject, { color: c.textPrimary }]} numberOfLines={1}>
                  {b.subject || '(no subject)'}
                </Text>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  bannerText: { flex: 1, fontSize: 13, color: '#856404', lineHeight: 18 },
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
  htmlInput: { minHeight: 160, fontFamily: 'monospace' },
  promoHelper: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  promoHelperTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  promoChipRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  promoChip: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promoActionText: { fontSize: 13, fontWeight: '600' },
  sendBtn: {
    marginTop: 18,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  previewSubject: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  previewBox: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 8 },
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
