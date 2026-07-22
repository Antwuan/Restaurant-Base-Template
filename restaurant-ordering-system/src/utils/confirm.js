import { Platform, Alert } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 *
 * On web React Native, Alert.alert with multiple buttons silently falls back to
 * window.alert (no multi-button support), so callbacks for Cancel/Confirm never
 * run. This helper uses window.confirm on web — which works reliably — and
 * Alert.alert on native.
 *
 * @returns {Promise<boolean>} Resolves true if the user confirmed, false if cancelled.
 */
export function confirmAsync({ title, message, confirmText = 'Confirm' }) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
