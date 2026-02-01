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

interface ConversationBubbleProps {
  theme: Theme;
  // The text the other person said, translated into this person's language (prominent)
  translatedText: string;
  // The original text as spoken (small, muted)
  originalText: string;
  // Language codes for alignment
  translatedLang: string;
  originalLang: string;
  // Which speaker said it
  speaker: 'A' | 'B';
  // Is this the viewing person's own speech?
  isOwnSpeech: boolean;
  // Is this the currently active (non-final) segment?
  isCurrent?: boolean;
  // Animate entrance
  animateIn?: boolean;
  // Flag emoji for the language
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
  const slideAnim = useRef(new Animated.Value(animateIn ? 20 : 0)).current;

  const isTranslatedRtl = RTL_LANGUAGES.includes(translatedLang);
  const isOriginalRtl = RTL_LANGUAGES.includes(originalLang);

  useEffect(() => {
    if (animateIn) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateIn]);

  // Own speech: right-aligned, muted
  // Other's speech: left-aligned, prominent
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
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
        {/* Main translated text (prominent for other's speech, muted for own) */}
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
          {isCurrent && <Text style={styles.typingIndicator}> ●</Text>}
        </Text>

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
  typingIndicator: {
    fontSize: 10,
    opacity: 0.6,
  },
});
