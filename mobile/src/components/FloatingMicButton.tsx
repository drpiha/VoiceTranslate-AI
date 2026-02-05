import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { useDebouncedSpeaking } from '../hooks/useDebouncedSpeaking';

// Ripple ring animation
const RippleRing = ({ isActive, size, color, delay }: { isActive: boolean; size: number; color: string; delay: number }) => {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 1.8, duration: 1500, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
            Animated.sequence([
              Animated.timing(opacityAnim, { toValue: 0.4, duration: 200, useNativeDriver: true }),
              Animated.timing(opacityAnim, { toValue: 0, duration: 1300, useNativeDriver: true }),
            ]),
          ]),
          Animated.timing(scaleAnim, { toValue: 0.8, duration: 0, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [isActive]);

  return (
    <Animated.View
      style={[
        styles.rippleRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    />
  );
};

interface FloatingMicButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  onPress: () => void;
  theme: Theme;
  label?: string;
  speakingLabel?: string;
  listeningLabel?: string;
  idleLabel?: string;
  size?: number;
  iconSize?: number;
}

export const FloatingMicButton: React.FC<FloatingMicButtonProps> = ({
  isListening,
  isSpeaking,
  onPress,
  theme,
  idleLabel = 'Tap to start',
  size = 72,
  iconSize = 30,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const displaySpeaking = useDebouncedSpeaking(isSpeaking, isListening, 500);

  // Subtle breathing when listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Glow intensity based on speaking
  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: displaySpeaking ? 1 : (isListening ? 0.3 : 0),
      duration: 300,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.ease),
    }).start();
  }, [displaySpeaking, isListening]);

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(buttonScaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = () => {
    animatePress();
    onPress();
  };

  const buttonColor = isListening ? theme.colors.error : theme.colors.primary;
  const glowColor = isListening
    ? (displaySpeaking ? theme.colors.accent : theme.colors.error)
    : theme.colors.primary;

  return (
    <View style={styles.container}>
      {/* Ripple rings when listening */}
      {isListening && (
        <>
          <RippleRing isActive={displaySpeaking} size={size * 1.5} color={glowColor} delay={0} />
          <RippleRing isActive={displaySpeaking} size={size * 1.5} color={glowColor} delay={500} />
          <RippleRing isActive={displaySpeaking} size={size * 1.5} color={glowColor} delay={1000} />
        </>
      )}

      {/* Glow backdrop */}
      <Animated.View
        style={[
          styles.glowBackdrop,
          {
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: size * 0.8,
            backgroundColor: glowColor,
            opacity: Animated.multiply(glowAnim, 0.25),
          },
        ]}
      />

      <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={styles.touchable}>
        <Animated.View
          style={{
            transform: [
              { scale: Animated.multiply(pulseAnim, buttonScaleAnim) },
            ],
          }}
        >
          {/* Glassmorphic outer ring */}
          <View style={[styles.glassRing, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2 }]}>
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[styles.glassRingBorder, { borderColor: buttonColor + '30' }]} />
          </View>

          {/* Main button */}
          <View
            style={[
              styles.button,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: buttonColor,
                shadowColor: buttonColor,
              },
            ]}
          >
            <Ionicons
              name={isListening ? 'stop' : 'mic'}
              size={iconSize}
              color="#FFF"
            />
          </View>
        </Animated.View>
      </TouchableOpacity>

      {/* Status text */}
      <View style={styles.statusContainer}>
        {isListening ? (
          <View style={styles.statusRow}>
            <View style={[styles.recordingDot, { backgroundColor: displaySpeaking ? theme.colors.accent : theme.colors.error }]} />
            <Text style={[styles.statusText, { color: theme.colors.text }]}>
              {displaySpeaking ? 'Listening...' : 'Tap to stop'}
            </Text>
          </View>
        ) : (
          <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
            {idleLabel}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
  },
  rippleRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  glowBackdrop: {
    position: 'absolute',
  },
  touchable: {
    zIndex: 10,
  },
  glassRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    overflow: 'hidden',
  },
  glassRingBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  statusContainer: {
    marginTop: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
