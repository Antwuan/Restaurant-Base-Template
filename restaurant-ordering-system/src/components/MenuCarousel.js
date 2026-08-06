import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Image,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  Linking,
  Platform,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';

const ASPECT_RATIO = 16 / 9;
const MAX_HEIGHT = 420;
const AUTOPLAY_INTERVAL = 5000;

// ─── Single slide ──────────────────────────────────────────────────────────────

function CarouselSlide({ slide, width, height, isActive }) {
  const videoRef = useRef(null);

  const handlePress = () => {
    if (slide.link_url) {
      Linking.openURL(slide.link_url).catch(() => {});
    }
  };

  const content =
    slide.media_type === 'video' ? (
      <Video
        ref={videoRef}
        source={{ uri: slide.media_url }}
        style={[styles.media, { width, height }]}
        resizeMode="cover"
        isLooping
        isMuted
        shouldPlay={isActive}
        useNativeControls={false}
      />
    ) : (
      <Image
        source={{ uri: slide.media_url }}
        style={[styles.media, { width, height }]}
        resizeMode="cover"
        accessibilityLabel={slide.alt_text || slide.title || 'Promo slide'}
      />
    );

  return (
    <Pressable onPress={handlePress} style={{ width, height }}>
      {content}
      {slide.title ? (
        <View style={styles.captionBar}>
          <Text style={styles.captionText} numberOfLines={2}>
            {slide.title}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Animated dot — stretches when active ─────────────────────────────────────

function CarouselDot({ isActive, onPress }) {
  const widthAnim = useRef(new Animated.Value(isActive ? 20 : 8)).current;
  const opacityAnim = useRef(new Animated.Value(isActive ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(widthAnim, {
        toValue: isActive ? 20 : 8,
        useNativeDriver: false,
        tension: 260,
        friction: 20,
      }),
      Animated.timing(opacityAnim, {
        toValue: isActive ? 1 : 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, widthAnim, opacityAnim]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <Animated.View
        style={[styles.dot, { width: widthAnim, opacity: opacityAnim }]}
      />
    </Pressable>
  );
}

// ─── Arrow button with hover feedback (web) ────────────────────────────────────

function ArrowButton({ side, onPress }) {
  const bgOpacity = useRef(new Animated.Value(0.4)).current;

  const webProps =
    Platform.OS === 'web'
      ? {
          onMouseEnter: () =>
            Animated.timing(bgOpacity, { toValue: 0.72, duration: 160, useNativeDriver: true }).start(),
          onMouseLeave: () =>
            Animated.timing(bgOpacity, { toValue: 0.4, duration: 160, useNativeDriver: true }).start(),
        }
      : {};

  return (
    <Pressable
      style={[styles.arrow, side === 'left' ? styles.arrowLeft : styles.arrowRight]}
      onPress={onPress}
      accessibilityLabel={side === 'left' ? 'Previous slide' : 'Next slide'}
      {...webProps}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.arrowBg,
          { opacity: bgOpacity },
        ]}
      />
      <Ionicons
        name={side === 'left' ? 'chevron-back' : 'chevron-forward'}
        size={22}
        color="#fff"
      />
    </Pressable>
  );
}

// ─── Main carousel ─────────────────────────────────────────────────────────────

export default function MenuCarousel({ slides = [] }) {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const slideWidth = windowWidth || 0;
  const slideHeight = Math.min(slideWidth / ASPECT_RATIO, MAX_HEIGHT);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems?.[0]?.index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const goToIndex = useCallback(
    (index) => {
      if (!slides.length) return;
      const next = (index + slides.length) % slides.length;
      setActiveIndex(next);
      listRef.current?.scrollToIndex({ index: next, animated: true });
    },
    [slides.length],
  );

  // Autoplay
  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % slides.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(id);
  }, [slides.length]);

  if (!slides.length || !slideWidth) {
    return null;
  }

  const showControls = slides.length > 1;

  return (
    <View style={[styles.wrapper, { height: slideHeight }]}>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => String(item.id)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <CarouselSlide
            slide={item}
            width={slideWidth}
            height={slideHeight}
            isActive={index === activeIndex}
          />
        )}
        getItemLayout={(_, index) => ({
          length: slideWidth,
          offset: slideWidth * index,
          index,
        })}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index, animated: false });
          }, 50);
        }}
      />

      {/* Prev / next arrows */}
      {showControls && Platform.OS === 'web' && (
        <>
          <ArrowButton side="left" onPress={() => goToIndex(activeIndex - 1)} />
          <ArrowButton side="right" onPress={() => goToIndex(activeIndex + 1)} />
        </>
      )}

      {/* Animated dots */}
      {showControls && (
        <View style={styles.dots}>
          {slides.map((slide, index) => (
            <CarouselDot
              key={String(slide.id)}
              isActive={index === activeIndex}
              onPress={() => goToIndex(index)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: '#111',
    marginBottom: 8,
  },
  media: {
    height: '100%',
    backgroundColor: '#222',
  },
  captionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  captionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  arrowBg: {
    borderRadius: 20,
    backgroundColor: '#000',
  },
  arrowLeft: {
    left: 12,
  },
  arrowRight: {
    right: 12,
  },
  dots: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
