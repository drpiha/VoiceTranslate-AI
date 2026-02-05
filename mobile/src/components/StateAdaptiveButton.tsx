import React from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export type STTScreenState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'has_transcript'
  | 'translating'
  | 'has_translation';

interface StateAdaptiveButtonProps {
  state: STTScreenState;
  onPress: () => void;
  primaryColor: string;
  errorColor: string;
  disabled?: boolean;
}

const STATE_CONFIG: Record<STTScreenState, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  useErrorColor: boolean;
}> = {
  idle: { label: 'Record', icon: 'mic', useErrorColor: false },
  recording: { label: 'Stop Recording', icon: 'stop', useErrorColor: true },
  processing: { label: 'Processing...', icon: 'hourglass-outline', useErrorColor: false },
  has_transcript: { label: 'Translate', icon: 'language', useErrorColor: false },
  translating: { label: 'Translating...', icon: 'language', useErrorColor: false },
  has_translation: { label: 'New Recording', icon: 'refresh', useErrorColor: false },
};

export const StateAdaptiveButton: React.FC<StateAdaptiveButtonProps> = ({
  state,
  onPress,
  primaryColor,
  errorColor,
  disabled = false,
}) => {
  const config = STATE_CONFIG[state];
  const isLoading = state === 'processing' || state === 'translating';
  const bgColor = config.useErrorColor ? errorColor : primaryColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
      style={[
        styles.button,
        { backgroundColor: bgColor, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Animated.View
        key={state}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(100)}
        style={styles.content}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name={config.icon} size={22} color="#FFFFFF" />
        )}
        <Text style={styles.label}>{config.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
