import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import CarouselEditorScreen from './CarouselEditorScreen';
import GalleryEditorScreen from './GalleryEditorScreen';

/**
 * Single admin page for home-page visuals: hero carousel + gallery/about.
 */
export default function HomePageEditorScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshToken((t) => t + 1);
    // Child screens refetch on refreshToken; clear spinner after a beat
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />
      }
    >
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Hero Carousel</Text>
        <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
          Promo slides at the top of the home page and menu.
        </Text>
        <CarouselEditorScreen embedded refreshToken={refreshToken} />
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Gallery & About</Text>
        <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
          About photo, gallery layout, and gallery images on the home page.
        </Text>
        <GalleryEditorScreen embedded refreshToken={refreshToken} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 48 },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sectionHint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16, marginTop: 8 },
});
