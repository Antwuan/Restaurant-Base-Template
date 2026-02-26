// Admin order card component for kitchen/staff views. Depends on React hooks,
// React Native UI primitives, `Linking` for tap-to-call, and the local
// `StatusButton` for status transitions and cancellations.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import StatusButton from './StatusButton';

const STATUS_COLORS = {
  pending: { bg: '#FFF3CD', text: '#856404', border: '#FFECB5' },
  accepted: { bg: '#CCE5FF', text: '#004085', border: '#B8D4FF' },
  preparing: { bg: '#D1ECF1', text: '#0C5460', border: '#BEE5EB' },
  ready: { bg: '#D4EDDA', text: '#155724', border: '#C3E6CB' },
  completed: { bg: '#E2E3E5', text: '#383D41', border: '#D6D8DB' },
  cancelled: { bg: '#F8D7DA', text: '#721C24', border: '#F5C6CB' },
};

const NEXT_STATUS = {
  pending: { label: 'Accept Order', next: 'accepted' },
  accepted: { label: 'Start Preparing', next: 'preparing' },
  preparing: { label: 'Mark Ready', next: 'ready' },
  ready: { label: 'Complete Order', next: 'completed' },
};

const getMinutesAgo = (createdAt) => {
  const diff = Math.floor((Date.now() - new Date(createdAt)) / 60000);
  if (diff < 1) return 'Just now';
  if (diff === 1) return '1 min ago';
  return `${diff} mins ago`;
};

const isUrgent = (createdAt, status) => {
  if (['completed', 'cancelled'].includes(status)) return false;
  const diff = Math.floor((Date.now() - new Date(createdAt)) / 60000);
  return diff > 15;
};

export default function OrderCard({ order, onStatusUpdate }) {
  const [expanded, setExpanded] = useState(order.status === 'pending');
  const [updatingStatus, setUpdatingStatus] = useState(null);

  const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.pending;
  const urgent = isUrgent(order.created_at, order.status);
  const nextAction = NEXT_STATUS[order.status];

  const handleStatusUpdate = async (newStatus) => {
    setUpdatingStatus(newStatus);
    try {
      await onStatusUpdate(order.id, newStatus);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const callCustomer = () => {
    if (!order.customer_phone) return;
    Linking.openURL(`tel:${order.customer_phone}`);
  };

  return (
    <View style={[styles.card, urgent && styles.urgentCard]}>
      {urgent && (
        <View style={styles.urgentBanner}>
          <Text style={styles.urgentText}>⚠ Waiting {getMinutesAgo(order.created_at)}</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
          <Text style={styles.timestamp}>{getMinutesAgo(order.created_at)}</Text>
        </View>
        <View style={styles.headerRight}>
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
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.customerRow}>
        <View>
          <Text style={styles.customerName}>{order.customer_name}</Text>
          {order.customer_phone ? (
            <TouchableOpacity onPress={callCustomer}>
              <Text style={styles.customerPhone}>{order.customer_phone}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.orderTypePill}>
          <Text style={styles.orderTypeText}>
            {order.order_type === 'delivery' ? '🚗 Delivery' : '🏃 Pickup'}
          </Text>
        </View>
      </View>

      {order.scheduled_time && (
        <Text style={styles.scheduledTime}>
          ⏰ Scheduled:{' '}
          {new Date(order.scheduled_time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}

      {expanded && (
        <View style={styles.itemsContainer}>
          <View style={styles.divider} />
          {(order.items || []).map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}×</Text>
              <View style={styles.itemDetails}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.special_instructions ? (
                  <Text style={styles.itemNote}>📝 {item.special_instructions}</Text>
                ) : null}
              </View>
              <Text style={styles.itemPrice}>
                ${Number(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}

          <View style={styles.totalsRow}>
            <View style={styles.divider} />
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                ${Number(order.subtotal || 0).toFixed(2)}
              </Text>
            </View>
            {order.tax > 0 && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>Tax</Text>
                <Text style={styles.totalValue}>${Number(order.tax).toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.totalLine, styles.grandTotalLine]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>
                ${Number(order.total || 0).toFixed(2)}
              </Text>
            </View>
          </View>

          {order.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Order Notes:</Text>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          ) : null}
        </View>
      )}

      {!['completed', 'cancelled'].includes(order.status) && (
        <View style={styles.actions}>
          {nextAction && (
            <StatusButton
              label={nextAction.label}
              color="#007AFF"
              loading={updatingStatus === nextAction.next}
              onPress={() => handleStatusUpdate(nextAction.next)}
              style={styles.primaryAction}
            />
          )}
          <StatusButton
            label="Cancel"
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
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  urgentCard: {
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  urgentBanner: {
    backgroundColor: '#FF6B35',
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  urgentText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 10,
    color: '#999',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  customerPhone: {
    fontSize: 13,
    color: '#007AFF',
    marginTop: 2,
  },
  orderTypePill: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  orderTypeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#555',
  },
  scheduledTime: {
    fontSize: 13,
    color: '#E6821E',
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontWeight: '500',
  },
  itemsContainer: {
    paddingHorizontal: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemQty: {
    fontSize: 14,
    fontWeight: '700',
    color: '#007AFF',
    width: 28,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  itemNote: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    fontStyle: 'italic',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  totalsRow: {
    marginTop: 4,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 13,
    color: '#888',
  },
  totalValue: {
    fontSize: 13,
    color: '#888',
  },
  grandTotalLine: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  grandTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  notesBox: {
    backgroundColor: '#FFFBF0',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: 13,
    color: '#555',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  primaryAction: {
    flex: 1,
  },
  cancelAction: {
    flex: 0,
    paddingHorizontal: 16,
  },
});

