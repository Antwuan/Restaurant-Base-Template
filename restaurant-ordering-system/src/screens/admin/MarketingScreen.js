/**
 * Admin Marketing — compose and send a Resend broadcast to the restaurant segment.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { sendBroadcast } from '../../services/emailApi';
import { confirmAsync } from '../../utils/confirm';

const UNSUBSCRIBE_TOKEN = '{{{RESEND_UNSUBSCRIBE_URL}}}';

const DEFAULT_HTML = `<p>Hi {{{FIRST_NAME|there}}},</p>
<p>We have something special for you this week.</p>
<p><a href="${UNSUBSCRIBE_TOKEN}">Unsubscribe</a></p>`;

export default function MarketingScreen() {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const c = theme.colors;

  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [sending, setSending] = useState(false);

  const domainOk = restaurant?.email_domain_status === 'verified' && restaurant?.resend_from_email;
  const segmentOk = Boolean(restaurant?.resend_segment_id && restaurant?.resend_marketing_topic_id);

  const previewHtml = useMemo(() => {
    return html
      .replaceAll(UNSUBSCRIBE_TOKEN, '#unsubscribe')
      .replaceAll('{{{FIRST_NAME|there}}}', 'there');
  }, [html]);

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

      <View style={[styles.card, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
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
    </ScrollView>
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
});
