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

const DRAWER_MAX_WIDTH = 420;

export default function CartDrawer({ visible, onClose, onCheckout }) {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(DRAWER_MAX_WIDTH, width * 0.92);
  const translateX = useRef(new Animated.Value(panelWidth)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : panelWidth,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, panelWidth, translateX]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              transform: [{ translateX }],
            },
          ]}
        >
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
          <CartPanel onClose={onClose} onCheckout={onCheckout} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
});
