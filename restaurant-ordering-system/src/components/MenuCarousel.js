import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Image,
  FlatList,
  StyleSheet,
  Dimensions,
  Pressable,
  Text,
  Linking,
} from 'react-native';
import { Video } from 'expo-av';

const ASPECT_RATIO = 16 / 9;
const HORIZONTAL_PADDING = 0;

function getSlideWidth() {
  const { width } = Dimensions.get('window');
  return width - HORIZONTAL_PADDING * 2;
}

function CarouselSlide({ slide, width, height, isActive }) {
  const videoRef = useRef(null);

  const handlePress = () => {
    if (slide.link_url) {
      Linking.openURL(slide.link_url).catch(() => {});
    }
  };

  const content = slide.media_type === 'video' ? (
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

export default function MenuCarousel({ slides = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideWidth = getSlideWidth();
  const slideHeight = slideWidth / ASPECT_RATIO;

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems?.[0]?.index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  if (!slides.length) {
    return null;
  }

  return (
    <View style={[styles.wrapper, { height: slideHeight }]}>
      <FlatList
        data={slides}
        keyExtractor={(item) => item.id}
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
      />
      {slides.length > 1 && (
        <View style={styles.dots}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={[
                styles.dot,
                index === activeIndex && styles.dotActive,
              ]}
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
  dots: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },
});
