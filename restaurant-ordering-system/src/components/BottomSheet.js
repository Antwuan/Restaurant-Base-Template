/**
 * BottomSheet — mobile-web overlay that slides up from the bottom.
 *
 * Used when `isWeb && isSmallScreen()`. Desktop / native callers keep their
 * existing centered modals or right-side drawers.
 *
 * Features: drag handle, swipe-down to close, backdrop tap to dismiss.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { isWeb, isSmallScreen } from '../utils/platform';

const DISMISS_DY = 80;
const DISMISS_VY = 1.1;
const FALLBACK_HEIGHT = 480;

/**
 * Subscribe to window size so the sheet/desktop split updates on resize.
 * `isSmallScreen()` itself is not reactive.
 */
export function useMobileBottomSheet() {
  useWindowDimensions();
  return isWeb && isSmallScreen();
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  style,
  /** Fill most of the viewport (cart, menu item, location picker). */
  expand = false,
  /** Wrap in KeyboardAvoidingView (sign-in form). */
  keyboard = false,
}) {
  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(FALLBACK_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetH = useRef(FALLBACK_HEIGHT);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const animateIn = useCallback(() => {
    closingRef.current = false;
    translateY.setValue(Math.max(sheetH.current, 240));
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 68,
        friction: 12,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropAnim, translateY]);

  const animateOut = useCallback((after) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: Math.max(sheetH.current, 240),
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      closingRef.current = false;
      if (finished) after?.();
    });
  }, [backdropAnim, translateY]);

  const dismiss = useCallback(() => {
    animateOut(() => {
      setRendered(false);
      onCloseRef.current?.();
    });
  }, [animateOut]);

  useEffect(() => {
    if (visible) {
      setRendered(true);
    } else if (rendered) {
      animateOut(() => setRendered(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visible && rendered) animateIn();
  }, [rendered, visible, animateIn]);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DY || g.vy > DISMISS_VY) {
          dismissRef.current();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    }),
  ).current;

  if (!rendered) return null;

  const sheet = (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdropWrap, { opacity: backdropAnim }]}
        pointerEvents="auto"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          expand && styles.sheetExpand,
          style,
          { transform: [{ translateY }] },
        ]}
        onLayout={(e) => {
          sheetH.current = e.nativeEvent.layout.height;
        }}
      >
        <View
          {...panResponder.panHandlers}
          style={styles.handleZone}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag down to close"
        >
          <View style={styles.handle} />
        </View>
        <View style={[styles.body, expand && styles.bodyExpand]}>{children}</View>
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      {keyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        sheet
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 -8px 40px rgba(0,0,0,0.22)' },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 16 },
    }),
  },
  sheetExpand: {
    height: '92%',
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    ...Platform.select({
      web: { cursor: 'grab', userSelect: 'none', touchAction: 'none' },
    }),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4d4d4',
  },
  body: {
    flexShrink: 1,
    minHeight: 0,
  },
  bodyExpand: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
});
