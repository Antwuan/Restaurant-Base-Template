import { showConfirmModal } from '../components/ConfirmModal';

/**
 * Cross-platform confirmation dialog.
 * Uses the GlobalConfirmModal (fade, menu-popup style) on all platforms when
 * it is mounted (see App.js). Falls back to window.confirm on web.
 *
 * @returns {Promise<boolean>} Resolves true if the user confirmed, false if cancelled.
 */
export function confirmAsync({ title, message, confirmText = 'Confirm' }) {
  return showConfirmModal({ title, message, confirmText });
}
