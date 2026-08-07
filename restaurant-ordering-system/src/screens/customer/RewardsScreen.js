/**
 * Customer Rewards Screen
 * - Signed out: shows all active offers (grayed), sign-in CTA in hero
 * - Signed in: shows points balance, active offers, redeem → 1-use checkout code
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Animated,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import CustomerNavbar from '../../components/CustomerNavbar';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import RewardCodesList from '../../components/RewardCodesList';
import { FadeInView } from '../../components/motion';
import * as rewardsService from '../../services/rewardsService';
import * as promoService from '../../services/promoService';

/** Animated count-up for the points balance number. Only restarts when balance changes. */
function AnimatedPoints({ value, color }) {
  const initial = Math.round(Number(value) || 0);
  const animValue = useRef(new Animated.Value(initial)).current;
  const [displayed, setDisplayed] = useState(initial);
  const prevValueRef = useRef(initial);
  const animRef = useRef(null);

  useEffect(() => {
    const next = Math.round(Number(value) || 0);
    if (prevValueRef.current === next) return undefined;

    const from = prevValueRef.current;
    prevValueRef.current = next;

    // First paint / remount already shows the real balance — don't count up from 0.
    if (from === next) {
      setDisplayed(next);
      animValue.setValue(next);
      return undefined;
    }

    if (animRef.current) animRef.current.stop();
    animValue.setValue(from);
    const animation = Animated.timing(animValue, {
      toValue: next,
      duration: 800,
      useNativeDriver: false,
    });
    animRef.current = animation;
    animation.start();
    const listener = animValue.addListener(({ value: v }) => {
      setDisplayed(Math.round(v));
    });
    return () => {
      animValue.removeListener(listener);
      animation.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Text style={[s.balanceNum, { color }]}>{displayed}</Text>
  );
}

const DESKTOP_BP = 768;

function confirmRedeem(title, message) {
  return new Promise((resolve) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Redeem', onPress: () => resolve(true) },
    ]);
  });
}

export default function RewardsScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const {
    user,
    customerProfile,
    refreshCustomerProfile,
    patchCustomerProfile,
    linkCustomer,
    isCustomerAuthenticated,
  } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  const brandColor = theme.colors.brand;

  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [signInVisible, setSignInVisible] = useState(false);
  const [redeeming, setRedeeming] = useState(null); // offer id being redeemed
  const [myCodes, setMyCodes] = useState([]);
  const [loadingCodes, setLoadingCodes] = useState(false);

  const points = customerProfile?.points_balance ?? 0;
  const userId = user?.id;
  const userEmail = user?.email;
  const hasProfileForRestaurant =
    !!customerProfile && customerProfile.restaurant_id === restaurant?.id;
  const profileReadyRef = useRef(hasProfileForRestaurant);
  profileReadyRef.current = hasProfileForRestaurant;

  const loadOffers = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingOffers(true);
    try {
      const data = await rewardsService.getActiveOffers(restaurant.id);
      setOffers(data);
    } finally {
      setLoadingOffers(false);
    }
  }, [restaurant?.id]);

  const loadMyCodes = useCallback(async () => {
    if (!restaurant?.id || !isCustomerAuthenticated) {
      setMyCodes([]);
      return;
    }
    setLoadingCodes(true);
    try {
      const data = await rewardsService.getMyRewardCodes(restaurant.id);
      setMyCodes(data);
    } catch {
      setMyCodes([]);
    } finally {
      setLoadingCodes(false);
    }
  }, [restaurant?.id, isCustomerAuthenticated]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  // Keep points_balance fresh when returning to Rewards (e.g. after checkout).
  useFocusEffect(
    useCallback(() => {
      if (!isCustomerAuthenticated || !restaurant?.id || !userId) return undefined;

      let cancelled = false;
      (async () => {
        // Link only when missing; avoid focus→refresh races that briefly clear balance.
        if (!profileReadyRef.current) {
          await linkCustomer(restaurant.id, userEmail, {
            id: userId,
            email: userEmail,
          });
          if (cancelled) return;
        }
        await refreshCustomerProfile(restaurant.id);
        if (cancelled) return;
        await loadMyCodes();
      })();

      return () => {
        cancelled = true;
      };
    }, [
      isCustomerAuthenticated,
      restaurant?.id,
      refreshCustomerProfile,
      linkCustomer,
      loadMyCodes,
      userId,
      userEmail,
    ]),
  );

  const handleSignIn = () => setSignInVisible(true);

  // Re-sync profile whenever sign-in modal closes (user may have signed in)
  const handleModalClose = async () => {
    setSignInVisible(false);
    if (isCustomerAuthenticated && restaurant?.id) {
      await refreshCustomerProfile(restaurant.id);
      await loadMyCodes();
    }
  };

  const showRedeemedCode = async (code, offerTitle) => {
    const message = `Your code for "${offerTitle}":\n\n${code}\n\nEnter it at checkout.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        await promoService.copyTextToClipboard(code);
        Alert.alert('Redeemed!', `${message}\n\n(Code copied to clipboard)`);
        return;
      } catch {
        // fall through
      }
    }
    Alert.alert('Redeemed!', message, [
      {
        text: 'Copy code',
        onPress: async () => {
          try {
            await promoService.copyTextToClipboard(code);
          } catch {
            // ignore
          }
        },
      },
      { text: 'OK' },
    ]);
  };

  const handleRedeem = async (offer) => {
    if (!isCustomerAuthenticated) { setSignInVisible(true); return; }
    if (!customerProfile?.id) {
      Alert.alert('Account Required', 'Please sign in to redeem offers.');
      return;
    }
    if (points < offer.points_cost) {
      Alert.alert(
        'Not Enough Points',
        `You need ${offer.points_cost} pts but only have ${points}. Keep ordering to earn more!`,
      );
      return;
    }

    const ok = await confirmRedeem(
      'Redeem Offer',
      `Redeem "${offer.title}" for ${offer.points_cost} points? You'll get a one-time checkout code.`,
    );
    if (!ok) return;

    setRedeeming(offer.id);
    try {
      const result = await rewardsService.redeemOffer({
        restaurantId: restaurant.id,
        offerId: offer.id,
      });

      // Apply balance immediately so AnimatedPoints counts down in place.
      if (typeof result?.newBalance === 'number') {
        patchCustomerProfile({ points_balance: result.newBalance });
      }
      // Refresh in background (may race); local patch already has the truth.
      refreshCustomerProfile(restaurant.id);

      const code = result?.code || result?.promo?.code;
      if (code) {
        const upper = String(code).toUpperCase();
        const listItem = {
          id: result?.promo?.id || `local-${upper}-${Date.now()}`,
          code: upper,
          title: result?.promo?.title || offer.title,
          description: result?.promo?.description || offer.description || null,
          benefit_type: result?.promo?.benefit_type,
          discount_value: result?.promo?.discount_value,
          redemption_count: 0,
          max_redemptions: 1,
          created_at: new Date().toISOString(),
          source_offer_id: offer.id,
          used: false,
        };
        setMyCodes((prev) => [listItem, ...prev.filter((c) => c.code !== upper)]);
        await showRedeemedCode(upper, offer.title);
      } else {
        Alert.alert('Redeemed!', 'Your one-time checkout code was created. Check Your codes below or contact the restaurant if you need it.');
        loadMyCodes();
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not redeem offer.');
    } finally {
      setRedeeming(null);
    }
  };

  // Customer pages always render in light theme (dark theme is admin-only)
  const c = {
    background: '#fff',
    backgroundCard: '#fff',
    textPrimary: '#111',
    textSecondary: '#666',
    border: '#e3e8ee',
  };

  return (
    <View style={[s.root, { backgroundColor: c.background }]}>
      <CustomerNavbar navigation={navigation} currentRoute="Rewards" />

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Hero banner ──────────────────────────────── */}
        <View style={[s.hero, { backgroundColor: brandColor }]}>
          <Ionicons name="gift-outline" size={44} color="#fff" style={{ marginBottom: 12 }} />
          <Text style={s.heroTitle}>
            {restaurant?.name ? `${restaurant.name} Rewards` : 'Loyalty Rewards'}
          </Text>
          <Text style={s.heroSub}>
            Earn points with every online order — redeem them for free food and exclusive perks.
          </Text>

          {isCustomerAuthenticated ? (
            <View style={s.balanceBadge}>
              <AnimatedPoints
                value={points}
                color={brandColor}
              />
              <Text style={[s.balanceLabel, { color: brandColor }]}>points available</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={s.joinBtn}
              onPress={handleSignIn}
              activeOpacity={0.85}
            >
              <Text style={[s.joinBtnText, { color: brandColor }]}>Sign in to earn &amp; redeem</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── How it works ─────────────────────────────── */}
        <View style={[s.section, isDesktop && s.sectionDesktop]}>
          <Text style={[s.sectionTitle, { color: c.textPrimary }]}>How it works</Text>
          <View style={[s.steps, isDesktop && s.stepsDesktop]}>
            {[
              { icon: 'cart-outline', text: 'Place an order online' },
              { icon: 'star-outline', text: `Earn ${restaurant?.points_per_dollar ?? 1} pt per $1 spent` },
              { icon: 'pricetag-outline', text: 'Redeem points for a checkout code' },
            ].map((step, i) => (
              <FadeInView key={i} delay={i * 100} duration={380} fromY={12} style={s.step}>
                <View style={[s.stepIcon, { backgroundColor: brandColor + '22' }]}>
                  <Ionicons name={step.icon} size={24} color={brandColor} />
                </View>
                <Text style={[s.stepText, { color: c.textPrimary }]}>{step.text}</Text>
              </FadeInView>
            ))}
          </View>
        </View>

        {/* ── Your codes (signed-in) ───────────────────── */}
        {isCustomerAuthenticated ? (
          <View style={[s.section, isDesktop && s.sectionDesktop]}>
            <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Your codes</Text>
            <RewardCodesList
              codes={myCodes}
              loading={loadingCodes}
              brandColor={brandColor}
            />
          </View>
        ) : null}

        {/* ── Offers ───────────────────────────────────── */}
        <View style={[s.section, isDesktop && s.sectionDesktop]}>
          <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Available Offers</Text>

          {loadingOffers ? (
            <ActivityIndicator color={brandColor} style={{ marginTop: 20 }} />
          ) : offers.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="gift-outline" size={40} color="#ccc" />
              <Text style={[s.emptyText, { color: c.textSecondary }]}>
                No offers available right now — check back soon!
              </Text>
            </View>
          ) : (
            <View style={[s.offersGrid, isDesktop && s.offersGridDesktop]}>
              {offers.map((offer, idx) => {
                const balance = isCustomerAuthenticated ? points : 0;
                const needsSignIn = !isCustomerAuthenticated;
                const canAfford = balance >= offer.points_cost;
                const canRedeem = needsSignIn || canAfford;
                const pointsLeft = Math.max(0, offer.points_cost - balance);
                const isRedeeming = redeeming === offer.id;
                const accentActive = needsSignIn || canAfford;
                return (
                  <FadeInView key={offer.id} delay={idx * 70} duration={380} fromY={14} style={isDesktop ? { flex: 1, minWidth: 260 } : undefined}>
                  <View style={[
                    s.offerCard,
                    {
                      borderColor: c.border,
                      flex: undefined,
                      minWidth: undefined,
                      opacity: accentActive ? 1 : 0.55,
                    },
                  ]}>
                    <View style={[s.offerPtsBubble, { backgroundColor: accentActive ? brandColor : '#9ca3af' }]}>
                      <Text style={s.offerPtsNum}>{offer.points_cost}</Text>
                      <Text style={s.offerPtsLabel}>pts</Text>
                    </View>
                    <View style={s.offerBody}>
                      <Text style={[s.offerTitle, { color: c.textPrimary }]}>{offer.title}</Text>
                      {offer.description ? (
                        <Text style={[s.offerDesc, { color: c.textSecondary }]}>{offer.description}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[
                        s.redeemBtn,
                        canRedeem
                          ? { backgroundColor: brandColor }
                          : { backgroundColor: '#e3e8ee' },
                      ]}
                      onPress={() => handleRedeem(offer)}
                      disabled={isRedeeming || (!needsSignIn && !canAfford)}
                      activeOpacity={0.8}
                    >
                      {isRedeeming ? (
                        <ActivityIndicator color={canRedeem ? '#fff' : '#aaa'} size="small" />
                      ) : (
                        <Text style={[s.redeemBtnText, { color: canRedeem ? '#fff' : '#888' }]}>
                          {needsSignIn
                            ? 'Sign in to redeem'
                            : canAfford
                              ? 'Redeem'
                              : `${pointsLeft} points left`}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  </FadeInView>
                );
              })}
            </View>
          )}
        </View>

      </ScrollView>

      <CustomerSignInModal
        visible={signInVisible}
        onClose={handleModalClose}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 60 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center' },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.88)', textAlign: 'center', lineHeight: 22, maxWidth: 420 },

  balanceBadge: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    alignItems: 'center',
  },
  balanceNum: { fontSize: 36, fontWeight: '900' },
  balanceLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },

  joinBtn: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  joinBtnText: { fontSize: 15, fontWeight: '700' },

  // Sections
  section: { padding: 20 },
  sectionDesktop: { paddingHorizontal: 40, maxWidth: 900, alignSelf: 'center', width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },

  // Steps
  steps: { gap: 12 },
  stepsDesktop: { flexDirection: 'row', gap: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  stepIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 14, flex: 1, lineHeight: 20 },

  // Offers grid
  offersGrid: { gap: 12 },
  offersGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },

  offerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    flex: 1,
    minWidth: 260,
  },
  offerPtsBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerPtsNum: { fontSize: 16, fontWeight: '900', color: '#fff' },
  offerPtsLabel: { fontSize: 10, color: '#fff', fontWeight: '600' },
  offerBody: { flex: 1 },
  offerTitle: { fontSize: 15, fontWeight: '700' },
  offerDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },

  redeemBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  redeemBtnText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
