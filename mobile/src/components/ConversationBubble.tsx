import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

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
  isLatest?: boolean;
  animateIn?: boolean;
  flag?: string;
  onSpeak?: (text: string, lang: string) => void;
  showSpeakButton?: boolean;
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
  isLatest = false,
  animateIn = true,
  flag,
  onSpeak,
  showSpeakButton = false,
}) => {
  const fadeAnim = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animateIn ? (isOwnSpeech ? 30 : -30) : 0)).current;

  const isTranslatedRtl = RTL_LANGUAGES.includes(translatedLang);
  const isOriginalRtl = RTL_LANGUAGES.includes(originalLang);

  useEffect(() => {
    if (animateIn) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 80,
          friction: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateIn]);

  const bubbleAlignment = isOwnSpeech ? 'flex-end' : 'flex-start';
  const accentColor = speaker === 'A' ? theme.colors.primary : theme.colors.accent;

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
      {/* Clean bubble - no colored background, just subtle border */}
      <View style={[
        styles.bubble,
        {
          backgroundColor: isOwnSpeech
            ? (theme.colors.surface)
            : (theme.colors.card),
          borderLeftColor: isOwnSpeech ? 'transparent' : accentColor,
          borderLeftWidth: isOwnSpeech ? 0 : 2,
          borderRightColor: isOwnSpeech ? accentColor : 'transparent',
          borderRightWidth: isOwnSpeech ? 2 : 0,
        },
      ]}>
        {/* Main text */}
        <Text
          style={[
            styles.mainText,
            {
              color: theme.colors.text,
              textAlign: isTranslatedRtl ? 'right' : 'left',
            },
          ]}
          selectable
        >
          {translatedText}
        </Text>
        {isCurrent && <TypingDots color={accentColor} />}

        {/* Original text */}
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

        {/* Speak button */}
        {showSpeakButton && translatedText && !isCurrent && onSpeak && (
          <TouchableOpacity
            onPress={() => onSpeak(translatedText, translatedLang)}
            style={[styles.speakBtn, { alignSelf: isOwnSpeech ? 'flex-start' : 'flex-end' }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={accentColor} />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '90%',
    marginVertical: 3,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mainText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
  },
  originalText: {
    fontSize: 14,
    lineHeight: 19,
    marginTop: 5,
    fontStyle: 'italic',
  },
  speakBtn: {
    marginTop: 6,
    padding: 4,
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
