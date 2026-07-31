/**
 * Admin Reviews — configure review URL, auto review emails, and simple counts.
 */
import React, { useEffect, useState, useCallback } from 'react';
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
import * as restaurantService from '../../services/restaurantService';
import { supabase } from '../../config/supabase';

export default function ReviewsScreen() {
  const { theme } = useTheme();
  const { restaurant, refreshRestaurant } = useRestaurantContext();
  const c = theme.colors;

  const [reviewUrl, setReviewUrl] = useState(restaurant?.review_url ?? '');
  const [autoReview, setAutoReview] = useState(restaurant?.auto_review_emails ?? true);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState({ sent: 0, pending: 0, completed: 0 });
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    setReviewUrl(restaurant?.review_url ?? '');
    setAutoReview(restaurant?.auto_review_emails ?? true);
  }, [restaurant?.review_url, restaurant?.auto_review_emails]);

  const loadCounts = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingCounts(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, review_email_sent_at')
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'completed');

      if (error) throw error;
      const rows = data || [];
      const sent = rows.filter((r) => r.review_email_sent_at).length;
      const pending = rows.filter((r) => !r.review_email_sent_at).length;
      setCounts({ sent, pending, completed: rows.length });
    } catch {
      setCounts({ sent: 0, pending: 0, completed: 0 });
    } finally {
      setLoadingCounts(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleSave = async () => {
    if (!restaurant?.id) return;
    setSaving(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, {
        review_url: reviewUrl.trim() || null,
        auto_review_emails: autoReview,
      });
      await refreshRestaurant();
      Alert.alert('Saved', 'Review settings updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save review settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
          <Text style={[styles.statValue, { color: c.textPrimary }]}>
            {loadingCounts ? '—' : counts.sent}
          </Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>Review emails sent</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
          <Text style={[styles.statValue, { color: c.textPrimary }]}>
            {loadingCounts ? '—' : counts.pending}
          </Text>
          <Text style={[styles.statLabel, { color: c.textSecondary }]}>Pending (completed)</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Review link</Text>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Google, Yelp, or any public review page. Sent ~2 hours after an order is completed.
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

        {!restaurant?.email_domain_status || restaurant.email_domain_status !== 'verified' ? (
          <View style={[styles.warn, { backgroundColor: '#FFF3CD', borderColor: '#FFECB5' }]}>
            <Ionicons name="warning-outline" size={16} color="#856404" />
            <Text style={styles.warnText}>
              Verify your sending domain in Settings so review emails can send.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.brand }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save review settings</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 48, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
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
    marginTop: 16,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
