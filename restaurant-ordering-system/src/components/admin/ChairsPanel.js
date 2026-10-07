import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { useTheme } from '../../theme';
import { confirmAsync } from '../../utils/confirm';
import * as appointmentService from '../../services/appointmentService';

export default function ChairsPanel({ fill = false }) {
  const { restaurant } = useRestaurantContext();
  const { theme } = useTheme();
  const c = theme.colors;
  const colors = appointmentService.chairColorChoices();
  const [chairs, setChairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(colors[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoading(true);
    try {
      setChairs(await appointmentService.listChairs(restaurant.id));
    } catch {
      Alert.alert('Could not load chairs', 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => { load(); }, [load]);

  const addChair = async () => {
    if (!restaurant?.id) return;
    setSaving(true);
    try {
      await appointmentService.saveChair(restaurant.id, {
        name: draftName || `Chair ${chairs.length + 1}`,
        color: draftColor,
        sort_order: chairs.length,
        is_active: true,
      });
      setDraftName('');
      await load();
    } catch (e) {
      Alert.alert('Could not add chair', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateChair = async (chair, patch) => {
    try {
      await appointmentService.saveChair(restaurant.id, { ...chair, ...patch });
      await load();
    } catch (e) {
      Alert.alert('Could not update chair', e.message || 'Please try again.');
    }
  };

  const moveChair = async (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= chairs.length) return;
    const reordered = [...chairs];
    const [item] = reordered.splice(index, 1);
    reordered.splice(next, 0, item);
    try {
      await Promise.all(reordered.map((chair, sortOrder) => (
        appointmentService.saveChair(restaurant.id, { ...chair, sort_order: sortOrder })
      )));
      await load();
    } catch (e) {
      Alert.alert('Could not reorder', e.message || 'Please try again.');
    }
  };

  const removeChair = async (chair) => {
    const confirmed = await confirmAsync({
      title: 'Remove chair',
      message: `Remove ${chair.name}? Chairs that already have appointments should be hidden instead.`,
      confirmText: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await appointmentService.deleteChair(chair.id);
      await load();
    } catch (e) {
      Alert.alert('Could not remove', e.message || 'Hide this chair instead.');
    }
  };

  const body = (
    <>
      {loading ? (
        <ActivityIndicator color={c.brand} style={{ marginVertical: 8 }} />
      ) : (
        chairs.map((chair, index) => (
          <View key={chair.id} style={styles.row}>
            <View style={styles.nameLine}>
              <View style={[styles.swatch, { backgroundColor: chair.color }]} />
              <TextInput
                style={[styles.name, { color: c.textPrimary }]}
                value={chair.name}
                onChangeText={(name) => setChairs((rows) => rows.map((row) => (row.id === chair.id ? { ...row, name } : row)))}
                onEndEditing={(event) => {
                  const name = String(event?.nativeEvent?.text || chair.name || '').trim();
                  if (!name) {
                    load();
                    return;
                  }
                  updateChair(chair, { name });
                }}
                accessibilityLabel={`Name for ${chair.name}`}
              />
            </View>
            <View style={styles.colors}>
              {colors.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => updateChair(chair, { color })}
                  accessibilityLabel={`Color ${color}`}
                  style={[
                    styles.colorBtn,
                    { backgroundColor: color },
                    chair.color.toLowerCase() === color && styles.colorBtnOn,
                  ]}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => moveChair(index, -1)} disabled={index === 0} accessibilityLabel="Move up">
                <Text style={{ color: index === 0 ? c.textDisabled : c.textPrimary, fontSize: 12 }}>Up</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveChair(index, 1)} disabled={index === chairs.length - 1} accessibilityLabel="Move down">
                <Text style={{ color: index === chairs.length - 1 ? c.textDisabled : c.textPrimary, fontSize: 12 }}>Down</Text>
              </TouchableOpacity>
              <Switch
                value={chair.is_active !== false}
                onValueChange={(is_active) => updateChair(chair, { is_active })}
                accessibilityLabel={chair.is_active ? `Hide ${chair.name}` : `Show ${chair.name}`}
              />
              <TouchableOpacity onPress={() => removeChair(chair)} accessibilityLabel={`Remove ${chair.name}`}>
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
      <View style={[styles.addRow, { borderTopColor: c.border }]}>
        <TextInput
          style={[styles.name, { color: c.textPrimary, flex: 1 }]}
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Worker name"
          placeholderTextColor={c.textDisabled}
        />
        <View style={styles.colors}>
          {colors.map((color) => (
            <TouchableOpacity
              key={color}
              onPress={() => setDraftColor(color)}
              accessibilityLabel={`New chair color ${color}`}
              style={[
                styles.colorBtn,
                { backgroundColor: color },
                draftColor === color && styles.colorBtnOn,
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={addChair}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addText}>Add chair</Text>}
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={[styles.wrap, fill && styles.wrapFill, { borderTopColor: c.border }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>Chairs</Text>
      {fill ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {body}
        </ScrollView>
      ) : (
        <View style={styles.scrollContent}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  wrapFill: { flex: 1, minHeight: 0 },
  title: { fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { gap: 10, paddingBottom: 8 },
  row: { gap: 6 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  name: { flex: 1, fontSize: 13, fontWeight: '600', paddingVertical: 2 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  colorBtn: { width: 14, height: 14, borderRadius: 3 },
  colorBtnOn: { borderWidth: 2, borderColor: '#111' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  remove: { color: '#FF3B30', fontWeight: '600', fontSize: 12 },
  addRow: { gap: 8, marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { borderRadius: 8, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  addText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
