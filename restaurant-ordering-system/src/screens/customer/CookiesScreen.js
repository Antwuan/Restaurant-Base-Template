/**
 * CookiesScreen — the Privacy & Cookies page at /cookies.
 *
 * The storage table is generated from STORAGE_INVENTORY so the page stays
 * honest about what the app actually writes. Template copy: a restaurant
 * launching this site should have its own counsel review the wording.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useRestaurantContext } from '../../context/RestaurantContext';
import { useCookieConsent } from '../../context/CookieConsentContext';
import {
  COOKIE_CATEGORIES,
  STORAGE_INVENTORY,
  STORE_LABEL,
} from '../../components/cookiePolicyData';
import { useTheme } from '../../theme';

const DESKTOP_BP = 768;

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function Section({ title, children, colors }) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children, colors }) {
  return <Text style={[s.paragraph, { color: colors.textSecondary }]}>{children}</Text>;
}

function StorageRow({ entry, colors, isDesktop }) {
  return (
    <View style={[s.tableRow, { borderColor: colors.border }, isDesktop && s.tableRowDesktop]}>
      <View style={isDesktop ? s.cellKeyDesktop : s.cellKey}>
        <Text style={[s.keyText, { color: colors.textPrimary }]}>{entry.key}</Text>
        <Text style={[s.storeText, { color: colors.textSecondary }]}>
          {STORE_LABEL[entry.store] || entry.store}
        </Text>
      </View>
      <View style={isDesktop ? s.cellBodyDesktop : s.cellBody}>
        <Text style={[s.purposeText, { color: colors.textSecondary }]}>{entry.purpose}</Text>
        <Text style={[s.retentionText, { color: colors.textSecondary }]}>
          {entry.retention}
        </Text>
      </View>
    </View>
  );
}

export default function CookiesScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const { consent, hasConsented, openPreferences } = useCookieConsent();
  const { width } = useWindowDimensions();

  const colors = theme.colors;
  const isDesktop = width >= DESKTOP_BP;
  const name = restaurant?.name || 'This restaurant';
  const decidedOn = formatDate(consent?.updatedAt);

  const grouped = COOKIE_CATEGORIES.map((category) => ({
    category,
    entries: STORAGE_INVENTORY.filter((entry) => entry.category === category.id),
  }));

  const contactEmail = restaurant?.email || null;
  const contactPhone = restaurant?.phone || null;

  return (
    <ScrollView
      style={[s.root, { backgroundColor: '#fff' }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.page, isDesktop && s.pageDesktop]}>
        {/* ── Header ─────────────────────────────────────────── */}
        <Text style={[s.eyebrow, { color: colors.brand }]}>Legal</Text>
        <Text style={[s.headline, { color: colors.textPrimary }]}>Privacy &amp; Cookies</Text>
        <Paragraph colors={colors}>
          {name} runs this ordering site. This page explains the information we
          keep in your browser, why we keep it, and how to change your choices.
        </Paragraph>

        {/* ── Current choice + manage ────────────────────────── */}
        <View style={[s.choiceCard, { borderColor: colors.border }]}>
          <View style={s.choiceText}>
            <Text style={[s.choiceTitle, { color: colors.textPrimary }]}>
              Your current choice
            </Text>
            <Text style={[s.choiceBody, { color: colors.textSecondary }]}>
              {hasConsented
                ? `Strictly necessary storage is on. Preferences ${
                    consent?.preferences ? 'allowed' : 'declined'
                  }, marketing ${consent?.marketing ? 'allowed' : 'declined'}${
                    decidedOn ? ` — saved ${decidedOn}` : ''
                  }.`
                : 'You have not made a choice yet. Only strictly necessary storage is in use.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.manageBtn, { backgroundColor: colors.brand }]}
            onPress={openPreferences}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="options-outline" size={15} color="#fff" />
            <Text style={s.manageBtnText}>Cookie preferences</Text>
          </TouchableOpacity>
        </View>

        {/* ── What we mean by cookies ────────────────────────── */}
        <Section title="Cookies and similar technologies" colors={colors}>
          <Paragraph colors={colors}>
            This site does not set advertising or tracking cookies, and it does
            not use cookies to sign you in. Instead it uses your browser&apos;s
            local storage and session storage — small pieces of data saved on
            your own device by the site itself.
          </Paragraph>
          <Paragraph colors={colors}>
            Local storage stays until it is removed. Session storage is cleared
            when you close the tab. Privacy rules such as GDPR and the CCPA treat
            these the same way as cookies, so we describe them here and ask for
            your consent before using anything that is not strictly necessary.
          </Paragraph>
        </Section>

        {/* ── Categories ─────────────────────────────────────── */}
        <Section title="What each category does" colors={colors}>
          {COOKIE_CATEGORIES.map((category) => (
            <View key={category.id} style={s.categoryBlock}>
              <View style={s.categoryHeading}>
                <Text style={[s.categoryTitle, { color: colors.textPrimary }]}>
                  {category.title}
                </Text>
                {category.locked ? (
                  <View style={s.lockedPill}>
                    <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
                    <Text style={[s.lockedPillText, { color: colors.textSecondary }]}>
                      Always on
                    </Text>
                  </View>
                ) : null}
              </View>
              <Paragraph colors={colors}>{category.summary}</Paragraph>
            </View>
          ))}
        </Section>

        {/* ── Full inventory ─────────────────────────────────── */}
        <Section title="Everything we store, key by key" colors={colors}>
          <Paragraph colors={colors}>
            You can see all of these in your browser&apos;s developer tools under
            Application → Storage.
          </Paragraph>
          {grouped.map(({ category, entries }) => (
            <View key={category.id} style={s.tableGroup}>
              <Text style={[s.tableGroupTitle, { color: colors.textPrimary }]}>
                {category.title}
              </Text>
              {entries.length ? (
                entries.map((entry) => (
                  <StorageRow
                    key={entry.key}
                    entry={entry}
                    colors={colors}
                    isDesktop={isDesktop}
                  />
                ))
              ) : (
                <Text style={[s.emptyRow, { color: colors.textSecondary }]}>
                  Nothing stored in this category today.
                </Text>
              )}
            </View>
          ))}
        </Section>

        {/* ── Choices ────────────────────────────────────────── */}
        <Section title="Your choices" colors={colors}>
          <Paragraph colors={colors}>
            Use the Cookie preferences button above to change the optional
            categories at any time. Declining Preferences removes the optional
            settings we control; we never had marketing storage to remove.
          </Paragraph>
          <Paragraph colors={colors}>
            Turning off optional storage does not empty your cart, sign you out
            or cancel an order in progress — that information is strictly
            necessary for the site to work. You can also clear everything from
            your browser settings, which will sign you out and empty your cart.
          </Paragraph>
        </Section>

        {/* ── Email marketing is separate ────────────────────── */}
        <Section title="Email marketing is separate" colors={colors}>
          <Paragraph colors={colors}>
            Marketing emails are handled by the opt-in checkbox shown when you
            create an account or check out, not by this page. You can unsubscribe
            from any marketing email we send.
          </Paragraph>
        </Section>

        {/* ── Contact ────────────────────────────────────────── */}
        <Section title="Questions" colors={colors}>
          <Paragraph colors={colors}>
            Contact {name} if you would like to know more about the information
            we hold, or to ask us to delete it.
          </Paragraph>
          {restaurant?.address ? (
            <Text style={[s.contactLine, { color: colors.textSecondary }]}>
              {restaurant.address}
            </Text>
          ) : null}
          {contactEmail ? (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${contactEmail}`)}>
              <Text style={[s.contactLink, { color: colors.brand }]}>{contactEmail}</Text>
            </TouchableOpacity>
          ) : null}
          {contactPhone ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${contactPhone}`)}>
              <Text style={[s.contactLink, { color: colors.brand }]}>{contactPhone}</Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        <TouchableOpacity
          style={[s.backBtn, { borderColor: colors.brand }]}
          onPress={() => navigation?.navigate('Home')}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={15} color={colors.brand} />
          <Text style={[s.backBtnText, { color: colors.brand }]}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 80 },
  page: {
    paddingHorizontal: 20,
    paddingTop: 32,
    width: '100%',
  },
  pageDesktop: {
    paddingHorizontal: 40,
    paddingTop: 48,
    maxWidth: 860,
    alignSelf: 'center',
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  headline: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 12,
  },

  section: { marginTop: 30 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10,
  },

  // Current choice
  choiceCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  choiceText: { gap: 4 },
  choiceTitle: { fontSize: 14, fontWeight: '700' },
  choiceBody: { fontSize: 13, lineHeight: 19 },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  manageBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Categories
  categoryBlock: { marginBottom: 10 },
  categoryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  categoryTitle: { fontSize: 15, fontWeight: '700' },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  lockedPillText: { fontSize: 10, fontWeight: '700' },

  // Inventory table
  tableGroup: { marginTop: 14, gap: 8 },
  tableGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  tableRowDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  cellKey: { gap: 2 },
  cellKeyDesktop: { width: 260, flexShrink: 0, gap: 2 },
  cellBody: { gap: 3 },
  cellBodyDesktop: { flex: 1, minWidth: 0, gap: 3 },
  keyText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  storeText: { fontSize: 11, fontWeight: '600' },
  purposeText: { fontSize: 13, lineHeight: 19 },
  retentionText: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  emptyRow: { fontSize: 13, lineHeight: 19 },

  // Contact
  contactLine: { fontSize: 14, lineHeight: 22 },
  contactLink: { fontSize: 14, lineHeight: 22, fontWeight: '600' },

  backBtn: {
    marginTop: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  backBtnText: { fontSize: 14, fontWeight: '700' },
});
