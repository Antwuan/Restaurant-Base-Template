/**
 * GlobalConfirmModal — a fade modal that matches the MenuItemModal shell.
 * Mount <GlobalConfirmModal /> once near the app root (inside AppContent in App.js).
 * Call confirmAsync() anywhere — it will use this modal on all platforms.
 */
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';

// ─── Module-level singleton ───────────────────────────────────────────────────

let _showFn = null;

function _register(showFn) { _showFn = showFn; }
function _unregister()    { _showFn = null; }

/**
 * Show the global confirm modal. Returns a Promise<boolean>.
 * Resolves true if the user confirmed, false if cancelled / dismissed.
 * Falls back to window.confirm on web when the modal isn't mounted yet.
 */
export function showConfirmModal({ title, message, confirmText = 'Confirm' }) {
  if (_showFn) return _showFn({ title, message, confirmText });
  // Fallback (modal not mounted yet)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }
  return Promise.resolve(false);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalConfirmModal() {
  const [pending, setPending] = useState(null);

  useEffect(() => {
    _register(({ title, message, confirmText }) =>
      new Promise((resolve) => {
        setPending({ title, message, confirmText, resolve });
      })
    );
    return () => _unregister();
  }, []);

  const resolve = (result) => {
    const r = pending?.resolve;
    setPending(null);
    if (r) r(result);
  };

  return (
    <Modal
      visible={!!pending}
      transparent
      animationType="fade"
      onRequestClose={() => resolve(false)}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={() => resolve(false)}>
        <Pressable style={s.card} onPress={() => {}}>
          {/* Title */}
          <Text style={s.title}>{pending?.title}</Text>

          {/* Message */}
          {pending?.message ? (
            <Text style={s.message}>{pending.message}</Text>
          ) : null}

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => resolve(false)}
              activeOpacity={0.75}
            >
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.confirmBtn}
              onPress={() => resolve(true)}
              activeOpacity={0.85}
            >
              <Text style={s.confirmText}>{pending?.confirmText ?? 'Confirm'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#222',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
