/**
 * Admin Applications Screen
 * Lists submitted job applications and lets staff view details + open resumes.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { listApplications } from '../../services/applicationsService';
import { getApplicationPDFUrl } from '../../services/storageService';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function ApplicationDetailModal({ application, onClose }) {
  const { theme } = useTheme();
  const c = theme.colors;

  if (!application) return null;

  const pdfUrl = getApplicationPDFUrl(application.resume_path);

  const handleViewResume = () => {
    if (pdfUrl) Linking.openURL(pdfUrl);
  };

  return (
    <Modal
      visible={!!application}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={dm.backdrop} onPress={onClose}>
        <Pressable style={[dm.card, { backgroundColor: c.backgroundCard }]} onPress={() => {}}>
          {/* Close button */}
          <TouchableOpacity style={dm.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={18} color="#555" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={dm.body}>
            {/* Header */}
            <View style={dm.header}>
              <View style={[dm.avatar, { backgroundColor: c.brandLight }]}>
                <Text style={[dm.avatarText, { color: c.brand }]}>
                  {(application.full_name || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={dm.headerText}>
                <Text style={[dm.name, { color: c.textPrimary }]}>{application.full_name}</Text>
                <Text style={[dm.date, { color: c.textSecondary }]}>
                  Applied {formatDateTime(application.created_at)}
                </Text>
              </View>
            </View>

            {/* Fields */}
            <View style={dm.fields}>
              <DetailRow label="Email" value={application.email} icon="mail-outline" brandColor={c.brand} />
              {application.phone ? (
                <DetailRow label="Phone" value={application.phone} icon="call-outline" brandColor={c.brand} />
              ) : null}
              {application.comment ? (
                <View style={dm.fieldBlock}>
                  <Text style={[dm.fieldLabel, { color: c.textSecondary }]}>Comment</Text>
                  <Text style={[dm.fieldValue, { color: c.textPrimary }]}>{application.comment}</Text>
                </View>
              ) : null}
            </View>

            {/* Resume */}
            {pdfUrl ? (
              <TouchableOpacity
                style={[dm.resumeBtn, { backgroundColor: c.brand }]}
                onPress={handleViewResume}
                activeOpacity={0.85}
              >
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={dm.resumeBtnText}>View Resume (PDF)</Text>
              </TouchableOpacity>
            ) : (
              <View style={[dm.noResume, { borderColor: c.border }]}>
                <Ionicons name="document-outline" size={18} color={c.textDisabled} />
                <Text style={[dm.noResumeText, { color: c.textDisabled }]}>No resume attached</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value, icon, brandColor }) {
  return (
    <View style={dm.fieldRow}>
      <Ionicons name={icon} size={15} color={brandColor} style={{ marginTop: 1 }} />
      <View>
        <Text style={dm.fieldRowLabel}>{label}</Text>
        <Text style={dm.fieldRowValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ApplicationsScreen() {
  const { theme } = useTheme();
  const { restaurant } = useRestaurantContext();
  const c = theme.colors;

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listApplications(restaurant.id);
      setApplications(data);
    } catch (e) {
      setError(e.message || 'Could not load applications.');
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[s.root, { backgroundColor: c.background }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[s.pageHeader, { borderBottomColor: c.border }]}>
        <Text style={[s.pageTitle, { color: c.textPrimary }]}>Applications</Text>
        <TouchableOpacity onPress={load} style={s.refreshBtn} disabled={loading}>
          <Ionicons
            name={loading ? 'hourglass-outline' : 'refresh-outline'}
            size={20}
            color={c.brand}
          />
        </TouchableOpacity>
      </View>

      {/* ── Content ────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={36} color="#ccc" />
          <Text style={[s.emptyText, { color: c.textSecondary }]}>{error}</Text>
          <TouchableOpacity onPress={load} style={[s.retryBtn, { borderColor: c.brand }]}>
            <Text style={[s.retryText, { color: c.brand }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : applications.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="document-text-outline" size={40} color="#ccc" />
          <Text style={[s.emptyTitle, { color: c.textPrimary }]}>No applications yet</Text>
          <Text style={[s.emptyText, { color: c.textSecondary }]}>
            Submitted applications will appear here.
          </Text>
        </View>
      ) : (
        <ScrollView style={s.list} contentContainerStyle={s.listContent}>
          {applications.map((app, index) => (
            <TouchableOpacity
              key={app.id}
              style={[
                s.row,
                { backgroundColor: c.backgroundCard, borderColor: c.border },
                index === 0 && { marginTop: 0 },
              ]}
              onPress={() => setSelected(app)}
              activeOpacity={0.75}
            >
              <View style={[s.rowAvatar, { backgroundColor: c.brandLight }]}>
                <Text style={[s.rowAvatarText, { color: c.brand }]}>
                  {(app.full_name || '?')[0].toUpperCase()}
                </Text>
              </View>

              <View style={s.rowBody}>
                <Text style={[s.rowName, { color: c.textPrimary }]} numberOfLines={1}>
                  {app.full_name}
                </Text>
                <Text style={[s.rowEmail, { color: c.textSecondary }]} numberOfLines={1}>
                  {app.email}
                </Text>
              </View>

              <View style={s.rowMeta}>
                {app.resume_path ? (
                  <View style={[s.badge, { backgroundColor: c.brandLight }]}>
                    <Ionicons name="document-attach-outline" size={12} color={c.brand} />
                    <Text style={[s.badgeText, { color: c.brand }]}>PDF</Text>
                  </View>
                ) : null}
                <Text style={[s.rowDate, { color: c.textDisabled }]}>
                  {formatDate(app.created_at)}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={16} color={c.textDisabled} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Detail modal */}
      <ApplicationDetailModal
        application={selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pageTitle: { fontSize: 22, fontWeight: '800' },
  refreshBtn: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  retryText: { fontSize: 14, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowAvatarText: { fontSize: 16, fontWeight: '700' },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowEmail: { fontSize: 13 },
  rowMeta: { alignItems: 'flex-end', gap: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  rowDate: { fontSize: 12 },
});

const dm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '90%',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: 24, gap: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24, paddingRight: 32 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800' },
  headerText: { flex: 1 },
  name: { fontSize: 18, fontWeight: '800' },
  date: { fontSize: 12, marginTop: 2 },
  fields: { gap: 14, marginBottom: 24 },
  fieldRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  fieldRowLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldRowValue: { fontSize: 14, color: '#111', marginTop: 1 },
  fieldBlock: { gap: 4 },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  fieldValue: { fontSize: 14, lineHeight: 20 },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
  },
  resumeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  noResume: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  noResumeText: { fontSize: 14 },
});
