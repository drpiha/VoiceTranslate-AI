import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { useDebouncedSpeaking } from '../hooks/useDebouncedSpeaking';

// Subtle Glow Orb
const GlowOrb = ({ isActive, size, color, opacity }: { isActive: boolean; size: number; color: string; opacity: number }) => {
  const glowAnim = useRef(new Animated.Value(opacity * 0.6)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      const glowAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: opacity, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: opacity * 0.5, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      const scaleAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.05, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      glowAnimation.start();
      scaleAnimation.start();
      return () => { glowAnimation.stop(); scaleAnimation.stop(); };
    } else {
      glowAnim.setValue(0);
      scaleAnim.setValue(1);
    }
  }, [isActive]);

  return (
    <Animated.View
      style={[
        styles.glowOrb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: glowAnim,
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
  const dotColorAnim = useRef(new Animated.Value(0)).current;
  const floatingAnim = useRef(new Animated.Value(0)).current;

  const displaySpeaking = useDebouncedSpeaking(isSpeaking, isListening, 500);

  // Calmer pulse when listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Gentle floating when idle
  useEffect(() => {
    if (!isListening) {
      const floating = Animated.loop(
        Animated.sequence([
          Animated.timing(floatingAnim, { toValue: 1, duration: 2500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(floatingAnim, { toValue: 0, duration: 2500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      floating.start();
      return () => floating.stop();
    } else {
      floatingAnim.setValue(0);
    }
  }, [isListening]);

  useEffect(() => {
    Animated.timing(dotColorAnim, {
      toValue: displaySpeaking ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
      easing: Easing.inOut(Easing.ease),
    }).start();
  }, [displaySpeaking]);

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

  const dotColor = dotColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.primary, theme.colors.accent],
  });

  const floatingY = floatingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-3, 3],
  });

  return (
    <View style={styles.container}>
      {isListening && (
        <View>
          <GlowOrb isActive={true} size={size * 1.6} color={theme.colors.glow} opacity={0.15} />
          <GlowOrb isActive={true} size={size * 2.4} color={theme.colors.glowAccent} opacity={0.08} />
        </View>
      )}

      <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={styles.touchable}>
        <Animated.View
          style={{
            transform: [
              { scale: Animated.multiply(pulseAnim, buttonScaleAnim) },
              { translateY: isListening ? 0 : floatingY },
            ],
          }}
        >
          <View
            style={[
              styles.button,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: isListening ? theme.colors.error : theme.colors.primary,
                shadowColor: isListening ? theme.colors.error : theme.colors.primary,
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

      <View style={styles.statusContainer}>
        {isListening ? (
          <View style={styles.statusRow}>
            <Animated.View
              style={[
                styles.recordingDot,
                { backgroundColor: dotColor, shadowColor: dotColor },
              ]}
            />
            <Text style={[styles.statusText, { color: theme.colors.text }]}>
              Tap to stop
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
  glowOrb: {
    position: 'absolute',
  },
  touchable: {
    zIndex: 10,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  statusContainer: {
    marginTop: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowRadius: 4,
    shadowOpacity: 0.4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
