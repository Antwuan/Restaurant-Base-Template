import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

function AdminPlaceholderScreen({ title, icon, description }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.card, { backgroundColor: theme.colors.backgroundCard, borderColor: theme.colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.brandLight }]}>
          <Ionicons name={icon} size={28} color={theme.colors.brand} />
        </View>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          {description || 'Coming soon — this section is under construction.'}
        </Text>
      </View>
    </View>
  );
}

export function RewardsScreen() {
  return (
    <AdminPlaceholderScreen
      title="Rewards"
      icon="gift-outline"
      description="Loyalty points and customer rewards will live here."
    />
  );
}

export function ApplicationsScreen() {
  return (
    <AdminPlaceholderScreen
      title="Applications"
      icon="document-text-outline"
      description="Job and partnership applications will live here."
    />
  );
}

export function MarketingScreen() {
  return (
    <AdminPlaceholderScreen
      title="Marketing"
      icon="megaphone-outline"
      description="Campaigns and promotions will live here."
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    maxWidth: 420,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
