import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  useWindowDimensions,
  Platform,
  Image,
  Animated,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useCarousel } from '../../hooks/useCarousel';
import { useGallery } from '../../hooks/useGallery';
import { useTheme } from '../../theme';
import CustomerNavbar from '../../components/CustomerNavbar';
import LocationCard from '../../components/LocationCard';
import { ScrollReveal, PressableScale } from '../../components/motion';

const HERO_HEIGHT_DESKTOP = 620;
const HERO_HEIGHT_MOBILE = 480;
const SLIDE_INTERVAL = 5000;
const KEN_BURNS_DURATION = 6000; // slightly longer than slide interval for smooth overlap
const GALLERY_RADIUS = 20;
const GALLERY_GAP = 16;
/** Failsafe so a broken/hung image never leaves Home stuck on the loader. */
const HERO_IMAGE_LOAD_TIMEOUT_MS = 9000;

function slideNeedsImageWait(slide) {
  return slide?.media_type !== 'video' && Boolean(slide?.media_url);
}

function galleryColumnCount(layout, width) {
  if (layout === 'grid_3') return width >= 768 ? 3 : 2;
  return 2; // grid_2 (default)
}

/** Home gallery: equal grids from curated gallery images. */
function HomeGallery({ items, brandColor, width, layout = 'grid_2' }) {
  const [lightboxItem, setLightboxItem] = useState(null);
  if (!items.length) return null;

  const columns = galleryColumnCount(layout, width);
  const openItem = (item) => setLightboxItem(item);

  return (
    <View style={[styles.section, styles.gallerySection]}>
      <Text style={[styles.sectionEyebrow, { color: brandColor }]}>Gallery</Text>
      <Text style={styles.sectionTitle}>From the kitchen</Text>
      <View style={styles.galleryGrid}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[
              styles.galleryGridCell,
              columns === 3 ? styles.galleryGridItem3 : styles.galleryGridItem2,
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openItem(item)}
              style={styles.galleryGridItem}
            >
              <Image
                source={{ uri: item.media_url }}
                style={styles.galleryGridImage}
                resizeMode="cover"
                accessibilityLabel={item.alt_text || 'Gallery photo'}
              />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Modal
        visible={!!lightboxItem}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxItem(null)}
      >
        <View style={styles.lightboxOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLightboxItem(null)} />
          <View style={styles.lightboxCard}>
            {lightboxItem ? (
              <Image
                source={{ uri: lightboxItem.media_url }}
                style={styles.lightboxImage}
                resizeMode="contain"
                accessibilityLabel={lightboxItem.alt_text || 'Gallery photo'}
              />
            ) : null}
            <TouchableOpacity
              style={styles.lightboxClose}
              onPress={() => setLightboxItem(null)}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Crossfading hero background with a slow Ken Burns zoom on each image slide.
 * Reports via onMediaReady once every waitable image has loaded or errored
 * (videos / missing URLs settle immediately and do not block).
 */
function heroMediaKey(slide) {
  return `${slide?.id}:${slide?.media_url || ''}`;
}

function HeroBackground({ slides, onMediaReady }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const opacities = useRef(slides.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  // One scale value per slide — each loops independently
  const scales = useRef(slides.map(() => new Animated.Value(1))).current;
  const settledRef = useRef(new Set());
  const reportedRef = useRef(false);
  const onMediaReadyRef = useRef(onMediaReady);
  onMediaReadyRef.current = onMediaReady;
  const waitKeySig = slides
    .filter(slideNeedsImageWait)
    .map(heroMediaKey)
    .join('|');

  const maybeReportReady = useCallback(() => {
    if (reportedRef.current) return;
    const keys = waitKeySig ? waitKeySig.split('|') : [];
    if (keys.every((key) => settledRef.current.has(key))) {
      reportedRef.current = true;
      onMediaReadyRef.current?.();
    }
  }, [waitKeySig]);

  const markSettled = useCallback(
    (slide) => {
      if (!slideNeedsImageWait(slide)) return;
      settledRef.current.add(heroMediaKey(slide));
      maybeReportReady();
    },
    [maybeReportReady],
  );

  // Sync readiness whenever the waitable slide set changes.
  // Keep already-settled keys (cached onLoad may fire before this effect).
  useEffect(() => {
    reportedRef.current = false;
    const active = new Set(waitKeySig ? waitKeySig.split('|') : []);
    for (const key of [...settledRef.current]) {
      if (!active.has(key)) settledRef.current.delete(key);
    }
    maybeReportReady();
  }, [waitKeySig, maybeReportReady]);

  // Start a Ken Burns loop for a given slide index
  const startKenBurns = (index) => {
    const scale = scales[index];
    if (!scale) return;
    scale.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.08,
          duration: KEN_BURNS_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: KEN_BURNS_DURATION,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  };

  // Kick off Ken Burns for the first slide immediately
  useEffect(() => {
    startKenBurns(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-rotate slides
  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [slides.length]);

  // Crossfade + start Ken Burns on newly active slide
  useEffect(() => {
    if (!opacities.length) return;
    const animations = opacities.map((value, i) =>
      Animated.timing(value, {
        toValue: i === activeIndex ? 1 : 0,
        duration: 1200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    Animated.parallel(animations).start();
    startKenBurns(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {slides.map((slide, index) => (
        <Animated.View
          key={slide.id}
          style={[StyleSheet.absoluteFill, { opacity: opacities[index] }]}
        >
          {slide.media_type === 'video' ? (
            <Video
              source={{ uri: slide.media_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              isLooping
              isMuted
              shouldPlay={index === activeIndex}
              useNativeControls={false}
            />
          ) : slide.media_url ? (
            /* Ken Burns: the image is slightly oversized and scaled up/down */
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ scale: scales[index] }] },
              ]}
            >
              <Image
                source={{ uri: slide.media_url }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibilityLabel={slide.alt_text || slide.title || 'Hero slide'}
                onLoad={() => markSettled(slide)}
                onError={() => markSettled(slide)}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      ))}
    </View>
  );
}

/** Staggered entrance for the hero headline, subtitle, and CTA. */
function HeroContent({ restaurantName, description, brandColor, onOrderNow }) {
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(30)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(30)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.stagger(140, [
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 560, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 560, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(subtitleY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ctaOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 14 }),
      ]),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.heroContent}>
      <Animated.Text
        style={[styles.heroTitle, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}
      >
        {restaurantName || 'Welcome'}
      </Animated.Text>

      {description ? (
        <Animated.Text
          style={[
            styles.heroSubtitle,
            { opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] },
          ]}
          numberOfLines={4}
        >
          {description}
        </Animated.Text>
      ) : null}

      <Animated.View style={{ opacity: ctaOpacity, transform: [{ scale: ctaScale }] }}>
        <PressableScale
          onPress={onOrderNow}
          style={[styles.ctaPrimary, { backgroundColor: brandColor }]}
          scale={0.95}
        >
          <Text style={styles.ctaPrimaryText}>Order Now</Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { restaurant } = useRestaurantContext();
  const { slides, loading: carouselLoading } = useCarousel(restaurant?.id);
  const { images: galleryImages } = useGallery(restaurant?.id);
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [heroMediaReady, setHeroMediaReady] = useState(false);

  const slideKey = slides.map((s) => `${s.id}:${s.media_url || ''}:${s.media_type || ''}`).join('|');

  useEffect(() => {
    if (carouselLoading) {
      setHeroMediaReady(false);
      return undefined;
    }
    const hasWaitable = slides.some(slideNeedsImageWait);
    if (!hasWaitable) {
      setHeroMediaReady(true);
      return undefined;
    }
    setHeroMediaReady(false);
    const timeoutId = setTimeout(() => {
      setHeroMediaReady(true);
    }, HERO_IMAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
    // slideKey tracks slide identity/URLs without depending on array identity alone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselLoading, slideKey]);

  const handleHeroMediaReady = useCallback(() => {
    setHeroMediaReady(true);
  }, []);

  const handleOrderNow = () => navigation.navigate('Menu');
  const handleExploreMenu = () => navigation.navigate('Menu');
  const handleCallPress = () => {
    if (restaurant?.phone) Linking.openURL(`tel:${restaurant.phone}`);
  };

  const brandColor = theme.colors.brand;
  const heroHeight = isWide ? HERO_HEIGHT_DESKTOP : HERO_HEIGHT_MOBILE;
  const galleryLayout =
    restaurant?.gallery_layout === 'grid_3' ? 'grid_3' : 'grid_2';
  const pageLoading = carouselLoading || !heroMediaReady;

  return (
    <View style={styles.root}>
      <CustomerNavbar navigation={navigation} currentRoute="Home" />

      <View style={styles.content}>
        {pageLoading ? (
          <View style={styles.loaderOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color={brandColor} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          pointerEvents={pageLoading ? 'none' : 'auto'}
        >

        {/* ── HERO ─────────────────────────────────────────────── */}
        {slides.length > 0 ? (
          <View style={[styles.hero, { height: heroHeight }]}>
            <HeroBackground slides={slides} onMediaReady={handleHeroMediaReady} />
            <View style={styles.heroScrim} />
            {!pageLoading ? (
              <HeroContent
                restaurantName={restaurant?.name}
                description={restaurant?.description}
                brandColor={brandColor}
                onOrderNow={handleOrderNow}
              />
            ) : null}
          </View>
        ) : (
          /* Hero fallback when no carousel slides */
          <View style={[styles.heroFallback, { height: heroHeight, backgroundColor: brandColor }]}>
            {restaurant?.logo_url ? (
              <Image
                source={{ uri: restaurant.logo_url }}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.heroFallbackTitle}>{restaurant?.name || 'Welcome'}</Text>
            {restaurant?.description ? (
              <Text style={styles.heroFallbackSubtitle}>{restaurant.description}</Text>
            ) : (
              <Text style={styles.heroFallbackSubtitle}>
                Fresh food, made with care — ready for you.
              </Text>
            )}
            <PressableScale
              onPress={handleOrderNow}
              style={styles.ctaWhite}
              scale={0.95}
            >
              <Text style={[styles.ctaWhiteText, { color: brandColor }]}>Order Now</Text>
            </PressableScale>
          </View>
        )}

        {/* ── WELCOME / ABOUT ──────────────────────────────────── */}
        <ScrollReveal>
          <View style={styles.section}>
            <View style={[styles.aboutRow, isWide && styles.aboutRowWide]}>
              {/* Left: text */}
              <View style={styles.aboutText}>
                <Text style={[styles.sectionEyebrow, { color: brandColor }]}>About Us</Text>
                <Text style={styles.sectionTitle}>
                  {restaurant?.name ? `Welcome to ${restaurant.name}` : 'Welcome'}
                </Text>
                <Text style={styles.sectionBody}>
                  {restaurant?.description ||
                    "We're passionate about serving fresh, high-quality food that keeps you coming back for more. Whether you're a local, a visitor, a busy professional, or a family looking for a satisfying meal — we've got you covered."}
                </Text>
                <PressableScale
                  onPress={handleExploreMenu}
                  style={[styles.linkBtn, { borderColor: brandColor }]}
                  scale={0.97}
                >
                  <Text style={[styles.linkBtnText, { color: brandColor }]}>Explore Our Menu</Text>
                  <Ionicons name="arrow-forward" size={16} color={brandColor} />
                </PressableScale>
              </View>

              {/* Right: image */}
              <View style={styles.aboutMedia}>
                {restaurant?.about_image_url ? (
                  <Image
                    source={{ uri: restaurant.about_image_url }}
                    style={styles.aboutImage}
                    resizeMode="cover"
                    accessibilityLabel={`${restaurant?.name || 'Restaurant'} photo`}
                  />
                ) : (
                  <View style={styles.aboutPlaceholder}>
                    <Ionicons name="image-outline" size={48} color="#c4c4c4" />
                    <Text style={styles.aboutPlaceholderText}>Image coming soon</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollReveal>

        {/* ── MENU GALLERY (above Rewards) ─────────────────── */}
        {galleryImages.length > 0 ? (
          <ScrollReveal delay={40}>
            <HomeGallery
              items={galleryImages}
              brandColor={brandColor}
              width={width}
              layout={galleryLayout}
            />
          </ScrollReveal>
        ) : null}

        {/* ── REWARDS CTA ──────────────────────────────────────── */}
        <ScrollReveal delay={60}>
          <View style={[styles.rewardsBanner, { backgroundColor: brandColor }]}>
            <Ionicons name="gift-outline" size={36} color="#fff" style={{ marginBottom: 12 }} />
            <Text style={styles.rewardsTitle}>
              {restaurant?.name ? `${restaurant.name} Rewards` : 'Loyalty Rewards'}
            </Text>
            <Text style={styles.rewardsBody}>
              Join our rewards program — earn points every time you order online and redeem them for free food!
            </Text>
            <PressableScale
              onPress={() => navigation.navigate('Rewards')}
              style={styles.rewardsBtn}
              scale={0.96}
            >
              <Text style={[styles.rewardsBtnText, { color: brandColor }]}>Join Rewards</Text>
            </PressableScale>
          </View>
        </ScrollReveal>

        {/* ── LOCATION & HOURS ─────────────────────────────────── */}
        <ScrollReveal delay={80}>
          <View style={styles.section}>
            <Text style={[styles.sectionEyebrow, { color: brandColor }]}>Visit Us</Text>
            <Text style={styles.sectionTitle}>Our Location</Text>
            <LocationCard
              restaurant={restaurant}
              variant="full"
              brandColor={brandColor}
              onOrderPress={handleOrderNow}
            />
          </View>
        </ScrollReveal>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <View style={[styles.footer, { backgroundColor: '#1a1a1a' }]}>
          <Text style={styles.footerName}>{restaurant?.name || 'Restaurant'}</Text>
          {restaurant?.address ? (
            <Text style={styles.footerMeta}>{restaurant.address}</Text>
          ) : null}
          {restaurant?.phone ? (
            <TouchableOpacity onPress={handleCallPress}>
              <Text style={[styles.footerMeta, { color: brandColor }]}>{restaurant.phone}</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.footerDivider} />
          <TouchableOpacity onPress={() => navigation.navigate('Hiring')}>
            <Text style={[styles.footerMeta, { color: brandColor }]}>Careers</Text>
          </TouchableOpacity>
          <View style={styles.footerDivider} />
          <Text style={styles.footerCopy}>
            © {new Date().getFullYear()} {restaurant?.name || 'Restaurant'}. All rights reserved.
          </Text>
        </View>

        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#888',
  },

  // ── HERO
  hero: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    ...Platform.select({
      web: { background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)' },
    }),
  },
  heroContent: {
    position: 'relative',
    paddingHorizontal: 24,
    alignItems: 'center',
    maxWidth: 760,
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 14,
    ...Platform.select({ web: { textShadow: '0 2px 12px rgba(0,0,0,0.55)' } }),
  },
  heroSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 600,
    ...Platform.select({ web: { textShadow: '0 1px 6px rgba(0,0,0,0.5)' } }),
  },
  heroFallback: {
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: {
    width: 88,
    height: 88,
    borderRadius: 16,
    marginBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroFallbackTitle: {
    fontSize: 44,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  heroFallbackSubtitle: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 26,
    maxWidth: 520,
    marginBottom: 28,
  },
  ctaPrimary: {
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: 30,
  },
  ctaPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  ctaWhite: {
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  ctaWhiteText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ── SECTIONS
  section: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: '#fff',
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  gallerySection: {
    maxWidth: 1280,
    paddingHorizontal: 20,
  },
  aboutRow: {
    flexDirection: 'column',
    gap: 28,
  },
  aboutRowWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  aboutText: {
    flex: 1,
  },
  aboutMedia: {
    flex: 1,
    width: '100%',
  },
  aboutImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  aboutPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...Platform.select({
      web: { borderStyle: 'dashed' },
    }),
  },
  aboutPlaceholderText: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '600',
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
  },
  sectionBody: {
    fontSize: 16,
    color: '#555',
    lineHeight: 26,
    marginBottom: 20,
    maxWidth: 640,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── GRID GALLERY
  galleryGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -(GALLERY_GAP / 2),
  },
  galleryGridCell: {
    paddingHorizontal: GALLERY_GAP / 2,
    marginBottom: GALLERY_GAP,
  },
  galleryGridItem: {
    borderRadius: GALLERY_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  galleryGridItem2: {
    width: '50%',
  },
  galleryGridItem3: {
    width: '33.333%',
  },
  galleryGridImage: {
    width: '100%',
    aspectRatio: 1,
  },

  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  lightboxCard: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '90%',
    position: 'relative',
    zIndex: 1,
  },
  lightboxImage: {
    width: '100%',
    height: Platform.OS === 'web' ? '80vh' : 480,
    borderRadius: 12,
  },
  lightboxClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  // ── REWARDS BANNER
  rewardsBanner: {
    paddingVertical: 52,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  rewardsTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  rewardsBody: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 480,
    marginBottom: 24,
  },
  rewardsBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 28,
  },
  rewardsBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },

  // ── LOCATION (legacy keys kept for LocationCard compatibility)
  locationCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    gap: 14,
    marginTop: 20,
    maxWidth: 520,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  locationIcon: {
    marginTop: 1,
  },
  locationText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    flex: 1,
  },
  locationLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // ── FOOTER
  footer: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  footerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  footerMeta: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 4,
  },
  footerDivider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 16,
  },
  footerCopy: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
