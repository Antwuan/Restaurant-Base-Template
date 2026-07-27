import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   Suggestion card — toggle on/off; does NOT immediately add to cart
───────────────────────────────────────────────────────── */
function SuggestionCard({ suggestion, selected, onToggle }) {
  return (
    <View style={sug.card}>
      {suggestion.image_url ? (
        <Image source={{ uri: suggestion.image_url }} style={sug.image} resizeMode="cover" />
      ) : (
        <View style={[sug.image, sug.imagePlaceholder]}>
          <Text style={{ fontSize: 22 }}>🍽</Text>
        </View>
      )}
      <View style={sug.info}>
        <Text style={sug.name} numberOfLines={1}>{suggestion.name}</Text>
        <Text style={sug.price}>+${Number(suggestion.price ?? 0).toFixed(2)}</Text>
        {suggestion.description ? (
          <Text style={sug.desc} numberOfLines={1}>{suggestion.description}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[sug.toggleBtn, selected && sug.toggleBtnSelected]}
        onPress={() => onToggle(suggestion)}
        activeOpacity={0.75}
        accessibilityLabel={selected ? `Remove ${suggestion.name}` : `Add ${suggestion.name}`}
      >
        <Ionicons
          name={selected ? 'checkmark' : 'add'}
          size={20}
          color={selected ? '#fff' : '#1a1a1a'}
        />
      </TouchableOpacity>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
   Main modal
───────────────────────────────────────────────────────── */
export default function MenuItemModal({
  item,
  visible,
  onClose,
  onAddToCart,
  suggestedItems = [],
  menuType = 'regular',
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState(new Set());
  // { [groupId]: string[] optionIds }
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [modifierError, setModifierError] = useState('');

  // Entrance animation — scale + fade
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const modifierGroups = Array.isArray(item?.modifier_groups) ? item.modifier_groups : [];

  useEffect(() => {
    if (visible) {
      setQuantity(1);
      setSpecialInstructions('');
      setSelectedSuggestionIds(new Set());
      setModifierError('');

      const defaults = {};
      for (const g of item?.modifier_groups || []) {
        const available = (g.options || []).filter((o) => o.is_available !== false);
        const defaultOpts = available.filter((o) => o.is_default).map((o) => o.id);
        if (g.selection_type === 'single') {
          defaults[g.id] = defaultOpts.length
            ? [defaultOpts[0]]
            : (g.is_required && available[0] ? [available[0].id] : []);
        } else {
          defaults[g.id] = defaultOpts;
        }
      }
      setSelectedByGroup(defaults);

      cardScale.setValue(0.88);
      cardOpacity.setValue(0);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(cardScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 220,
          friction: 18,
        }),
      ]).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item?.id]);

  if (!item) return null;

  const isUnavailable = !item.is_available;

  const selectedModifiers = [];
  let modifiersDelta = 0;
  for (const g of modifierGroups) {
    const ids = selectedByGroup[g.id] || [];
    for (const optId of ids) {
      const opt = (g.options || []).find((o) => o.id === optId);
      if (!opt) continue;
      const delta = Number(opt.price_delta) || 0;
      modifiersDelta += delta;
      selectedModifiers.push({
        groupId: g.id,
        groupName: g.name,
        optionId: opt.id,
        optionName: opt.name,
        priceDelta: delta,
      });
    }
  }

  const suggestionsSubtotal = suggestedItems
    .filter((s) => selectedSuggestionIds.has(s.id))
    .reduce((sum, s) => sum + Number(s.price ?? 0), 0);

  const unitPrice = Number(item.price ?? 0) + modifiersDelta;
  const totalPrice = (unitPrice * quantity + suggestionsSubtotal).toFixed(2);

  const handleDecrease = () => setQuantity((q) => Math.max(1, q - 1));
  const handleIncrease = () => setQuantity((q) => q + 1);

  const handleToggleSuggestion = (suggestion) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestion.id)) {
        next.delete(suggestion.id);
      } else {
        next.add(suggestion.id);
      }
      return next;
    });
  };

  const selectSingle = (groupId, optionId) => {
    setSelectedByGroup((prev) => ({ ...prev, [groupId]: [optionId] }));
    setModifierError('');
  };

  const toggleMulti = (group, optionId) => {
    setSelectedByGroup((prev) => {
      const current = prev[group.id] || [];
      const exists = current.includes(optionId);
      let next;
      if (exists) {
        next = current.filter((id) => id !== optionId);
      } else {
        const max = group.max_select || 99;
        if (current.length >= max) {
          next = [...current.slice(1), optionId];
        } else {
          next = [...current, optionId];
        }
      }
      return { ...prev, [group.id]: next };
    });
    setModifierError('');
  };

  const validateModifiers = () => {
    for (const g of modifierGroups) {
      const count = (selectedByGroup[g.id] || []).length;
      const min = g.is_required ? Math.max(1, g.min_select || 1) : (g.min_select || 0);
      if (count < min) {
        return `Please choose ${g.selection_type === 'single' ? 'an option' : 'options'} for ${g.name}`;
      }
      if (g.max_select && count > g.max_select) {
        return `Too many options selected for ${g.name}`;
      }
    }
    return '';
  };

  const handleAdd = () => {
    if (isUnavailable) return;
    const err = validateModifiers();
    if (err) {
      setModifierError(err);
      return;
    }
    onAddToCart(item, quantity, specialInstructions, menuType, selectedModifiers, unitPrice);
    suggestedItems
      .filter((s) => selectedSuggestionIds.has(s.id))
      .forEach((s) => onAddToCart(s, 1, '', menuType, [], Number(s.price ?? 0)));
    onClose();
  };

  const hasSuggestions = suggestedItems.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Dimmed backdrop — tap to close */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
          <Pressable style={styles.backdrop} onPress={onClose} />
        </Animated.View>

        {/* Floating card — scale + fade entrance */}
        <Animated.View
          style={[
            styles.card,
            { opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          {/* ── Image ── */}
          <View style={styles.imageWrap}>
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={[styles.image, isUnavailable && styles.imageUnavailable]}
                resizeMode="cover"
                accessibilityLabel={item.name}
              />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: theme.colors.backgroundSunken || '#f3f4f6' }]}>
                <Text style={styles.imagePlaceholderEmoji}>🍽</Text>
              </View>
            )}

            {/* Unavailable overlay */}
            {isUnavailable && (
              <View style={styles.unavailableOverlay}>
                <Ionicons name="alert-circle-outline" size={16} color="#fff" />
                <Text style={styles.unavailableOverlayText}>Currently unavailable</Text>
              </View>
            )}
          </View>

          {/* ── Close button — floats above image ── */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color="#333" />
          </TouchableOpacity>

          {/* ── Scrollable body ── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name + price */}
            <View style={styles.body}>
              <Text style={styles.itemName}>{item.name}</Text>

              {/* Description */}
              {item.description ? (
                <Text style={styles.description}>{item.description}</Text>
              ) : null}
            </View>

            <View style={styles.divider} />

            {/* ── Customizations ── */}
            {!isUnavailable && modifierGroups.length > 0 && (
              <>
                {modifierGroups.map((group) => {
                  const selectedIds = selectedByGroup[group.id] || [];
                  const available = (group.options || []).filter((o) => o.is_available !== false);
                  return (
                    <View key={group.id} style={styles.section}>
                      <Text style={styles.sectionTitle}>
                        {group.name}
                        {group.is_required ? ' *' : ''}
                      </Text>
                      <Text style={styles.sectionSubtitle}>
                        {group.selection_type === 'single'
                          ? 'Choose one'
                          : `Choose up to ${group.max_select || available.length}`}
                      </Text>
                      {available.map((opt) => {
                        const selected = selectedIds.includes(opt.id);
                        const delta = Number(opt.price_delta) || 0;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[styles.modOptionRow, selected && styles.modOptionSelected]}
                            onPress={() =>
                              group.selection_type === 'single'
                                ? selectSingle(group.id, opt.id)
                                : toggleMulti(group, opt.id)
                            }
                            activeOpacity={0.75}
                          >
                            <View style={[
                              styles.modRadio,
                              group.selection_type === 'multi' && styles.modCheck,
                              selected && styles.modRadioSelected,
                            ]}>
                              {selected ? (
                                <Ionicons name="checkmark" size={12} color="#fff" />
                              ) : null}
                            </View>
                            <Text style={styles.modOptionName}>{opt.name}</Text>
                            {delta > 0 ? (
                              <Text style={styles.modOptionPrice}>+${delta.toFixed(2)}</Text>
                            ) : delta < 0 ? (
                              <Text style={styles.modOptionPrice}>-${Math.abs(delta).toFixed(2)}</Text>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
                {modifierError ? (
                  <Text style={styles.modError}>{modifierError}</Text>
                ) : null}
                <View style={styles.divider} />
              </>
            )}

            {/* ── Special requests ── */}
            {!isUnavailable && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Special requests</Text>
                <Text style={styles.sectionSubtitle}>
                  We'll try our best to accommodate requests, but can't make changes that affect pricing.
                </Text>
                <TextInput
                  style={styles.instructionsInput}
                  placeholder="Add special request"
                  placeholderTextColor="#aaa"
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                  textAlignVertical="top"
                />
              </View>
            )}

            {/* ── Goes well with ── */}
            {hasSuggestions && (
              <>
                <View style={styles.divider} />
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Goes well with</Text>
                  <Text style={styles.sectionSubtitle}>
                    Select any extras to add them to your order.
                  </Text>
                  {suggestedItems.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      selected={selectedSuggestionIds.has(s.id)}
                      onToggle={handleToggleSuggestion}
                    />
                  ))}
                </View>
              </>
            )}

            {/* ── Pay with points ── */}
            <>
              <View style={styles.divider} />
              <View style={[styles.section, styles.pointsSection]}>
                <Text style={styles.sectionTitle}>Pay with points</Text>
                {user ? (
                  <Text style={styles.pointsBody}>
                    You can redeem your loyalty points at checkout.
                  </Text>
                ) : (
                  <Text style={styles.pointsBody}>
                    <Text style={styles.pointsLink}>Sign in</Text>
                    {' to pay with points'}
                  </Text>
                )}
              </View>
            </>

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* ── Footer: qty stepper + Add to cart ── */}
          {!isUnavailable && (
            <View style={styles.footer}>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepperBtn, quantity <= 1 && styles.stepperBtnDisabled]}
                  onPress={handleDecrease}
                  accessibilityLabel="Decrease quantity"
                >
                  <Ionicons name="remove" size={20} color={quantity <= 1 ? '#ccc' : '#333'} />
                </TouchableOpacity>
                <Text style={styles.stepperCount}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={handleIncrease}
                  accessibilityLabel="Increase quantity"
                >
                  <Ionicons name="add" size={20} color="#333" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: theme.colors.brand }]}
                onPress={handleAdd}
                activeOpacity={0.85}
              >
                <Text style={styles.addBtnText}>Add item</Text>
                <View style={styles.addBtnPricePill}>
                  <Text style={[styles.addBtnPrice, { color: theme.colors.brand }]}>
                    ${totalPrice}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.colors.brand} />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─────────────────────────────────────────────────────────
   Styles
───────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },

  // Image
  imageWrap: {
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 320,
    backgroundColor: '#f3f4f6',
  },
  imageUnavailable: {
    opacity: 0.5,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderEmoji: {
    fontSize: 56,
  },
  unavailableOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  unavailableOverlayText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // Close button
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.18)' },
    }),
  },

  // Scroll body
  scrollView: {
    flexShrink: 1,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  itemName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    lineHeight: 28,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 20,
  },

  // Generic section
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#777',
    lineHeight: 19,
    marginBottom: 12,
  },

  // Special request input
  instructionsInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111',
    minHeight: 80,
    backgroundColor: '#fafafa',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  modOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  modOptionSelected: {
    borderColor: '#111',
    backgroundColor: '#f7f7f7',
  },
  modRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#bbb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modCheck: {
    borderRadius: 4,
  },
  modRadioSelected: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  modOptionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#222',
  },
  modOptionPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  modError: {
    color: '#dc2626',
    fontSize: 13,
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  // Pay with points
  pointsSection: {
    backgroundColor: '#fffbf0',
  },
  pointsBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  pointsLink: {
    color: '#111',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 40,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  stepperBtnDisabled: {
    backgroundColor: '#fafafa',
  },
  stepperCount: {
    width: 36,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  addBtnPricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 2,
  },
  addBtnPrice: {
    fontSize: 14,
    fontWeight: '700',
  },
});

/* ─────────────────────────────────────────────────────────
   Suggestion card styles
───────────────────────────────────────────────────────── */
const sug = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    flexShrink: 0,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 1,
  },
  desc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  toggleBtnSelected: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
});
