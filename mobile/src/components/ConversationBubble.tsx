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
  const slideAnim = useRef(new Animated.Value(animateIn ? (speaker === 'A' ? 40 : -40) : 0)).current;
  const scaleAnim = useRef(new Animated.Value(animateIn ? 0.95 : 1)).current;

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
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateIn]);

  // Speaker A: RIGHT aligned, teal background, white text
  // Speaker B: LEFT aligned, gray background, normal text
  const bubbleAlignment = speaker === 'A' ? 'flex-end' : 'flex-start';
  const backgroundColor = speaker === 'A'
    ? '#0D9488' // Teal/emerald for Speaker A
    : (theme.colors.text === '#F1F5F9' ? '#2A3441' : '#F1F5F9'); // Dark or light gray for Speaker B
  const textColor = speaker === 'A' ? '#FFFFFF' : theme.colors.text;
  const originalTextColor = speaker === 'A' ? 'rgba(255, 255, 255, 0.5)' : theme.colors.textTertiary;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          alignSelf: bubbleAlignment,
          opacity: fadeAnim,
          transform: [
            { translateX: slideAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <View style={[
        styles.bubble,
        {
          backgroundColor,
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 14,
        },
      ]}>
        {/* Main translation text - LARGE and BOLD */}
        <Text
          style={[
            styles.mainText,
            {
              color: textColor,
              textAlign: isTranslatedRtl ? 'right' : 'left',
              fontSize: 20,
              fontWeight: '700',
              lineHeight: 28,
              letterSpacing: -0.2,
            },
          ]}
          selectable
        >
          {translatedText}
        </Text>
        {isCurrent && <TypingDots color={speaker === 'A' ? '#FFFFFF' : theme.colors.primary} />}

        {/* Original text - smaller, 50% opacity */}
        {originalText && originalText !== translatedText && (
          <Text
            style={[
              styles.originalText,
              {
                color: originalTextColor,
                textAlign: isOriginalRtl ? 'right' : 'left',
                fontSize: 13,
                lineHeight: 18,
                marginTop: 6,
                opacity: 0.5,
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
            style={[
              styles.speakBtn,
              {
                alignSelf: speaker === 'A' ? 'flex-start' : 'flex-end',
                marginTop: 8,
              },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={[
              styles.speakBtnInner,
              {
                backgroundColor: speaker === 'A' ? 'rgba(255, 255, 255, 0.15)' : theme.colors.primary + '10',
              },
            ]}>
              <Ionicons
                name="volume-medium"
                size={16}
                color={speaker === 'A' ? '#FFFFFF' : theme.colors.primary}
              />
            </View>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    maxWidth: '85%',
    marginVertical: 5,
  },
  bubble: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  mainText: {
    // Styles applied inline for premium typography
  },
  originalText: {
    // Styles applied inline for consistency
  },
  speakBtn: {
    padding: 2,
  },
  speakBtnInner: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
