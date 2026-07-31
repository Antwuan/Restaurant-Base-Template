import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import StatusButton from './StatusButton';

const STATUS_COLORS = {
  pending:   { bg: '#FFF3CD', text: '#856404', border: '#FFECB5' },
  accepted:  { bg: '#CCE5FF', text: '#004085', border: '#B8D4FF' },
  preparing: { bg: '#D1ECF1', text: '#0C5460', border: '#BEE5EB' },
  ready:     { bg: '#D4EDDA', text: '#155724', border: '#C3E6CB' },
  completed: { bg: '#E2E3E5', text: '#383D41', border: '#D6D8DB' },
  cancelled: { bg: '#F8D7DA', text: '#721C24', border: '#F5C6CB' },
};

// pending → preparing → ready → completed
const NEXT_STATUS = {
  pending:   { label: 'Accept Order', next: 'preparing' },
  preparing: { label: 'Mark Ready',   next: 'ready' },
  ready:     { label: 'Complete',     next: 'completed' },
};

const URGENCY_THRESHOLD_MS = 15 * 60 * 1000;
const SHOW_TIMER_STATUSES = ['pending', 'accepted', 'preparing', 'ready'];

function useElapsedTimer(createdAt, active) {
  const [elapsed, setElapsed] = useState(Date.now() - new Date(createdAt).getTime());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setElapsed(Date.now() - new Date(createdAt).getTime());
    }, 1000);
    return () => clearInterval(id);
  }, [createdAt, active]);

  return elapsed;
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function OrderCard({ order, onStatusUpdate }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});

  const showTimer =
    order.menu_type !== 'catering' && SHOW_TIMER_STATUSES.includes(order.status);
  const elapsed = useElapsedTimer(order.created_at, showTimer);
  const isUrgent = showTimer && elapsed >= URGENCY_THRESHOLD_MS;

  const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
  const nextAction = NEXT_STATUS[order.status];
  const isPreparing = order.status === 'preparing';

  const items = order.items || [];
  const allChecked = items.length > 0 && items.every((_, i) => checkedItems[i]);

  const toggleItem = useCallback((idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const handleStatusUpdate = async (newStatus) => {
    setUpdatingStatus(newStatus);
    try {
      await onStatusUpdate(order.id, newStatus);
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.backgroundCard },
        isUrgent && styles.urgentCard,
      ]}
    >
      {isUrgent && (
        <View style={styles.urgentBanner}>
          <Text style={styles.urgentText}>⚠ {formatElapsed(elapsed)}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.orderNumber, { color: c.textPrimary }]}>
            {order.order_number}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
            ]}
          >
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </Text>
          </View>
        </View>

        {showTimer && (
          <Text
            style={[
              styles.timer,
              { color: c.textPrimary },
              isUrgent && styles.timerUrgent,
            ]}
          >
            {formatElapsed(elapsed)}
          </Text>
        )}
      </View>

      {/* Customer info */}
      <View style={styles.customerRow}>
        <Text
          style={[styles.customerName, { color: c.textPrimary }]}
          numberOfLines={1}
        >
          {order.customer_name}
        </Text>
        <View style={[styles.orderTypePill, { backgroundColor: c.backgroundSunken }]}>
          <Text style={styles.orderTypeText}>
            {order.order_type === 'delivery' ? '🚗' : '🏃'}
          </Text>
        </View>
      </View>

      {order.customer_phone ? (
        <Text style={[styles.customerPhone, { color: c.textSecondary }]}>
          {order.customer_phone}
        </Text>
      ) : null}

      {order.scheduled_time && (
        <Text style={styles.scheduledTime}>
          ⏰{' '}
          {new Date(order.scheduled_time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}

      {/* Items — always visible */}
      <View style={styles.itemsContainer}>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        {items.map((item, idx) => {
          const checked = !!checkedItems[idx];
          return (
            <TouchableOpacity
              key={idx}
              style={styles.itemRow}
              onPress={isPreparing ? () => toggleItem(idx) : undefined}
              activeOpacity={isPreparing ? 0.6 : 1}
            >
              {isPreparing && (
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: c.borderStrong },
                    checked && styles.checkboxChecked,
                  ]}
                >
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
              )}
              <Text style={[styles.itemQty, { color: c.brand }]}>{item.quantity}×</Text>
              <View style={styles.itemDetails}>
                <Text
                  style={[
                    styles.itemName,
                    { color: c.textPrimary },
                    checked && { color: c.textDisabled, textDecorationLine: 'line-through' },
                  ]}
                >
                  {item.name}
                </Text>
                {item.special_instructions ? (
                  <Text style={[styles.itemNote, { color: c.textSecondary }]}>
                    📝 {item.special_instructions}
                  </Text>
                ) : null}
                {Array.isArray(item.selected_modifiers) && item.selected_modifiers.length > 0 ? (
                  <Text style={[styles.itemNote, { color: c.textSecondary }]}>
                    {item.selected_modifiers.map((m) => m.optionName || m.option_name).join(', ')}
                  </Text>
                ) : Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0 ? (
                  <Text style={[styles.itemNote, { color: c.textSecondary }]}>
                    {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}

        {order.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Action buttons */}
      {!['completed', 'cancelled'].includes(order.status) && (
        <View style={[styles.actions, { borderTopColor: c.border }]}>
          {nextAction && (
            <StatusButton
              label={nextAction.label}
              color={isPreparing ? (allChecked ? '#34C759' : '#aaa') : c.brand}
              loading={updatingStatus === nextAction.next}
              onPress={() => handleStatusUpdate(nextAction.next)}
              disabled={isPreparing && !allChecked}
              style={styles.primaryAction}
            />
          )}
          <StatusButton
            label="✕"
            color="#DC3545"
            loading={updatingStatus === 'cancelled'}
            onPress={() => handleStatusUpdate('cancelled')}
            requireConfirmation
            confirmMessage={`Cancel order ${order.order_number}?`}
            style={styles.cancelAction}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  urgentCard: {
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  urgentBanner: {
    backgroundColor: '#FF6B35',
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  urgentText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  timer: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  timerUrgent: {
    color: '#FF6B35',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  customerName: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  orderTypePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
  },
  orderTypeText: {
    fontSize: 12,
  },
  customerPhone: {
    fontSize: 11,
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  scheduledTime: {
    fontSize: 11,
    color: '#E6821E',
    paddingHorizontal: 10,
    paddingBottom: 2,
    fontWeight: '500',
  },
  itemsContainer: {
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  divider: {
    height: 1,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 7,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  checkmark: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  itemQty: {
    fontSize: 12,
    fontWeight: '700',
    width: 24,
    flexShrink: 0,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '500',
  },
  itemNote: {
    fontSize: 11,
    marginTop: 1,
    fontStyle: 'italic',
  },
  notesBox: {
    backgroundColor: '#FFFBF0',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: 12,
    color: '#555',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
    borderTopWidth: 1,
  },
  primaryAction: {
    flex: 1,
  },
  cancelAction: {
    flex: 0,
    paddingHorizontal: 12,
  },
});
