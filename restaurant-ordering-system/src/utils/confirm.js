import { showConfirmModal } from '../components/ConfirmModal';

/**
 * Cross-platform confirmation dialog.
 * Uses the GlobalConfirmModal (fade, menu-popup style) on all platforms when
 * it is mounted (see App.js). Falls back to window.confirm on web only when
 * GlobalConfirmModal is not mounted — never while the modal owns the UX.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.confirmText='Confirm']
 * @param {boolean} [options.destructive=false] — red confirm button when true
 * @returns {Promise<boolean>} Resolves true if the user confirmed, false if cancelled.
 */
export function confirmAsync({
  title,
  message,
  confirmText = 'Confirm',
  destructive = false,
}) {
  return showConfirmModal({ title, message, confirmText, destructive });
}
