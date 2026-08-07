/**
 * Admin Rewards Screen
 * - Configure points earn rate (points_per_dollar)
 * - CRUD offers (points + promo-like benefits → mint 1-use codes on redeem)
 * - Marketing promo codes (checkout-applied)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { useRestaurantContext } from '../../context/RestaurantContext';
import * as restaurantService from '../../services/restaurantService';
import * as rewardsService from '../../services/rewardsService';
import * as promoService from '../../services/promoService';
import * as menuService from '../../services/menuService';

const BENEFIT_TYPES = promoService.BENEFIT_TYPES;

function benefitLabel(row) {
  if (row.benefit_type === 'percent_off') return `${Number(row.discount_value)}% off`;
  if (row.benefit_type === 'amount_off') return `$${Number(row.discount_value).toFixed(2)} off`;
  if (row.benefit_type === 'free_item') {
    return row.menu_items?.name ? `Free ${row.menu_items.name}` : 'Free item';
  }
  if (row.benefit_type === 'bogo') {
    const x = Number(row.get_quantity) || 1;
    const name = row.menu_items?.name ? ` ${row.menu_items.name}` : '';
    return `Buy 1 get ${x} free${name}`;
  }
  if (row.benefit_type === 'buy_x_percent_off') {
    return `Buy ${Number(row.buy_quantity) || 1}+ · ${Number(row.discount_value)}% off`;
  }
  if (row.benefit_type === 'buy_x_amount_off') {
    return `Buy ${Number(row.buy_quantity) || 1}+ · $${Number(row.discount_value).toFixed(2)} off`;
  }
  return row.benefit_type || 'No benefit set';
}

function confirmDestructive(title, message) {
  return new Promise((resolve) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function notify(title, message) {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(text);
    return;
  }
  Alert.alert(title, message);
}

/** Shared benefit-type fields for Offer + Promo forms. */
function BenefitFields({
  benefitType,
  setBenefitType,
  discountValue,
  setDiscountValue,
  menuItemId,
  setMenuItemId,
  buyQuantity,
  setBuyQuantity,
  getQuantity,
  setGetQuantity,
  menuItems,
  brandColor,
  colors: c,
  errors,
  clearError,
}) {
  const needsMenuItem = ['free_item', 'bogo', 'buy_x_percent_off', 'buy_x_amount_off'].includes(benefitType);
  const needsDiscount = ['percent_off', 'amount_off', 'buy_x_percent_off', 'buy_x_amount_off'].includes(benefitType);
  const isPercent = benefitType === 'percent_off' || benefitType === 'buy_x_percent_off';

  return (
    <>
      <Text style={[form.label, { color: c.textSecondary }]}>Benefit type *</Text>
      <View style={form.typeRow}>
        {BENEFIT_TYPES.map((t) => {
          const selected = benefitType === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[
                form.typeChip,
                {
                  borderColor: selected ? brandColor : c.border,
                  backgroundColor: selected ? brandColor : c.backgroundSunken,
                },
              ]}
              onPress={() => {
                setBenefitType(t.value);
                clearError('discountValue');
                clearError('menuItemId');
                clearError('buyQuantity');
                clearError('getQuantity');
              }}
            >
              <Text style={[form.typeChipText, { color: selected ? '#fff' : c.textSecondary }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {needsMenuItem ? (
        <>
          <Text style={[form.label, { color: c.textSecondary }]}>
            {benefitType === 'free_item' ? 'Free menu item *' : 'Menu item *'}
          </Text>
          <ScrollView style={form.itemPicker} nestedScrollEnabled>
            {(menuItems || []).map((item) => {
              const selected = menuItemId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    form.itemOption,
                    {
                      borderColor: selected ? brandColor : c.border,
                      backgroundColor: selected ? `${brandColor}14` : c.backgroundSunken,
                    },
                  ]}
                  onPress={() => { setMenuItemId(item.id); clearError('menuItemId'); }}
                >
                  <Text style={{ color: c.textPrimary, fontWeight: selected ? '700' : '500' }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: c.textSecondary }}>${Number(item.price).toFixed(2)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {errors.menuItemId ? <Text style={form.errorText}>{errors.menuItemId}</Text> : null}
        </>
      ) : null}

      {benefitType === 'bogo' ? (
        <>
          <Text style={[form.label, { color: c.textSecondary }]}>Get quantity (X free) *</Text>
          <TextInput
            style={[
              form.input,
              {
                color: c.textPrimary,
                backgroundColor: c.backgroundSunken,
                borderColor: errors.getQuantity ? '#ef4444' : c.border,
              },
            ]}
            value={getQuantity}
            onChangeText={(v) => { setGetQuantity(v); clearError('getQuantity'); }}
            placeholder="1"
            placeholderTextColor={c.textDisabled}
            keyboardType="number-pad"
          />
          {errors.getQuantity ? <Text style={form.errorText}>{errors.getQuantity}</Text> : null}
        </>
      ) : null}

      {(benefitType === 'buy_x_percent_off' || benefitType === 'buy_x_amount_off') ? (
        <>
          <Text style={[form.label, { color: c.textSecondary }]}>Buy quantity (threshold) *</Text>
          <TextInput
            style={[
              form.input,
              {
                color: c.textPrimary,
                backgroundColor: c.backgroundSunken,
                borderColor: errors.buyQuantity ? '#ef4444' : c.border,
              },
            ]}
            value={buyQuantity}
            onChangeText={(v) => { setBuyQuantity(v); clearError('buyQuantity'); }}
            placeholder="2"
            placeholderTextColor={c.textDisabled}
            keyboardType="number-pad"
          />
          {errors.buyQuantity ? <Text style={form.errorText}>{errors.buyQuantity}</Text> : null}
        </>
      ) : null}

      {needsDiscount ? (
        <>
          <Text style={[form.label, { color: c.textSecondary }]}>
            {isPercent ? 'Percent off *' : 'Amount off ($) *'}
          </Text>
          <TextInput
            style={[
              form.input,
              {
                color: c.textPrimary,
                backgroundColor: c.backgroundSunken,
                borderColor: errors.discountValue ? '#ef4444' : c.border,
              },
            ]}
            value={discountValue}
            onChangeText={(v) => { setDiscountValue(v); clearError('discountValue'); }}
            placeholder={isPercent ? '10' : '5.00'}
            placeholderTextColor={c.textDisabled}
            keyboardType="decimal-pad"
          />
          {errors.discountValue ? <Text style={form.errorText}>{errors.discountValue}</Text> : null}
        </>
      ) : null}
    </>
  );
}

function validateBenefitFields({
  benefitType,
  discountValue,
  menuItemId,
  buyQuantity,
  getQuantity,
}) {
  const newErrors = {};
  if (['free_item', 'bogo', 'buy_x_percent_off', 'buy_x_amount_off'].includes(benefitType)) {
    if (!menuItemId) newErrors.menuItemId = 'Select a menu item';
  }
  if (benefitType === 'bogo') {
    const g = parseInt(getQuantity, 10);
    if (!g || g <= 0) newErrors.getQuantity = 'Enter how many free (X)';
  }
  if (benefitType === 'buy_x_percent_off' || benefitType === 'buy_x_amount_off') {
    const b = parseInt(buyQuantity, 10);
    if (!b || b <= 0) newErrors.buyQuantity = 'Enter buy quantity threshold';
  }
  if (['percent_off', 'amount_off', 'buy_x_percent_off', 'buy_x_amount_off'].includes(benefitType)) {
    const val = parseFloat(discountValue);
    if (!val || val <= 0) newErrors.discountValue = 'Enter a positive value';
    if ((benefitType === 'percent_off' || benefitType === 'buy_x_percent_off') && val > 100) {
      newErrors.discountValue = 'Percent cannot exceed 100';
    }
  }
  return newErrors;
}

function buildBenefitPayload({
  benefitType,
  discountValue,
  menuItemId,
  buyQuantity,
  getQuantity,
}) {
  return {
    benefit_type: benefitType,
    discount_value: ['percent_off', 'amount_off', 'buy_x_percent_off', 'buy_x_amount_off'].includes(benefitType)
      ? parseFloat(discountValue)
      : null,
    menu_item_id: ['free_item', 'bogo', 'buy_x_percent_off', 'buy_x_amount_off'].includes(benefitType)
      ? menuItemId
      : null,
    buy_quantity: (benefitType === 'buy_x_percent_off' || benefitType === 'buy_x_amount_off')
      ? parseInt(buyQuantity, 10)
      : null,
    get_quantity: benefitType === 'bogo' ? parseInt(getQuantity, 10) : null,
  };
}

function OfferForm({ offer, brandColor, menuItems, onSave, onCancel }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [title, setTitle] = useState(offer?.title ?? '');
  const [description, setDescription] = useState(offer?.description ?? '');
  const [pointsCost, setPointsCost] = useState(String(offer?.points_cost ?? ''));
  const [benefitType, setBenefitType] = useState(offer?.benefit_type ?? 'percent_off');
  const [discountValue, setDiscountValue] = useState(
    offer?.discount_value != null ? String(offer.discount_value) : '',
  );
  const [menuItemId, setMenuItemId] = useState(offer?.menu_item_id ?? null);
  const [buyQuantity, setBuyQuantity] = useState(
    offer?.buy_quantity != null ? String(offer.buy_quantity) : '',
  );
  const [getQuantity, setGetQuantity] = useState(
    offer?.get_quantity != null ? String(offer.get_quantity) : '1',
  );
  const [isActive, setIsActive] = useState(offer?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: null }));

  const handleSave = async () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    const pts = parseInt(pointsCost, 10);
    if (!pts || pts <= 0) newErrors.pointsCost = 'Points cost must be a positive number';
    Object.assign(newErrors, validateBenefitFields({
      benefitType, discountValue, menuItemId, buyQuantity, getQuantity,
    }));
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        points_cost: pts,
        is_active: isActive,
        ...buildBenefitPayload({
          benefitType, discountValue, menuItemId, buyQuantity, getQuantity,
        }),
      });
    } catch {
      // Parent shows notify(); keep modal open for retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView
        style={form.body}
        contentContainerStyle={form.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[form.label, { color: c.textSecondary }]}>Title *</Text>
        <TextInput
          style={[
            form.input,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: errors.title ? '#ef4444' : c.border,
            },
          ]}
          value={title}
          onChangeText={(v) => { setTitle(v); clearError('title'); }}
          placeholder="e.g. Free Coffee"
          placeholderTextColor={c.textDisabled}
        />
        {errors.title ? <Text style={form.errorText}>{errors.title}</Text> : null}

        <Text style={[form.label, { color: c.textSecondary }]}>Description</Text>
        <TextInput
          style={[
            form.input,
            form.textArea,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: c.border,
            },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details"
          placeholderTextColor={c.textDisabled}
          multiline
          numberOfLines={2}
        />

        <Text style={[form.label, { color: c.textSecondary }]}>Points Required *</Text>
        <TextInput
          style={[
            form.input,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: errors.pointsCost ? '#ef4444' : c.border,
            },
          ]}
          value={pointsCost}
          onChangeText={(v) => { setPointsCost(v); clearError('pointsCost'); }}
          placeholder="e.g. 500"
          placeholderTextColor={c.textDisabled}
          keyboardType="number-pad"
        />
        {errors.pointsCost ? <Text style={form.errorText}>{errors.pointsCost}</Text> : null}

        <BenefitFields
          benefitType={benefitType}
          setBenefitType={setBenefitType}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
          menuItemId={menuItemId}
          setMenuItemId={setMenuItemId}
          buyQuantity={buyQuantity}
          setBuyQuantity={setBuyQuantity}
          getQuantity={getQuantity}
          setGetQuantity={setGetQuantity}
          menuItems={menuItems}
          brandColor={brandColor}
          colors={c}
          errors={errors}
          clearError={clearError}
        />

        <View style={form.switchRow}>
          <Text style={[form.label, { color: c.textSecondary, marginTop: 0, marginBottom: 0 }]}>
            Active
          </Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: brandColor, false: '#ccc' }}
          />
        </View>
      </ScrollView>

      <View style={form.footer}>
        <TouchableOpacity
          style={[form.cancelBtn, { borderColor: c.border }]}
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={[form.cancelText, { color: c.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[form.saveBtn, { backgroundColor: brandColor }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={form.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </>
  );
}

function PromoForm({ promo, brandColor, menuItems, onSave, onCancel }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [title, setTitle] = useState(promo?.title ?? '');
  const [description, setDescription] = useState(promo?.description ?? '');
  const [code, setCode] = useState(promo?.code ?? promoService.generatePromoCode());
  const [benefitType, setBenefitType] = useState(promo?.benefit_type ?? 'percent_off');
  const [discountValue, setDiscountValue] = useState(
    promo?.discount_value != null ? String(promo.discount_value) : '',
  );
  const [menuItemId, setMenuItemId] = useState(promo?.menu_item_id ?? null);
  const [buyQuantity, setBuyQuantity] = useState(
    promo?.buy_quantity != null ? String(promo.buy_quantity) : '',
  );
  const [getQuantity, setGetQuantity] = useState(
    promo?.get_quantity != null ? String(promo.get_quantity) : '1',
  );
  const [maxRedemptions, setMaxRedemptions] = useState(
    promo?.max_redemptions != null ? String(promo.max_redemptions) : '',
  );
  const [expiresAt, setExpiresAt] = useState(
    promo?.expires_at ? String(promo.expires_at).slice(0, 10) : '',
  );
  const [isActive, setIsActive] = useState(promo?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const clearError = (key) => setErrors((prev) => ({ ...prev, [key]: null }));

  const handleSave = async () => {
    const newErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!code.trim()) newErrors.code = 'Code is required';
    Object.assign(newErrors, validateBenefitFields({
      benefitType, discountValue, menuItemId, buyQuantity, getQuantity,
    }));
    if (maxRedemptions.trim()) {
      const max = parseInt(maxRedemptions, 10);
      if (!max || max <= 0) newErrors.maxRedemptions = 'Must be a positive number';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        code: code.trim().toUpperCase(),
        ...buildBenefitPayload({
          benefitType, discountValue, menuItemId, buyQuantity, getQuantity,
        }),
        max_redemptions: maxRedemptions.trim() ? parseInt(maxRedemptions, 10) : null,
        expires_at: expiresAt.trim() ? new Date(`${expiresAt.trim()}T23:59:59`).toISOString() : null,
        is_active: isActive,
      });
    } catch {
      // Parent shows notify(); keep modal open for retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView
        style={form.body}
        contentContainerStyle={form.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[form.label, { color: c.textSecondary }]}>Title *</Text>
        <TextInput
          style={[
            form.input,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: errors.title ? '#ef4444' : c.border,
            },
          ]}
          value={title}
          onChangeText={(v) => { setTitle(v); clearError('title'); }}
          placeholder="e.g. Spring 10% Off"
          placeholderTextColor={c.textDisabled}
        />
        {errors.title ? <Text style={form.errorText}>{errors.title}</Text> : null}

        <Text style={[form.label, { color: c.textSecondary }]}>Code *</Text>
        <View style={form.codeRow}>
          <TextInput
            style={[
              form.input,
              form.codeInput,
              {
                color: c.textPrimary,
                backgroundColor: c.backgroundSunken,
                borderColor: errors.code ? '#ef4444' : c.border,
              },
            ]}
            value={code}
            onChangeText={(v) => { setCode(v.toUpperCase()); clearError('code'); }}
            placeholder="SAVE10"
            placeholderTextColor={c.textDisabled}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[form.regenBtn, { borderColor: c.border }]}
            onPress={() => setCode(promoService.generatePromoCode())}
          >
            <Ionicons name="refresh" size={18} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
        {errors.code ? <Text style={form.errorText}>{errors.code}</Text> : null}

        <Text style={[form.label, { color: c.textSecondary }]}>Description</Text>
        <TextInput
          style={[
            form.input,
            form.textArea,
            { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details for staff"
          placeholderTextColor={c.textDisabled}
          multiline
          numberOfLines={2}
        />

        <BenefitFields
          benefitType={benefitType}
          setBenefitType={setBenefitType}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
          menuItemId={menuItemId}
          setMenuItemId={setMenuItemId}
          buyQuantity={buyQuantity}
          setBuyQuantity={setBuyQuantity}
          getQuantity={getQuantity}
          setGetQuantity={setGetQuantity}
          menuItems={menuItems}
          brandColor={brandColor}
          colors={c}
          errors={errors}
          clearError={clearError}
        />

        <Text style={[form.label, { color: c.textSecondary }]}>Max redemptions</Text>
        <TextInput
          style={[
            form.input,
            {
              color: c.textPrimary,
              backgroundColor: c.backgroundSunken,
              borderColor: errors.maxRedemptions ? '#ef4444' : c.border,
            },
          ]}
          value={maxRedemptions}
          onChangeText={(v) => { setMaxRedemptions(v); clearError('maxRedemptions'); }}
          placeholder="Unlimited"
          placeholderTextColor={c.textDisabled}
          keyboardType="number-pad"
        />
        <Text style={[form.helperText, { color: c.textSecondary }]}>
          Total uses across all customers. Leave blank for unlimited.
        </Text>
        {errors.maxRedemptions ? <Text style={form.errorText}>{errors.maxRedemptions}</Text> : null}

        <Text style={[form.label, { color: c.textSecondary }]}>Expires (optional)</Text>
        <TextInput
          style={[
            form.input,
            { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border },
          ]}
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.textDisabled}
          autoCapitalize="none"
        />

        <View style={form.switchRow}>
          <Text style={[form.label, { color: c.textSecondary, marginTop: 0, marginBottom: 0 }]}>
            Active
          </Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: brandColor, false: '#ccc' }}
          />
        </View>
      </ScrollView>

      <View style={form.footer}>
        <TouchableOpacity
          style={[form.cancelBtn, { borderColor: c.border }]}
          onPress={onCancel}
          disabled={saving}
        >
          <Text style={[form.cancelText, { color: c.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[form.saveBtn, { backgroundColor: brandColor }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={form.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </>
  );
}

const form = StyleSheet.create({
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  helperText: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: { height: 72, textAlignVertical: 'top', paddingTop: 12 },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 4 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeInput: { flex: 1 },
  regenBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  typeChipText: { fontSize: 13, fontWeight: '700' },
  itemPicker: { maxHeight: 140 },
  itemOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

export default function AdminRewardsScreen() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { restaurant, refreshRestaurant } = useRestaurantContext();

  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [promos, setPromos] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [pointsPerDollar, setPointsPerDollar] = useState(
    String(restaurant?.points_per_dollar ?? '1'),
  );
  const [savingRate, setSavingRate] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);

  const closeForm = () => {
    setShowForm(false);
    setEditingOffer(null);
  };

  const closePromoForm = () => {
    setShowPromoForm(false);
    setEditingPromo(null);
  };

  const loadMenuItems = useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      const items = await menuService.getMenuItems(restaurant.id);
      setMenuItems((items || []).filter((i) => i.is_available !== false));
    } catch {
      // non-fatal; forms can still open
    }
  }, [restaurant?.id]);

  const loadOffers = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingOffers(true);
    try {
      const data = await rewardsService.getAllOffers(restaurant.id);
      setOffers(data);
    } catch (e) {
      notify('Error', e.message || 'Could not load offers.');
    } finally {
      setLoadingOffers(false);
    }
  }, [restaurant?.id]);

  const loadPromos = useCallback(async () => {
    if (!restaurant?.id) return;
    setLoadingPromos(true);
    try {
      const data = await promoService.getAllPromos(restaurant.id);
      setPromos(data);
    } catch (e) {
      notify('Error', e.message || 'Could not load marketing promos.');
    } finally {
      setLoadingPromos(false);
    }
  }, [restaurant?.id]);

  useEffect(() => { loadOffers(); }, [loadOffers]);
  useEffect(() => { loadPromos(); }, [loadPromos]);
  useEffect(() => { loadMenuItems(); }, [loadMenuItems]);

  const handleSaveRate = async () => {
    const rate = parseFloat(pointsPerDollar);
    if (isNaN(rate) || rate < 0) { notify('Validation', 'Enter a valid earn rate (e.g. 1 or 0.5).'); return; }
    setSavingRate(true);
    try {
      await restaurantService.updateRestaurant(restaurant.id, { points_per_dollar: rate });
      await refreshRestaurant();
      notify('Saved', 'Earn rate updated.');
    } catch (e) {
      notify('Error', 'Could not save earn rate.');
    } finally {
      setSavingRate(false);
    }
  };

  const handleSaveOffer = async (data) => {
    try {
      if (editingOffer) {
        await rewardsService.updateOffer(editingOffer.id, data);
      } else {
        await rewardsService.createOffer(restaurant.id, { ...data, sort_order: offers.length });
      }
      closeForm();
      await loadOffers();
    } catch (e) {
      notify('Error', e.message || 'Could not save offer.');
      throw e; // keep OfferForm aware save failed
    }
  };

  const handleToggleActive = async (offer) => {
    try {
      await rewardsService.updateOffer(offer.id, { is_active: !offer.is_active });
      await loadOffers();
    } catch (e) {
      notify('Error', e.message || 'Could not update offer.');
    }
  };

  const handleDeleteOffer = async (offer) => {
    const ok = await confirmDestructive('Delete Offer', `Delete "${offer.title}"?`);
    if (!ok) return;
    try {
      await rewardsService.deleteOffer(offer.id);
      await loadOffers();
    } catch (e) {
      notify('Error', e.message || 'Could not delete offer.');
    }
  };

  const handleSavePromo = async (data) => {
    try {
      if (editingPromo) {
        await promoService.updatePromo(editingPromo.id, data);
      } else {
        await promoService.createPromo(restaurant.id, data);
      }
      closePromoForm();
      await loadPromos();
    } catch (e) {
      notify('Error', e.message || 'Could not save promo.');
      throw e; // keep PromoForm aware save failed
    }
  };

  const handleTogglePromoActive = async (promo) => {
    try {
      await promoService.updatePromo(promo.id, { is_active: !promo.is_active });
      await loadPromos();
    } catch (e) {
      notify('Error', e.message || 'Could not update promo.');
    }
  };

  const handleDeletePromo = async (promo) => {
    const ok = await confirmDestructive(
      'Delete Promo',
      `Delete "${promo.title}" (${promo.code})?`,
    );
    if (!ok) return;
    try {
      await promoService.deletePromo(promo.id);
      await loadPromos();
    } catch (e) {
      notify('Error', e.message || 'Could not delete promo.');
    }
  };

  const handleCopyForEmail = async (promo) => {
    const blurb = promoService.formatPromoEmailBlurb(promo);
    try {
      await promoService.copyTextToClipboard(blurb);
      notify('Copied', 'Promo blurb copied — paste into Marketing email HTML.');
    } catch {
      notify('Copy for email', blurb);
    }
  };

  return (
    <ScrollView style={[s.container, { backgroundColor: c.background }]} contentContainerStyle={s.content}>
      <Text style={[s.pageTitle, { color: c.textPrimary }]}>Rewards</Text>
      <Text style={[s.pageSub, { color: c.textSecondary }]}>
        Set how customers earn points, define redeemable offers, and create marketing promo codes for checkout.
      </Text>

      {/* ── Earn Rate ─────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Earn Rate</Text>
        <Text style={[s.sectionSub, { color: c.textSecondary }]}>
          Points awarded per $1 spent. E.g. &quot;1&quot; = 1 point per dollar; &quot;0.5&quot; = 1 point per $2.
        </Text>
        <View style={s.rateRow}>
          <TextInput
            style={[s.rateInput, { color: c.textPrimary, backgroundColor: c.backgroundSunken, borderColor: c.border }]}
            value={pointsPerDollar}
            onChangeText={setPointsPerDollar}
            keyboardType="decimal-pad"
            placeholder="1"
          />
          <Text style={[s.rateUnit, { color: c.textSecondary }]}>pts / $1</Text>
          <TouchableOpacity
            style={[s.rateBtn, { backgroundColor: c.brand }, savingRate && { opacity: 0.6 }]}
            onPress={handleSaveRate}
            disabled={savingRate}
          >
            {savingRate ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.rateBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Offers ────────────────────────────────────────── */}
      <View style={[s.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={s.offersHeader}>
          <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Offers</Text>
          <TouchableOpacity
            style={[s.addBtn, { backgroundColor: c.brand }]}
            onPress={() => { setEditingOffer(null); setShowForm(true); }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>Add Offer</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.sectionSub, { color: c.textSecondary }]}>
          Customers spend points to get a one-time checkout code with the same benefit types as marketing promos.
        </Text>

        {loadingOffers ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 20 }} />
        ) : offers.length === 0 ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: c.textSecondary }]}>
              No offers yet. Add one above.
            </Text>
          </View>
        ) : (
          offers.map((offer) => (
            <View key={offer.id} style={[s.offerCard, { borderColor: c.border }]}>
              <View style={s.offerMain}>
                <View style={s.offerInfo}>
                  <Text style={[s.offerTitle, { color: c.textPrimary }]}>{offer.title}</Text>
                  {offer.description ? (
                    <Text style={[s.offerDesc, { color: c.textSecondary }]}>{offer.description}</Text>
                  ) : null}
                  <Text style={[s.offerPts, { color: c.brand }]}>{offer.points_cost} pts</Text>
                  <Text style={[s.offerDesc, { color: c.textSecondary }]}>{benefitLabel(offer)}</Text>
                </View>
                <View style={s.offerActions}>
                  <Switch
                    value={offer.is_active}
                    onValueChange={() => handleToggleActive(offer)}
                    trackColor={{ true: c.brand, false: '#ccc' }}
                  />
                  <TouchableOpacity
                    style={s.iconBtn}
                    onPress={() => { setEditingOffer(offer); setShowForm(true); }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={c.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => handleDeleteOffer(offer)}>
                    <Ionicons name="trash-outline" size={18} color="#e53e3e" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ── Marketing Promos ───────────────────────────── */}
      <View style={[s.section, { backgroundColor: c.backgroundCard, borderColor: c.border }]}>
        <View style={s.offersHeader}>
          <Text style={[s.sectionTitle, { color: c.textSecondary }]}>Marketing promos</Text>
          <TouchableOpacity
            style={[s.addBtn, { backgroundColor: c.brand }]}
            onPress={() => { setEditingPromo(null); setShowPromoForm(true); }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={s.addBtnText}>Add Promo</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.sectionSub, { color: c.textSecondary }]}>
          Checkout codes for email campaigns (separate from points offers). Copy a blurb into Marketing.
        </Text>

        {loadingPromos ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 20 }} />
        ) : promos.length === 0 ? (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: c.textSecondary }]}>
              No promo codes yet. Add one for your next email blast.
            </Text>
          </View>
        ) : (
          promos.map((promo) => (
            <View key={promo.id} style={[s.offerCard, { borderColor: c.border }]}>
              <View style={s.offerMain}>
                <View style={s.offerInfo}>
                  <Text style={[s.offerTitle, { color: c.textPrimary }]}>{promo.title}</Text>
                  <Text style={[s.promoCode, { color: c.brand }]}>{promo.code}</Text>
                  <Text style={[s.offerDesc, { color: c.textSecondary }]}>
                    {benefitLabel(promo)}
                    {promo.max_redemptions != null
                      ? ` · ${promo.redemption_count || 0}/${promo.max_redemptions} used`
                      : ` · ${promo.redemption_count || 0} used`}
                  </Text>
                </View>
                <View style={s.offerActions}>
                  <Switch
                    value={promo.is_active}
                    onValueChange={() => handleTogglePromoActive(promo)}
                    trackColor={{ true: c.brand, false: '#ccc' }}
                  />
                  <TouchableOpacity style={s.iconBtn} onPress={() => handleCopyForEmail(promo)}>
                    <Ionicons name="copy-outline" size={18} color={c.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.iconBtn}
                    onPress={() => { setEditingPromo(promo); setShowPromoForm(true); }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={c.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconBtn} onPress={() => handleDeletePromo(promo)}>
                    <Ionicons name="trash-outline" size={18} color="#e53e3e" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal
        visible={showForm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeForm}
      >
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={modalStyles.backdrop} onPress={closeForm} />
          {/* zIndex keeps the card above the absolute-fill backdrop (web click fix) */}
          <View
            style={[modalStyles.card, { backgroundColor: c.backgroundCard }]}
            // Prevent backdrop Pressable from eating Save / field presses on web
            onStartShouldSetResponder={() => true}
          >
            <View style={modalStyles.header}>
              <Text style={[modalStyles.title, { color: c.textPrimary }]}>
                {editingOffer ? 'Edit Offer' : 'New Offer'}
              </Text>
              <TouchableOpacity
                style={[modalStyles.closeBtn, { backgroundColor: c.backgroundSunken }]}
                onPress={closeForm}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={c.textPrimary} />
              </TouchableOpacity>
            </View>
            <OfferForm
              key={editingOffer?.id ?? 'new'}
              offer={editingOffer}
              brandColor={c.brand}
              menuItems={menuItems}
              onSave={handleSaveOffer}
              onCancel={closeForm}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showPromoForm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePromoForm}
      >
        <KeyboardAvoidingView
          style={modalStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={modalStyles.backdrop} onPress={closePromoForm} />
          <View
            style={[modalStyles.card, { backgroundColor: c.backgroundCard }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={modalStyles.header}>
              <Text style={[modalStyles.title, { color: c.textPrimary }]}>
                {editingPromo ? 'Edit Promo' : 'New Promo'}
              </Text>
              <TouchableOpacity
                style={[modalStyles.closeBtn, { backgroundColor: c.backgroundSunken }]}
                onPress={closePromoForm}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={c.textPrimary} />
              </TouchableOpacity>
            </View>
            <PromoForm
              key={editingPromo?.id ?? 'new-promo'}
              promo={editingPromo}
              brandColor={c.brand}
              menuItems={menuItems}
              onSave={handleSavePromo}
              onCancel={closePromoForm}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const modalStyles = StyleSheet.create({
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
    zIndex: 0,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 1,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.22)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 13 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  pageTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  pageSub: { fontSize: 13, marginBottom: 20, lineHeight: 18 },
  section: { borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sectionSub: { fontSize: 12, marginBottom: 12, lineHeight: 17 },

  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateInput: { width: 80, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  rateUnit: { fontSize: 13, flex: 1 },
  rateBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  rateBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  offersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  offerCard: { borderWidth: 1, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  offerMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, gap: 10 },
  offerInfo: { flex: 1 },
  offerTitle: { fontSize: 15, fontWeight: '700' },
  offerDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  offerPts: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  promoCode: { fontSize: 14, fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  offerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },

  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 14 },
});
