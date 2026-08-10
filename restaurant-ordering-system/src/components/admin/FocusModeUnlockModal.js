import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { useFocusMode } from '../../context/FocusModeContext';
import { verifyFocusPin } from '../../services/focusModeService';
import { isValidFocusPin } from '../../utils/focusModeHash';

/**
 * Unlock Focus Mode for the current admin session via 4-digit PIN or account password.
 */
export default function FocusModeUnlockModal({ visible, onClose, onUnlocked }) {
  const { user } = useAuth();
  const { restaurantId, pinHash, unlockSession } = useFocusMode();
  const [mode, setMode] = useState('pin'); // 'pin' | 'password'
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setMode('pin');
      setPin('');
      setPassword('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  const finishUnlock = () => {
    unlockSession();
    onUnlocked?.();
    onClose?.();
  };

  const handleUnlockWithPin = async () => {
    setError('');
    if (!isValidFocusPin(pin)) {
      setError('Enter your 4-digit PIN.');
      return;
    }
    setBusy(true);
    try {
      const ok = await verifyFocusPin(restaurantId, pin, pinHash);
      if (!ok) {
        setError('Incorrect PIN.');
        return;
      }
      finishUnlock();
    } catch {
      setError('Could not verify PIN. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockWithPassword = async () => {
    setError('');
    const email = user?.email;
    if (!email) {
      setError('No email on this account.');
      return;
    }
    if (!password) {
      setError('Enter your admin password.');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError('Incorrect password.');
        return;
      }
      finishUnlock();
    } catch {
      setError('Could not verify password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = () => {
    if (mode === 'pin') return handleUnlockWithPin();
    return handleUnlockWithPassword();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>Unlock Focus Mode</Text>
          <Text style={styles.message}>
            Enter your 4-digit PIN or admin password to access locked tabs for this session.
          </Text>

          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, mode === 'pin' && styles.tabActive]}
              onPress={() => { setMode('pin'); setError(''); }}
            >
              <Text style={[styles.tabText, mode === 'pin' && styles.tabTextActive]}>PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'password' && styles.tabActive]}
              onPress={() => { setMode('password'); setError(''); }}
            >
              <Text style={[styles.tabText, mode === 'password' && styles.tabTextActive]}>
                Password
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'pin' ? (
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus
            />
          ) : (
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Admin password"
              secureTextEntry
              autoCapitalize="none"
              autoFocus
            />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, busy && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>Unlock</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#111',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  error: {
    color: '#FF3B30',
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
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
    minHeight: 46,
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
