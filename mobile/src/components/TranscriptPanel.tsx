import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  FadeInUp
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { useDebouncedSpeaking } from '../hooks/useDebouncedSpeaking';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export interface FinalizedSentence {
  id: number;
  transcript: string;
  translation: string;
  timestamp: Date;
}

export interface CurrentSegment {
  id: number;
  transcript: string;
  translation: string;
  isFinal: boolean;
}

// Audio Visualizer sub-component
const WaveBar = ({ delay, isActive, color }: { delay: number; isActive: boolean; color: string }) => {
  const animValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (isActive) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1,
            duration: 300 + Math.random() * 200,
            delay,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0.3,
            duration: 300 + Math.random() * 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      Animated.timing(animValue, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isActive]);

  return (
    <Animated.View
      style={[
        styles.waveBar,
        {
          backgroundColor: color,
          transform: [{ scaleY: animValue }],
        },
      ]}
    />
  );
};

const AudioVisualizer = ({ isActive, isSpeaking, primaryColor, accentColor }: {
  isActive: boolean;
  isSpeaking: boolean;
  primaryColor: string;
  accentColor: string;
}) => {
  const bars = Array.from({ length: 5 }, (_, i) => i);
  const color = isSpeaking ? accentColor : primaryColor;

  return (
    <View style={styles.visualizerContainer}>
      {bars.map((_, index) => (
        <WaveBar
          key={index}
          delay={index * 80}
          isActive={isActive && isSpeaking}
          color={color}
        />
      ))}
    </View>
  );
};

// Animated Typing Dots component
const TypingDots = ({ color }: { color: string }) => {
  const dot1Y = useSharedValue(0);
  const dot2Y = useSharedValue(0);
  const dot3Y = useSharedValue(0);

  useEffect(() => {
    dot1Y.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ),
      -1,
      false
    );
    dot2Y.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ),
      -1,
      false
    );
    dot3Y.value = withRepeat(
      withSequence(
        withTiming(-4, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ),
      -1,
      false
    );
  }, []);

  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1Y.value }],
  }));

  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2Y.value }],
  }));

  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3Y.value }],
  }));

  // Stagger the animations
  useEffect(() => {
    setTimeout(() => {
      dot2Y.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        false
      );
    }, 200);

    setTimeout(() => {
      dot3Y.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        false
      );
    }, 400);
  }, []);

  return (
    <View style={styles.typingDotsContainer}>
      <ReAnimated.View style={[styles.typingDot, { backgroundColor: color }, dot1Style]} />
      <ReAnimated.View style={[styles.typingDot, { backgroundColor: color }, dot2Style]} />
      <ReAnimated.View style={[styles.typingDot, { backgroundColor: color }, dot3Style]} />
    </View>
  );
};

// Shimmer Loading Bars component
const ShimmerBars = ({ accentColor }: { accentColor: string }) => {
  const translateX = useSharedValue(-200);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(200, { duration: 1200 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bars = [
    { width: '85%', height: 14 },
    { width: '65%', height: 14 },
    { width: '45%', height: 14 },
  ];

  return (
    <View>
      {bars.map((bar, index) => (
        <View
          key={index}
          style={[
            styles.shimmerBar,
            {
              width: bar.width,
              height: bar.height,
              backgroundColor: accentColor + '15',
              marginBottom: index < bars.length - 1 ? 10 : 0,
            },
          ]}
        >
          <ReAnimated.View style={[styles.shimmerOverlay, animatedStyle]}>
            <LinearGradient
              colors={['transparent', accentColor + '30', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerGradient}
            />
          </ReAnimated.View>
        </View>
      ))}
    </View>
  );
};

interface TranscriptPanelProps {
  theme: Theme;
  // Which field to display: 'transcript' for source, 'translation' for target
  field: 'transcript' | 'translation';
  // Language info
  languageCode: string;
  languageName: string;
  languageFlag: string;
  // Content
  finalizedSentences: FinalizedSentence[];
  currentSegment: CurrentSegment | null;
  // Panel state
  isExpanded: boolean;
  isOtherExpanded: boolean;
  onToggleExpand: () => void;
  // Appearance
  accentColor: string;
  // Live state indicators
  isUpdating?: boolean;
  isListening?: boolean;
  isSpeaking?: boolean;
  isProcessing?: boolean;
  // Optional actions
  onClear?: () => void;
  hasContent?: boolean;
  // Empty state text
  emptyText?: string;
  emptyListeningText?: string;
  emptySpeakingText?: string;
  processingText?: string;
  // Sentence counter
  showSentenceCount?: boolean;
}

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  theme,
  field,
  languageCode,
  languageName,
  languageFlag,
  finalizedSentences,
  currentSegment,
  isExpanded,
  isOtherExpanded,
  onToggleExpand,
  accentColor,
  isUpdating = false,
  isListening = false,
  isSpeaking = false,
  isProcessing = false,
  onClear,
  hasContent: hasContentProp,
  emptyText = 'Text will appear here',
  emptyListeningText = 'Waiting for speech...',
  emptySpeakingText = 'Listening...',
  processingText = 'Processing...',
  showSentenceCount = false,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const isAtBottom = useRef(true);

  // Debounced speaking state to prevent flickering
  const displaySpeaking = useDebouncedSpeaking(isSpeaking, isListening, 500);

  // Current segment pulse animation
  const currentSegmentOpacity = useSharedValue(1);

  // Animated flex for smooth panel expansion
  const flexValue = useSharedValue(1);
  useEffect(() => {
    if (isExpanded) {
      flexValue.value = withTiming(3, { duration: 300 });
    } else if (isOtherExpanded) {
      flexValue.value = withTiming(0.5, { duration: 300 });
    } else {
      flexValue.value = withTiming(1, { duration: 300 });
    }
  }, [isExpanded, isOtherExpanded]);

  const animatedFlexStyle = useAnimatedStyle(() => ({
    flex: flexValue.value,
  }));

  const currentText = currentSegment?.[field] || '';
  const hasContent = hasContentProp ?? (finalizedSentences.length > 0 || currentText.length > 0);
  const isRtl = RTL_LANGUAGES.includes(languageCode);

  // Current segment pulse effect
  useEffect(() => {
    if (currentText) {
      currentSegmentOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      currentSegmentOpacity.value = 1;
    }
  }, [currentText]);

  // Auto-scroll when new content arrives
  useEffect(() => {
    if (isAtBottom.current && (finalizedSentences.length > 0 || currentText)) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [finalizedSentences, currentText]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    isAtBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
  }, []);

  const currentSegmentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: currentSegmentOpacity.value,
  }));

  const sentenceCount = finalizedSentences.length + (currentText ? 1 : 0);

  return (
    <ReAnimated.View style={[
      styles.panel,
      animatedFlexStyle,
      { backgroundColor: theme.colors.card, borderColor: accentColor + '30' },
    ]}>
      {/* Panel Header */}
      <View style={styles.panelHeader}>
        <View style={[styles.panelBadge, { backgroundColor: accentColor + '15' }]}>
          <Text style={styles.panelFlag}>{languageFlag}</Text>
          <Text style={[styles.panelLangName, { color: accentColor }]}>
            {languageName}
          </Text>
          {showSentenceCount && sentenceCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: accentColor + '20' }]}>
              <Text style={[styles.countText, { color: accentColor }]}>{sentenceCount}</Text>
            </View>
          )}
          {isUpdating && (
            <View style={[styles.liveDot, { backgroundColor: accentColor }]} />
          )}
        </View>
        <View style={styles.panelActions}>
          <TouchableOpacity onPress={onToggleExpand} style={styles.actionBtn}>
            <Ionicons
              name={isExpanded ? 'contract-outline' : 'expand-outline'}
              size={16}
              color={theme.colors.textTertiary}
            />
          </TouchableOpacity>
          {onClear && hasContent && (
            <TouchableOpacity onPress={onClear} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={16} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Panel Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.panelContent}
        contentContainerStyle={styles.panelContentContainer}
        showsVerticalScrollIndicator={true}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {hasContent ? (
          <View style={styles.textContainer}>
            {/* Finalized sentences */}
            {finalizedSentences.map((sentence) => (
              <ReAnimated.Text
                key={sentence.id}
                entering={FadeInUp.duration(300).springify()}
                style={[
                  styles.panelText,
                  field === 'translation' ? styles.translationText : styles.sourceText,
                  styles.finalizedText,
                  { color: theme.colors.text, textAlign: isRtl ? 'right' : 'left' },
                ]}
              >
                {sentence[field]}
              </ReAnimated.Text>
            ))}
            {/* Current segment */}
            {currentText ? (
              <ReAnimated.View style={currentSegmentAnimatedStyle}>
                <Text
                  style={[
                    styles.panelText,
                    field === 'translation' ? styles.translationText : styles.sourceText,
                    styles.currentText,
                    { color: accentColor, textAlign: isRtl ? 'right' : 'left' },
                  ]}
                >
                  {currentText}
                </Text>
                <TypingDots color={accentColor} />
              </ReAnimated.View>
            ) : null}
            {/* Processing shimmer bars */}
            {isProcessing && !currentText && (
              <ShimmerBars accentColor={accentColor} />
            )}
          </View>
        ) : (
          <View style={styles.emptyPanel}>
            {isListening && field === 'transcript' ? (
              <>
                <AudioVisualizer
                  isActive={isListening}
                  isSpeaking={displaySpeaking}
                  primaryColor={theme.colors.primary}
                  accentColor={theme.colors.accent}
                />
                <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                  {displaySpeaking ? emptySpeakingText : emptyListeningText}
                </Text>
              </>
            ) : (
              <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                {emptyText}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Scroll to bottom button */}
      {!isAtBottom.current && hasContent && (
        <TouchableOpacity
          style={[styles.scrollToBottomBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            scrollRef.current?.scrollToEnd({ animated: true });
            isAtBottom.current = true;
          }}
        >
          <Ionicons name="chevron-down" size={16} color="#FFF" />
        </TouchableOpacity>
      )}
    </ReAnimated.View>
  );
};

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  panelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 7,
  },
  panelFlag: {
    fontSize: 18,
  },
  panelLangName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 2,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
  panelContent: {
    flex: 1,
    padding: 18,
  },
  panelContentContainer: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  textContainer: {
    flex: 1,
  },
  panelText: {
    fontSize: 20,
    lineHeight: 32,
    letterSpacing: 0.2,
  },
  sourceText: {
    fontWeight: '400',
  },
  translationText: {
    fontWeight: '500',
    fontSize: 22,
    lineHeight: 34,
  },
  finalizedText: {
    marginBottom: 14,
  },
  currentText: {
    marginBottom: 8,
  },
  typingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shimmerBar: {
    borderRadius: 7,
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  shimmerGradient: {
    flex: 1,
    width: 200,
    height: '100%',
  },
  emptyPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  scrollToBottomBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: 5,
  },
  waveBar: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
});
