import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../constants/theme';

interface ConversationEmptyStateProps {
  theme: Theme;
  mode: 'chat' | 'face-to-face';
}

export const ConversationEmptyState: React.FC<ConversationEmptyStateProps> = ({
  theme,
  mode,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
        <LinearGradient
          colors={[theme.colors.primary + '15', theme.colors.primary + '05']}
          style={styles.iconGradient}
        >
          <Ionicons
            name="chatbubbles"
            size={mode === 'face-to-face' ? 40 : 56}
            color={theme.colors.primary}
          />
        </LinearGradient>
      </Animated.View>

      <Text style={[styles.title, { color: theme.colors.text }]}>
        {mode === 'face-to-face' ? 'Ready to converse' : 'Start a conversation'}
      </Text>

      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {mode === 'face-to-face'
          ? 'Tap your speak button below to begin'
          : 'Select a speaker and press their button to start translating'}
      </Text>

      <View style={styles.features}>
        <View style={styles.feature}>
          <View style={[styles.featureDot, { backgroundColor: theme.colors.success }]} />
          <Text style={[styles.featureText, { color: theme.colors.textTertiary }]}>
            Real-time translation
          </Text>
        </View>
        <View style={styles.feature}>
          <View style={[styles.featureDot, { backgroundColor: theme.colors.primary }]} />
          <Text style={[styles.featureText, { color: theme.colors.textTertiary }]}>
            Voice recognition
          </Text>
        </View>
        <View style={styles.feature}>
          <View style={[styles.featureDot, { backgroundColor: theme.colors.accent }]} />
          <Text style={[styles.featureText, { color: theme.colors.textTertiary }]}>
            Text-to-speech
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconGradient: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 28,
  },
  features: {
    gap: 10,
    alignSelf: 'stretch',
    maxWidth: 280,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  featureText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
