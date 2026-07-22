import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../theme';

/**
 * Shared empty-state placeholder for admin screens.
 *
 * Props:
 *   icon        – emoji or short string shown large
 *   title       – primary message
 *   subtitle    – supporting description
 *   actionLabel – optional CTA button label
 *   onAction    – callback for CTA button
 */
export default function AdminEmptyState({ icon, title, subtitle, actionLabel, onAction }) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={styles.container}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: c.brand }]}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text style={[styles.actionBtnText, { color: c.brandText }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    minHeight: 200,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  actionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
