// Reusable status/action button with built-in async loading state, success/error
// feedback, and optional confirmation via React Native's `Alert`. Intended to be
// composed into admin components like `OrderCard` and other action rows.
import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { confirmAsync } from '../../utils/confirm';

export default function StatusButton({
  label,
  color = '#007AFF',
  loading = false,
  onPress,
  requireConfirmation = false,
  confirmMessage,
  confirmTitle = 'Are you sure?',
  style,
  textStyle,
  disabled = false,
}) {
  const [localLoading, setLocalLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  const isLoading = loading || localLoading;
  const isDisabled = disabled || isLoading;

  const executeAction = async () => {
    setLocalLoading(true);
    setSuccess(false);
    setError(false);
    try {
      await onPress();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1500);
    } catch (e) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    } finally {
      setLocalLoading(false);
    }
  };

  const handlePress = async () => {
    if (isDisabled) return;

    if (requireConfirmation) {
      const confirmed = await confirmAsync({
        title: confirmTitle,
        message: confirmMessage || `${label}?`,
        confirmText: 'Confirm',
      });
      if (confirmed) executeAction();
    } else {
      executeAction();
    }
  };

  const getButtonColor = () => {
    if (success) return '#28A745';
    if (error) return '#DC3545';
    if (isDisabled) return '#CCC';
    return color;
  };

  const getLabel = () => {
    if (success) return '✓ Done';
    if (error) return '✗ Failed';
    return label;
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: getButtonColor() },
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.75}
    >
      {isLoading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.label, textStyle]}>{getLabel()}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

