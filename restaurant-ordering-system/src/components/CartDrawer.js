import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Text,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CartPanel from './CartPanel';
import BottomSheet, { useMobileBottomSheet } from './BottomSheet';

const DRAWER_MAX_WIDTH = 420;

export default function CartDrawer({ visible, onClose, onCheckout }) {
  const mobileSheet = useMobileBottomSheet();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(DRAWER_MAX_WIDTH, width * 0.92);

  const slideAnim = useRef(new Animated.Value(panelWidth)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mobileSheet) return;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: visible ? 0 : panelWidth,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: visible ? 1 : 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, panelWidth, slideAnim, overlayAnim, mobileSheet]);

  const header = (
    <View style={styles.drawerHeader}>
      <Text style={styles.drawerTitle}>Cart</Text>
      <TouchableOpacity
        onPress={onClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Close cart"
      >
        <Ionicons name="close" size={26} color="#333" />
      </TouchableOpacity>
    </View>
  );

  if (mobileSheet) {
    return (
      <BottomSheet visible={visible} onClose={onClose} expand>
        <View style={styles.sheetInner}>
          {header}
          <CartPanel onClose={onClose} onCheckout={onCheckout} />
        </View>
      </BottomSheet>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width: panelWidth,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {header}
        <CartPanel onClose={onClose} onCheckout={onCheckout} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' } : {}),
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  sheetInner: {
    flex: 1,
    minHeight: 0,
  },
});
