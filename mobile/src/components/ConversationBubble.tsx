import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Theme } from '../constants/theme';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

// Animated typing dots for current segment
const TypingDots = ({ color }: { color: string }) => {
  const dot1 = useRef(new Animated.Value(0.4)).current;
  const dot2 = useRef(new Animated.Value(0.4)).current;
  const dot3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const createBounce = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 300, delay, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(anim, { toValue: 0.4, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
    const a1 = createBounce(dot1, 0);
    const a2 = createBounce(dot2, 150);
    const a3 = createBounce(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.dotsContainer}>
      {[dot1, dot2, dot3].map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: color, opacity: anim, transform: [{ scale: anim }] },
          ]}
        />
      ))}
    </View>
  );
};

interface ConversationBubbleProps {
  theme: Theme;
  translatedText: string;
  originalText: string;
  translatedLang: string;
  originalLang: string;
  speaker: 'A' | 'B';
  isOwnSpeech: boolean;
  isCurrent?: boolean;
  animateIn?: boolean;
  flag?: string;
}

export const ConversationBubble: React.FC<ConversationBubbleProps> = ({
  theme,
  translatedText,
  originalText,
  translatedLang,
  originalLang,
  speaker,
  isOwnSpeech,
  isCurrent = false,
  animateIn = true,
  flag,
}) => {
  const fadeAnim = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  // Slide in from the side: own speech from right, other's from left
  const slideAnim = useRef(new Animated.Value(animateIn ? (isOwnSpeech ? 40 : -40) : 0)).current;

  const isTranslatedRtl = RTL_LANGUAGES.includes(translatedLang);
  const isOriginalRtl = RTL_LANGUAGES.includes(originalLang);

  useEffect(() => {
    if (animateIn) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateIn]);

  const bubbleAlignment = isOwnSpeech ? 'flex-end' : 'flex-start';
  const bubbleBg = isOwnSpeech
    ? theme.colors.primary + '15'
    : (speaker === 'A' ? theme.colors.accent + '15' : theme.colors.secondary + '15');
  const accentColor = isOwnSpeech
    ? theme.colors.textTertiary
    : (speaker === 'A' ? theme.colors.accent : theme.colors.secondary);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          alignSelf: bubbleAlignment,
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        },
      ]}
    >
      <View style={[
        styles.bubble,
        { backgroundColor: bubbleBg },
        isCurrent && styles.currentBubble,
      ]}>
        {/* Main translated text */}
        <Text
          style={[
            isOwnSpeech ? styles.ownMainText : styles.otherMainText,
            {
              color: isOwnSpeech ? theme.colors.textSecondary : theme.colors.text,
              textAlign: isTranslatedRtl ? 'right' : 'left',
            },
          ]}
        >
          {translatedText}
        </Text>
        {isCurrent && <TypingDots color={accentColor} />}

        {/* Original text (small, muted) */}
        {originalText && originalText !== translatedText && (
          <Text
            style={[
              styles.originalText,
              {
                color: theme.colors.textTertiary,
                textAlign: isOriginalRtl ? 'right' : 'left',
              },
            ]}
          >
            {flag ? `${flag} ` : ''}{originalText}
          </Text>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '85%',
    marginVertical: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currentBubble: {
    borderWidth: 1,
    borderColor: 'rgba(100, 100, 255, 0.15)',
  },
  otherMainText: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
  },
  ownMainText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  originalText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
