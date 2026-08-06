/**
 * Customer Rewards Screen
 * - Signed out: shows all active offers, prompts to sign in to earn/redeem
 * - Signed in: shows points balance, active offers, redeem buttons
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme';
import CustomerNavbar from '../../components/CustomerNavbar';
import CustomerSignInModal from '../../components/CustomerSignInModal';
import { FadeInView } from '../../components/motion';
import * as rewardsService from '../../services/rewardsService';

/** Animated count-up for the points balance number. */
function AnimatedPoints({ value, color }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: value,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    const listener = animValue.addListener(({ value: v }) => {
      setDisplayed(Math.round(v));
    });
    return () => animValue.removeListener(listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Text style={[s.balanceNum, { color }]}>{displayed}</Text>
  );
}

const DESKTOP_BP = 768;

export default function RewardsScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { customerProfile, refreshCustomerProfile, isCustomerAuthenticated } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BP;

  const brandColor = theme.colors.brand;

  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [signInVisible, setSignInVisible] = useState(false);
  const [redeeming, setRedeeming] = useState(null); // offer id being redeemed

  const points = customerProfile?.points_balance ?? 0;

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

  useEffect(() => { loadOffers(); }, [loadOffers]);

  // Refresh customer profile when customer session or restaurant changes
  useEffect(() => {
    if (isCustomerAuthenticated && restaurant?.id) {
      refreshCustomerProfile(restaurant.id);
    }
  }, [isCustomerAuthenticated, restaurant?.id, refreshCustomerProfile]);

  const handleSignIn = () => setSignInVisible(true);

  // Re-sync profile whenever sign-in modal closes (user may have signed in)
  const handleModalClose = async () => {
    setSignInVisible(false);
    if (isCustomerAuthenticated && restaurant?.id) {
      await refreshCustomerProfile(restaurant.id);
    }
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

    Alert.alert(
      'Redeem Offer',
      `Redeem "${offer.title}" for ${offer.points_cost} points?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeeming(offer.id);
            try {
              await rewardsService.redeemOffer({
                restaurantId: restaurant.id,
                customerId: customerProfile.id,
                offerId: offer.id,
                pointsCost: offer.points_cost,
              });
              await refreshCustomerProfile(restaurant.id);
              Alert.alert('Redeemed!', `Show this screen at pickup to claim your "${offer.title}".`);
            } catch (e) {
              Alert.alert('Error', e.message || 'Could not redeem offer.');
            } finally {
              setRedeeming(null);
            }
          },
        },
      ],
    );
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
              <AnimatedPoints value={points} color={brandColor} />
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
              { icon: 'pricetag-outline', text: 'Redeem points for offers below' },
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
                const canRedeem = isCustomerAuthenticated && points >= offer.points_cost;
                const isRedeeming = redeeming === offer.id;
                return (
                  <FadeInView key={offer.id} delay={idx * 70} duration={380} fromY={14} style={isDesktop ? { flex: 1, minWidth: 260 } : undefined}>
                  <View style={[s.offerCard, { borderColor: c.border, flex: undefined, minWidth: undefined }]}>
                    <View style={[s.offerPtsBubble, { backgroundColor: brandColor }]}>
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
                      disabled={isRedeeming}
                      activeOpacity={0.8}
                    >
                      {isRedeeming ? (
                        <ActivityIndicator color={canRedeem ? '#fff' : '#aaa'} size="small" />
                      ) : (
                        <Text style={[s.redeemBtnText, { color: canRedeem ? '#fff' : '#888' }]}>
                          {!isCustomerAuthenticated ? 'Sign in' : canRedeem ? 'Redeem' : `Need ${offer.points_cost - points} more`}
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

        {/* ── Sign-in nudge (signed out) ───────────────── */}
        {!isCustomerAuthenticated && (
          <View style={[s.nudge, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
            <Text style={[s.nudgeText, { color: c.textPrimary }]}>
              Sign in or create a free account to start earning points on every order.
            </Text>
            <TouchableOpacity
              style={[s.nudgeBtn, { backgroundColor: brandColor }]}
              onPress={handleSignIn}
            >
              <Text style={s.nudgeBtnText}>Sign In / Join</Text>
            </TouchableOpacity>
          </View>
        )}

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

  // Nudge
  nudge: {
    margin: 20,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 14,
  },
  nudgeText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  nudgeBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  nudgeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
