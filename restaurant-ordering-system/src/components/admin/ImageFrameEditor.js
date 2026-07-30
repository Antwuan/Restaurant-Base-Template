import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { loadHtmlImage, renderFramedImageToObjectUrl } from '../../utils/frameImage';

/**
 * Modal editor: zoom + drag to position an image inside a fixed aspect frame,
 * then export a cropped JPEG (web).
 */
export default function ImageFrameEditor({
  visible,
  uri,
  aspectRatio = 1,
  title = 'Frame image',
  onCancel,
  onConfirm,
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width: winW } = useWindowDimensions();

  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [exporting, setExporting] = useState(false);

  const offsetsRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    if (!visible || !uri) return;
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    offsetsRef.current = { x: 0, y: 0, zoom: 1 };
    let cancelled = false;
    if (Platform.OS === 'web') {
      loadHtmlImage(uri)
        .then((img) => {
          if (!cancelled) {
            setNatural({
              w: img.naturalWidth || img.width || 1,
              h: img.naturalHeight || img.height || 1,
            });
          }
        })
        .catch(() => {
          if (!cancelled) setNatural({ w: 1, h: 1 });
        });
    }
    return () => {
      cancelled = true;
    };
  }, [visible, uri]);

  useEffect(() => {
    offsetsRef.current = { x: offsetX, y: offsetY, zoom };
  }, [offsetX, offsetY, zoom]);

  const frameWidth = Math.min(520, Math.max(280, winW - 48));
  const frameHeight = Math.max(160, Math.round(frameWidth / aspectRatio));

  const imageStyle = useMemo(() => {
    const coverScale = Math.max(frameWidth / natural.w, frameHeight / natural.h);
    const scale = coverScale * Math.max(1, zoom);
    const drawW = natural.w * scale;
    const drawH = natural.h * scale;
    const maxPanX = Math.max(0, (drawW - frameWidth) / 2);
    const maxPanY = Math.max(0, (drawH - frameHeight) / 2);
    const left = (frameWidth - drawW) / 2 + offsetX * maxPanX;
    const top = (frameHeight - drawH) / 2 + offsetY * maxPanY;
    return {
      position: 'absolute',
      width: drawW,
      height: drawH,
      left,
      top,
    };
  }, [natural, frameWidth, frameHeight, zoom, offsetX, offsetY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = {
            ox: offsetsRef.current.x,
            oy: offsetsRef.current.y,
          };
        },
        onPanResponderMove: (_evt, gesture) => {
          const z = Math.max(1, offsetsRef.current.zoom);
          const coverScale = Math.max(frameWidth / natural.w, frameHeight / natural.h);
          const scale = coverScale * z;
          const drawW = natural.w * scale;
          const drawH = natural.h * scale;
          const maxPanX = Math.max(0, (drawW - frameWidth) / 2);
          const maxPanY = Math.max(0, (drawH - frameHeight) / 2);
          if (maxPanX <= 0 && maxPanY <= 0) return;
          const nextX =
            maxPanX > 0
              ? Math.min(1, Math.max(-1, dragStart.current.ox + gesture.dx / maxPanX))
              : 0;
          const nextY =
            maxPanY > 0
              ? Math.min(1, Math.max(-1, dragStart.current.oy + gesture.dy / maxPanY))
              : 0;
          setOffsetX(nextX);
          setOffsetY(nextY);
        },
      }),
    [frameWidth, frameHeight, natural.w, natural.h],
  );

  const nudgeZoom = (delta) => {
    setZoom((z) => Math.min(3, Math.max(1, Math.round((z + delta) * 20) / 20)));
  };

  const handleConfirm = async () => {
    if (!uri) return;
    if (Platform.OS !== 'web') {
      onConfirm?.(uri);
      return;
    }
    setExporting(true);
    try {
      const framed = await renderFramedImageToObjectUrl({
        sourceUri: uri,
        aspectRatio,
        zoom,
        offsetX,
        offsetY,
        outputWidth: aspectRatio >= 1.4 ? 1600 : 1200,
      });
      onConfirm?.(framed);
    } catch (e) {
      onConfirm?.(uri);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: c.backgroundCard }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={onCancel}
              disabled={exporting}
            >
              <Ionicons name="close" size={18} color={c.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Drag to reposition. Use zoom to crop tighter.
          </Text>

          <View
            style={[
              styles.frame,
              {
                width: frameWidth,
                height: frameHeight,
                backgroundColor: '#111',
                alignSelf: 'center',
              },
            ]}
            {...panResponder.panHandlers}
          >
            {uri ? (
              <Image source={{ uri }} style={imageStyle} resizeMode="stretch" />
            ) : null}
            <View pointerEvents="none" style={styles.frameBorder} />
          </View>

          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={[styles.zoomBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={() => nudgeZoom(-0.1)}
              disabled={exporting || zoom <= 1}
            >
              <Ionicons name="remove" size={18} color={c.textPrimary} />
            </TouchableOpacity>
            <View style={styles.zoomTrack}>
              <Text style={[styles.zoomLabel, { color: c.textSecondary }]}>
                Zoom {Math.round(zoom * 100)}%
              </Text>
              <View style={[styles.zoomBar, { backgroundColor: c.border }]}>
                <View
                  style={[
                    styles.zoomFill,
                    {
                      backgroundColor: c.brand,
                      width: `${((zoom - 1) / 2) * 100}%`,
                    },
                  ]}
                />
              </View>
              {/* Web-friendly range input */}
              {Platform.OS === 'web' ? (
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8 }}
                  disabled={exporting}
                />
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.zoomBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={() => nudgeZoom(0.1)}
              disabled={exporting || zoom >= 3}
            >
              <Ionicons name="add" size={18} color={c.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: c.backgroundSunken }]}
              onPress={onCancel}
              disabled={exporting}
            >
              <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: c.brand }]}
              onPress={handleConfirm}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator color={c.brandText} />
              ) : (
                <Text style={{ color: c.brandText, fontWeight: '600' }}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 580,
    borderRadius: 14,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 13, marginBottom: 12 },
  frame: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    cursor: 'grab',
  },
  frameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomTrack: { flex: 1 },
  zoomLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  zoomBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  zoomFill: {
    height: '100%',
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
});
