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
import BottomSheet, { useMobileBottomSheet } from './BottomSheet';
import CustomerSignInModal from './CustomerSignInModal';
import { QuantityStepper } from './motion';
import { itemRequiresCustomization } from '../utils/menuCustomization';

function RequiredChip({ complete }) {
  return (
    <View
      style={[
        chip.pill,
        complete ? chip.pillComplete : chip.pillIncomplete,
      ]}
      accessibilityLabel={complete ? 'Required, complete' : 'Required'}
    >
      {complete ? (
        <View style={chip.checkCircle} accessibilityElementsHidden>
          <Ionicons name="checkmark" size={9} color="#F0FDF4" />
        </View>
      ) : null}
      <Text style={[chip.label, complete ? chip.labelComplete : chip.labelIncomplete]}>
        Required
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
   Suggestion card — toggle on/off; does NOT immediately add to cart
───────────────────────────────────────────────────────── */
function SuggestionCard({ suggestion, selected, onToggle, disabled, brand, brandText }) {
  return (
    <View style={[sug.card, disabled && sug.cardDisabled]}>
      {suggestion.image_url ? (
        <Image source={{ uri: suggestion.image_url }} style={sug.image} resizeMode="cover" />
      ) : (
        <View style={[sug.image, sug.imagePlaceholder]}>
          <Ionicons name="restaurant-outline" size={22} color="#cbd5e1" />
        </View>
      )}
      <View style={sug.info}>
        <Text style={sug.name} numberOfLines={1}>{suggestion.name}</Text>
        <Text style={sug.price}>+${Number(suggestion.price ?? 0).toFixed(2)}</Text>
        {disabled ? (
          <Text style={sug.desc} numberOfLines={1}>
            Open from the menu to choose options
          </Text>
        ) : suggestion.description ? (
          <Text style={sug.desc} numberOfLines={1}>{suggestion.description}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[
          sug.toggleBtn,
          selected && {
            backgroundColor: brand || '#1a1a1a',
            borderColor: brand || '#1a1a1a',
          },
          disabled && sug.toggleBtnDisabled,
        ]}
        onPress={() => !disabled && onToggle(suggestion)}
        activeOpacity={0.75}
        disabled={disabled}
        accessibilityLabel={
          disabled
            ? `${suggestion.name} requires customization`
            : selected
              ? `Remove ${suggestion.name}`
              : `Add ${suggestion.name}`
        }
      >
        <Ionicons
          name={selected ? 'checkmark' : 'add'}
          size={20}
          color={disabled ? '#bbb' : selected ? (brandText || '#fff') : '#1a1a1a'}
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
  const { isCustomerAuthenticated } = useAuth();
  const mobileSheet = useMobileBottomSheet();
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState(new Set());
  // { [groupId]: string[] optionIds }
  const [selectedByGroup, setSelectedByGroup] = useState({});
  const [modifierError, setModifierError] = useState('');
  const [signInVisible, setSignInVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);

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
      setAdding(false);
      setAddSuccess(false);
      setSignInVisible(false);

      const defaults = {};
      for (const g of item?.modifier_groups || []) {
        const available = (g.options || []).filter((o) => o.is_available !== false);
        const defaultOpts = available.filter((o) => o.is_default).map((o) => o.id);
        if (g.selection_type === 'single') {
          defaults[g.id] = defaultOpts.length ? [defaultOpts[0]] : [];
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
        if (g.selection_type === 'single' || min === 1) {
          return `Choose one option for ${g.name} to continue.`;
        }
        return `Choose at least ${min} options for ${g.name} to continue.`;
      }
      if (g.max_select && count > g.max_select) {
        return `Pick no more than ${g.max_select} options for ${g.name}.`;
      }
    }
    return '';
  };

  const handleAdd = () => {
    if (isUnavailable || adding || addSuccess) return;
    const err = validateModifiers();
    if (err) {
      setModifierError(err);
      return;
    }
    setAdding(true);
    setAddSuccess(true);
    setModifierError('');

    // Brief success state on the button, then commit + close
    setTimeout(() => {
      onAddToCart(item, quantity, specialInstructions, menuType, selectedModifiers, unitPrice);
      suggestedItems
        .filter((s) => selectedSuggestionIds.has(s.id) && !itemRequiresCustomization(s))
        .forEach((s) => onAddToCart(s, 1, '', menuType, [], Number(s.price ?? 0)));
      onClose();
      setAdding(false);
      setAddSuccess(false);
    }, 420);
  };

  const hasSuggestions = suggestedItems.length > 0;

  const cardBody = (
    <>
      {/* Close stays pinned on the shell; image scrolls with details */}
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onClose}
        accessibilityLabel="Close"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color="#333" />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={mobileSheet ? styles.scrollViewSheet : styles.scrollViewDesktop}
        keyboardShouldPersistTaps="handled"
      >
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

          {isUnavailable && (
            <View style={styles.unavailableOverlay}>
              <Ionicons name="alert-circle-outline" size={16} color="#fff" />
              <Text style={styles.unavailableOverlayText}>Currently unavailable</Text>
            </View>
          )}
        </View>

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
                  const requiredMin = Math.max(1, group.min_select || 1);
                  const requiredComplete = selectedIds.length >= requiredMin;
                  return (
                    <View key={group.id} style={styles.section}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>{group.name}</Text>
                        {group.is_required ? (
                          <RequiredChip complete={requiredComplete} />
                        ) : null}
                      </View>
                      <Text style={styles.sectionSubtitle}>
                        {group.selection_type === 'single'
                          ? 'Choose one'
                          : group.max_select
                            ? `Choose up to ${group.max_select}`
                            : 'Choose any that apply'}
                      </Text>
                      {available.map((opt) => {
                        const selected = selectedIds.includes(opt.id);
                        const delta = Number(opt.price_delta) || 0;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.modOptionRow,
                              selected && {
                                borderColor: theme.colors.brand,
                                backgroundColor: theme.colors.brandLight,
                              },
                            ]}
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
                              selected && {
                                backgroundColor: theme.colors.brand,
                                borderColor: theme.colors.brand,
                              },
                            ]}>
                              {selected ? (
                                <Ionicons
                                  name="checkmark"
                                  size={12}
                                  color={theme.colors.brandText || '#fff'}
                                />
                              ) : null}
                            </View>
                            <Text
                              style={[
                                styles.modOptionName,
                                selected && { color: theme.colors.brandDark || theme.colors.brand },
                              ]}
                            >
                              {opt.name}
                            </Text>
                            {delta > 0 ? (
                              <Text style={[styles.modOptionPrice, selected && { color: theme.colors.brand }]}>
                                +${delta.toFixed(2)}
                              </Text>
                            ) : delta < 0 ? (
                              <Text style={[styles.modOptionPrice, selected && { color: theme.colors.brand }]}>
                                -${Math.abs(delta).toFixed(2)}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
                {modifierError ? (
                  <Text
                    style={styles.modError}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    {modifierError}
                  </Text>
                ) : null}
                <View style={styles.divider} />
              </>
            )}

            {/* ── Special requests ── */}
            {!isUnavailable && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Special requests</Text>
                <Text style={styles.sectionSubtitle}>
                  Optional notes for the kitchen (allergies, prep preferences). Requests that change the price aren’t available here.
                </Text>
                <TextInput
                  style={[
                    styles.instructionsInput,
                    {
                      borderColor: theme.colors.border,
                      color: theme.colors.textPrimary,
                      backgroundColor: theme.colors.backgroundSunken,
                    },
                  ]}
                  placeholder="Example: no onions, sauce on the side"
                  placeholderTextColor={theme.colors.textDisabled || '#aaa'}
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                  textAlignVertical="top"
                  accessibilityLabel="Special requests"
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
                    Optional add-ons. Items that need their own options stay off until you open them from the menu.
                  </Text>
                  {suggestedItems.map((s) => (
                    <SuggestionCard
                      key={s.id}
                      suggestion={s}
                      selected={selectedSuggestionIds.has(s.id)}
                      onToggle={handleToggleSuggestion}
                      disabled={itemRequiresCustomization(s)}
                      brand={theme.colors.brand}
                      brandText={theme.colors.brandText}
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
                {isCustomerAuthenticated ? (
                  <Text style={styles.pointsBody}>
                    Redeem loyalty points at checkout — not on this screen.
                  </Text>
                ) : (
                  <Text style={styles.pointsBody}>
                    <Text
                      style={[styles.pointsLink, { color: theme.colors.brand }]}
                      onPress={() => setSignInVisible(true)}
                      accessibilityRole="link"
                      accessibilityLabel="Sign in to use loyalty points"
                    >
                      Sign in
                    </Text>
                    {' to redeem points at checkout.'}
                  </Text>
                )}
              </View>
            </>

            <View style={{ height: 8 }} />
          </ScrollView>

          {!isUnavailable && (
            <View style={styles.footer}>
              <QuantityStepper
                variant="modal"
                value={quantity}
                onDecrease={handleDecrease}
                onIncrease={handleIncrease}
                min={1}
              />

              <TouchableOpacity
                style={[
                  styles.addBtn,
                  {
                    backgroundColor: addSuccess
                      ? (theme.colors.brandDark || theme.colors.brand)
                      : theme.colors.brand,
                  },
                  (adding || addSuccess) && styles.addBtnDisabled,
                ]}
                onPress={handleAdd}
                activeOpacity={0.85}
                disabled={adding || addSuccess}
              >
                {addSuccess ? (
                  <>
                    <View style={styles.addBtnSuccessRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={theme.colors.brandText || '#fff'}
                      />
                      <Text style={styles.addBtnText}>Added to cart</Text>
                    </View>
                    <View style={styles.addBtnPricePill}>
                      <Text style={[styles.addBtnPrice, { color: theme.colors.brand }]}>
                        ${totalPrice}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.addBtnText}>
                      {adding ? 'Adding…' : 'Add to cart'}
                    </Text>
                    <View style={styles.addBtnPricePill}>
                      <Text style={[styles.addBtnPrice, { color: theme.colors.brand }]}>
                        ${totalPrice}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={theme.colors.brand} />
                    </View>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
    </>
  );

  if (mobileSheet) {
    return (
      <BottomSheet visible={visible} onClose={onClose} expand>
        <View style={styles.sheetInner}>{cardBody}</View>
      </BottomSheet>
    );
  }

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
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
          <Pressable style={styles.backdrop} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            { opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          {cardBody}
        </Animated.View>
      </KeyboardAvoidingView>

      <CustomerSignInModal
        visible={signInVisible}
        onClose={() => setSignInVisible(false)}
      />
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
    maxHeight: Platform.OS === 'web' ? '85vh' : '100%',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 12 },
    }),
  },
  sheetInner: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.18)' },
    }),
  },

  // Scroll body — sheet has an explicit height, so flex:1 fills it.
  // Desktop card is height-auto with maxHeight only; flex:1 would collapse to 0.
  scrollViewSheet: {
    flex: 1,
    minHeight: 0,
  },
  scrollViewDesktop: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  sectionTitleInRow: {
    marginBottom: 0,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#777',
    lineHeight: 19,
    marginBottom: 12,
  },

  // Special request input
  instructionsInput: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111',
    minHeight: 80,
    backgroundColor: '#fafafa',
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
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
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
  addBtnDisabled: {
    opacity: 0.65,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  addBtnSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  cardDisabled: {
    opacity: 0.72,
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
  toggleBtnDisabled: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
});

const chip = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
    minHeight: 20,
  },
  pillIncomplete: {
    backgroundColor: '#E5E7EB',
  },
  pillComplete: {
    backgroundColor: '#F0FDF4',
  },
  checkCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelIncomplete: {
    color: '#4B5563',
  },
  labelComplete: {
    color: '#166534',
  },
});
