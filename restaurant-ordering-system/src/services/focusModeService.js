import { updateRestaurant } from './restaurantService';
import { hashFocusPin, isValidFocusPin, verifyFocusPinHash } from '../utils/focusModeHash';

/**
 * Enable Focus Mode with selected sidebar tabs and a confirmed 4-digit PIN.
 * @param {string} restaurantId
 * @param {{ allowedTabs: string[], pin: string, confirmPin: string }} opts
 */
export async function enableFocusMode(restaurantId, { allowedTabs, pin, confirmPin }) {
  if (!restaurantId) throw new Error('Restaurant id is required.');
  const tabs = Array.isArray(allowedTabs)
    ? [...new Set(allowedTabs.filter((t) => typeof t === 'string' && t.trim()))]
    : [];
  if (tabs.length === 0) {
    throw new Error('Select at least one tab that stays visible in Focus Mode.');
  }
  if (!isValidFocusPin(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }
  if (pin !== confirmPin) {
    throw new Error('PIN confirmation does not match.');
  }

  const focus_pin_hash = await hashFocusPin(restaurantId, pin);
  return updateRestaurant(restaurantId, {
    focus_mode_enabled: true,
    focus_pin_hash,
    focus_mode_allowed_tabs: tabs,
  });
}

/** Disable Focus Mode and clear the stored PIN hash. */
export async function disableFocusMode(restaurantId) {
  if (!restaurantId) throw new Error('Restaurant id is required.');
  return updateRestaurant(restaurantId, {
    focus_mode_enabled: false,
    focus_pin_hash: null,
    focus_mode_allowed_tabs: [],
  });
}

export async function verifyFocusPin(restaurantId, pin, storedHash) {
  if (!isValidFocusPin(pin)) return false;
  return verifyFocusPinHash(restaurantId, pin, storedHash);
}
