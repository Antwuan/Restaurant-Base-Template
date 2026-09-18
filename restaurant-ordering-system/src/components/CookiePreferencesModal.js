/**
 * CookiePreferencesModal — per-category consent switches.
 *
 * Desktop: centered fade modal. Mobile web: BottomSheet, same as the
 * pickup-location picker. Mounted once near the app root; opened from the
 * banner's "Manage" button or any "Cookie preferences" link.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import BottomSheet, { useMobileBottomSheet } from './BottomSheet';
import { useCookieConsent } from '../context/CookieConsentContext';
import { COOKIE_CATEGORIES } from './cookiePolicyData';
import { useTheme } from '../theme';

function CategoryRow({ category, value, onChange, brandColor, colors }) {
  const locked = category.locked;

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
          {category.title}
        </Text>
        <Text style={[styles.rowSummary, { color: colors.textSecondary }]}>
          {category.summary}
        </Text>
      </View>

      {locked ? (
        <View style={[styles.lockedPill, { backgroundColor: colors.backgroundSunken }]}>
          <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
          <Text style={[styles.lockedPillText, { color: colors.textSecondary }]}>
            Always on
          </Text>
        </View>
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#d4d4d4', true: brandColor }}
          thumbColor="#fff"
          accessibilityLabel={`${category.title} storage`}
        />
      )}
    </View>
  );
}

export default function CookiePreferencesModal() {
  const {
    consent,
    preferencesOpen,
    closePreferences,
    savePreferences,
    acceptAll,
    rejectNonEssential,
  } = useCookieConsent();
  const { theme } = useTheme();
  const mobileSheet = useMobileBottomSheet();

  const colors = theme.colors;
  const brandColor = colors.brand;

  const [draft, setDraft] = useState({ preferences: false, marketing: false });

  // Re-seed from the saved record every time the sheet opens.
  useEffect(() => {
    if (!preferencesOpen) return;
    setDraft({
      preferences: consent?.preferences === true,
      marketing: consent?.marketing === true,
    });
  }, [preferencesOpen, consent]);

  const body = (
    <View style={[styles.card, { backgroundColor: colors.backgroundCard }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Cookie preferences
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            This site stores information in your browser rather than in cookies.
            Choose what you are comfortable with.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.backgroundSunken }]}
          onPress={closePreferences}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close cookie preferences"
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {COOKIE_CATEGORIES.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            value={draft[category.id] === true}
            onChange={(next) =>
              setDraft((prev) => ({ ...prev, [category.id]: next }))
            }
            brandColor={brandColor}
            colors={colors}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={rejectNonEssential}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
              Reject non-essential
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={acceptAll}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
              Accept all
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: brandColor }]}
          onPress={() => savePreferences(draft)}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>Save choices</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (mobileSheet) {
    return (
      <BottomSheet visible={preferencesOpen} onClose={closePreferences}>
        {body}
      </BottomSheet>
    );
  }

  return (
    <Modal
      visible={preferencesOpen}
      transparent
      animationType="fade"
      onRequestClose={closePreferences}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={closePreferences}>
        <Pressable style={styles.desktopShell} onPress={() => {}}>
          {body}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  desktopShell: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  card: {
    padding: 20,
    paddingTop: 16,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: { fontSize: 13, lineHeight: 19 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0, flexShrink: 1, maxHeight: 380 },
  scrollContent: { gap: 10, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  rowSummary: { fontSize: 12, lineHeight: 17 },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 2,
  },
  lockedPillText: { fontSize: 11, fontWeight: '600' },
  footer: { marginTop: 16, gap: 10 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
  saveBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
