import React, { useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { useDebouncedSpeaking } from '../hooks/useDebouncedSpeaking';

// Glowing Orb Animation
const GlowingOrb = ({ isActive, size, color }: { isActive: boolean; size: number; color: string }) => {
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      const glowAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.5,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      const scaleAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      glowAnimation.start();
      scaleAnimation.start();
      return () => {
        glowAnimation.stop();
        scaleAnimation.stop();
      };
    } else {
      glowAnim.setValue(0.5);
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

  // Debounce the speaking state to prevent rapid flickering
  const displaySpeaking = useDebouncedSpeaking(isSpeaking, isListening, 500);

  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Smooth animated dot color transition
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
      Animated.timing(buttonScaleAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
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

  return (
    <View style={styles.container}>
      {isListening && (
        <>
          <GlowingOrb isActive={true} size={size * 1.94} color={theme.colors.glow} />
          <GlowingOrb isActive={true} size={size * 2.5} color={theme.colors.glowAccent} />
        </>
      )}

      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        style={styles.touchable}
      >
        <Animated.View style={{ transform: [{ scale: Animated.multiply(pulseAnim, buttonScaleAnim) }] }}>
          <LinearGradient
            colors={isListening
              ? [theme.colors.error, theme.colors.errorLight] as [string, string]
              : [theme.colors.gradient1, theme.colors.gradient2] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
          >
            <Ionicons
              name={isListening ? 'stop' : 'mic'}
              size={iconSize}
              color="#FFF"
            />
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>

      <View style={styles.statusContainer}>
        {isListening ? (
          <View style={styles.statusRow}>
            <Animated.View style={[styles.recordingDot, { backgroundColor: dotColor }]} />
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
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
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
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
