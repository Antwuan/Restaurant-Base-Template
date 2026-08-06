/**
 * GlobalConfirmModal — a fade modal that matches the MenuItemModal shell.
 * Mount <GlobalConfirmModal /> once near the app root (inside AppContent in App.js).
 * Call confirmAsync() anywhere — it will use this modal on all platforms.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';

const DESTRUCTIVE_RED = '#FF3B30';
/** Ignore reopen attempts after cancel/dismiss (click-through under modal). */
const DISMISS_IGNORE_MS = 450;
/** Keep card content painted until RN fade-out finishes. */
const FADE_OUT_MS = 320;

// ─── Module-level singleton ───────────────────────────────────────────────────

let _showFn = null;
let _mounted = false;
let _ignoreUntil = 0;

function _register(showFn) {
  _showFn = showFn;
  // Sticky: once GlobalConfirmModal has mounted, never use window.confirm
  // (covers Strict Mode unmount→remount gaps where _showFn is briefly null).
  _mounted = true;
}
function _unregister(showFn) {
  // Avoid clearing a newer registration (React Strict Mode remount race).
  if (_showFn === showFn) {
    _showFn = null;
  }
}

function _armDismissIgnore() {
  _ignoreUntil = Date.now() + DISMISS_IGNORE_MS;
}

/**
 * Show the global confirm modal. Returns a Promise<boolean>.
 * Resolves true if the user confirmed, false if cancelled / dismissed.
 * Falls back to window.confirm on web only when the modal is not mounted.
 */
export function showConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  destructive = false,
}) {
  // Ignore reopen attempts immediately after cancel/dismiss (click-through flash).
  if (Date.now() < _ignoreUntil) {
    return Promise.resolve(false);
  }
  if (_showFn) return _showFn({ title, message, confirmText, destructive });
  // Modal is mounted (or remounting) — never use native confirm while it owns the UX.
  if (_mounted) return Promise.resolve(false);
  // Fallback only when GlobalConfirmModal has never registered / is unmounted
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }
  return Promise.resolve(false);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalConfirmModal() {
  const [pending, setPending] = useState(null);
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(null);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    const show = ({ title, message, confirmText, destructive }) =>
      new Promise((resolve) => {
        if (clearTimerRef.current) {
          clearTimeout(clearTimerRef.current);
          clearTimerRef.current = null;
        }
        const next = { title, message, confirmText, destructive, resolve };
        pendingRef.current = next;
        setPending(next);
        setVisible(true);
      });
    _register(show);
    return () => {
      _unregister(show);
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, []);

  const resolve = (result, e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();

    const current = pendingRef.current;
    if (!current) return;

    // Detach resolve so a second press cannot settle the promise twice.
    pendingRef.current = null;
    const r = current.resolve;

    if (!result) _armDismissIgnore();

    // Hide first so fade-out runs; keep `pending` so title/confirmText/destructive
    // stay painted (clearing mid-fade flashed a generic Cancel/Confirm card).
    setVisible(false);
    if (r) r(result);

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      // Only clear if nothing new opened during the fade.
      if (!pendingRef.current) setPending(null);
    }, FADE_OUT_MS);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => resolve(false)}
      statusBarTranslucent
    >
      <View style={s.root}>
        {/* Separate backdrop press target — not wrapping the card */}
        <Pressable
          style={s.backdrop}
          onPress={(e) => resolve(false, e)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <View style={s.card} pointerEvents="box-none">
          <Text style={s.title}>{pending?.title}</Text>

          {pending?.message ? (
            <Text style={s.message}>{pending.message}</Text>
          ) : null}

          <View style={s.actions}>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={(e) => resolve(false, e)}
              activeOpacity={0.75}
            >
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                s.confirmBtn,
                pending?.destructive && s.confirmBtnDestructive,
              ]}
              onPress={(e) => resolve(true, e)}
              activeOpacity={0.85}
            >
              <Text style={s.confirmText}>
                {pending?.confirmText ?? 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    zIndex: 1,
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
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    marginRight: 5,
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
    marginLeft: 5,
  },
  confirmBtnDestructive: {
    backgroundColor: DESTRUCTIVE_RED,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
