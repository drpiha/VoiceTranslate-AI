import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated as RNAnimated,
  PanResponder,
  Dimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// Conditionally import BlurView only on iOS
let BlurView: any = null;
if (Platform.OS === 'ios') {
  try {
    BlurView = require('expo-blur').BlurView;
  } catch (e) {
    // BlurView not available
  }
}
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTranslationStore } from '../../src/store/translationStore';
import { useHistoryStore } from '../../src/store/historyStore';
import { useUserStore } from '../../src/store/userStore';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { translationService } from '../../src/services/translationService';
import { audioService } from '../../src/services/audioService';
import { getLanguageByCode } from '../../src/constants/languages';
import { useNavigationStore } from '../../src/store/navigationStore';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function TextScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback, saveHistory, colorScheme: colorSchemePref } = useSettingsStore();
  const { user } = useUserStore();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isBackendConnected, setIsBackendConnected] = useState(true);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new RNAnimated.Value(1)).current;
  const {
    sourceLanguage,
    targetLanguage,
    sourceText,
    translatedText,
    isProcessing,
    setSourceLanguage,
    setTargetLanguage,
    setSourceText,
    setTranslatedText,
    swapLanguages,
    setProcessing,
    setError,
  } = useTranslationStore();
  const { addTranslation } = useHistoryStore();

  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, colorSchemePref);

  // Animation values
  const swapRotation = useSharedValue(0);
  const translateButtonScale = useSharedValue(1);

  // Drag-to-resize text input
  const MIN_INPUT_HEIGHT = 100;
  const MAX_INPUT_HEIGHT = 350;
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const dragStartHeight = useRef(MIN_INPUT_HEIGHT);

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        dragStartHeight.current = inputHeight;
        if (hapticFeedback) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = Math.max(
          MIN_INPUT_HEIGHT,
          Math.min(MAX_INPUT_HEIGHT, dragStartHeight.current + gestureState.dy)
        );
        setInputHeight(newHeight);
      },
      onPanResponderRelease: (_, gestureState) => {
        // Snap to nearest 50px increment
        const rawHeight = Math.max(
          MIN_INPUT_HEIGHT,
          Math.min(MAX_INPUT_HEIGHT, dragStartHeight.current + gestureState.dy)
        );
        const snapped = Math.round(rawHeight / 50) * 50;
        setInputHeight(Math.max(MIN_INPUT_HEIGHT, Math.min(MAX_INPUT_HEIGHT, snapped)));
        if (hapticFeedback) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
    })
  ).current;

  // Auto-translate debounce
  const autoTranslateTimer = useRef<NodeJS.Timeout | null>(null);
  const lastTranslatedText = useRef('');

  useEffect(() => {
    if (!sourceText.trim() || sourceText.trim().length < 2) {
      if (autoTranslateTimer.current) {
        clearTimeout(autoTranslateTimer.current);
        autoTranslateTimer.current = null;
      }
      return;
    }

    // Skip if we already translated this exact text
    if (sourceText.trim() === lastTranslatedText.current) return;

    if (autoTranslateTimer.current) {
      clearTimeout(autoTranslateTimer.current);
    }

    autoTranslateTimer.current = setTimeout(() => {
      lastTranslatedText.current = sourceText.trim();
      handleAutoTranslate();
    }, 400);

    return () => {
      if (autoTranslateTimer.current) {
        clearTimeout(autoTranslateTimer.current);
      }
    };
  }, [sourceText, sourceLanguage, targetLanguage]);

  const handleAutoTranslate = async () => {
    if (!sourceText.trim() || sourceText.trim().length < 2) return;

    setProcessing(true);
    setError(null);

    try {
      const result = await translationService.translate(
        sourceText,
        sourceLanguage,
        targetLanguage
      );

      setTranslatedText(result.translatedText);
      setIsDemoMode(!translationService.isUsingBackend());

      if (saveHistory) {
        await addTranslation({
          sourceLanguage,
          targetLanguage,
          sourceText,
          translatedText: result.translatedText,
          isFavorite: false,
        });
      }
    } catch (error: any) {
      console.error('Auto-translate error:', error);
    } finally {
      setProcessing(false);
    }
  };

  // Recording animation
  useEffect(() => {
    if (isRecording) {
      const pulse = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          RNAnimated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Backend connection check
  useEffect(() => {
    setIsBackendConnected(translationService.isUsingBackend());
  }, [isDemoMode]);

  const handleHaptic = useCallback(() => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticFeedback]);

  const handleStartRecording = async () => {
    try {
      handleHaptic();
      await audioService.startRecording();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error: any) {
      console.error('Recording start error:', error);
      Alert.alert('Microphone Error', error.message || 'Could not start recording. Please check microphone permissions.');
    }
  };

  const handleStopRecording = async () => {
    try {
      handleHaptic();

      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }

      const audioUri = await audioService.stopRecording();
      setIsRecording(false);
      setRecordingDuration(0);

      if (audioUri) {
        if (!translationService.isUsingBackend()) {
          Alert.alert(
            'Offline',
            'Speech-to-text requires backend connection. Please type your text manually.',
            [{ text: 'OK' }]
          );
        } else {
          setProcessing(true);
          try {
            const result = await translationService.transcribeAudio(audioUri, sourceLanguage);
            if (result.transcript && result.transcript.trim()) {
              setSourceText(result.transcript);
              if (result.detectedLanguage && sourceLanguage === 'auto') {
                console.log('Detected language:', result.detectedLanguage);
              }
            } else {
              Alert.alert('No Speech', 'No speech was detected. Please try again.');
            }
          } catch (error: any) {
            console.error('STT error:', error);
            Alert.alert('Error', error.message || 'Speech-to-text failed. Please try again.');
          } finally {
            setProcessing(false);
          }
        }
      }
    } catch (error: any) {
      console.error('Recording stop error:', error);
      setIsRecording(false);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) {
      Alert.alert('Error', 'Please enter text to translate');
      return;
    }

    handleHaptic();
    translateButtonScale.value = withSequence(
      withSpring(0.95),
      withSpring(1)
    );
    setProcessing(true);
    setError(null);

    try {
      const result = await translationService.translate(
        sourceText,
        sourceLanguage,
        targetLanguage
      );

      setTranslatedText(result.translatedText);
      setIsDemoMode(!translationService.isUsingBackend());

      if (saveHistory) {
        await addTranslation({
          sourceLanguage,
          targetLanguage,
          sourceText,
          translatedText: result.translatedText,
          isFavorite: false,
        });
      }
    } catch (error: any) {
      console.error('Translation error:', error);
      setIsDemoMode(true);
      Alert.alert('Error', 'Failed to translate. Please try again.');
      setError(error.message || 'Translation failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleSwapLanguages = () => {
    if (sourceLanguage === 'auto') {
      Alert.alert('Cannot Swap', 'Cannot swap when source language is set to Auto Detect');
      return;
    }
    handleHaptic();
    swapRotation.value = withSpring(swapRotation.value + 180);
    swapLanguages();
  };

  const handleCopyTranslation = async () => {
    if (!translatedText) return;
    handleHaptic();
    await Clipboard.setStringAsync(translatedText);
    Alert.alert('Copied', 'Translation copied to clipboard');
  };

  const handleClearAll = () => {
    handleHaptic();
    setSourceText('');
    setTranslatedText('');
  };

  const swapAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${swapRotation.value}deg` }],
  }));

  const translateButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: translateButtonScale.value }],
  }));

  const sourceLang = getLanguageByCode(sourceLanguage);
  const targetLang = getLanguageByCode(targetLanguage);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={useNavigationStore.getState().openDrawer} style={{ padding: 4 }}>
                  <Ionicons name="menu" size={22} color={theme.colors.text} />
                </TouchableOpacity>
                <View>
                  <Text style={[styles.title, { color: theme.colors.text }]}>Text</Text>
                  <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                    Type or speak, translate instantly
                  </Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                <View style={[
                  styles.connectionBadge,
                  { backgroundColor: isBackendConnected
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)'
                  }
                ]}>
                  <View style={[
                    styles.connectionDot,
                    { backgroundColor: isBackendConnected ? theme.colors.success : theme.colors.error }
                  ]} />
                  <Text style={[
                    styles.connectionText,
                    { color: isBackendConnected ? theme.colors.success : theme.colors.error }
                  ]}>
                    {isBackendConnected ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Language Selection Card */}
            <View style={[
              styles.languageContainer,
              { backgroundColor: theme.colors.card }
            ]}>
              <View style={styles.languageContent}>
                <View style={styles.languageRow}>
                  <View style={styles.languageSelectorWrapper}>
                    <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>
                      FROM
                    </Text>
                    <LanguageSelector
                      value={sourceLanguage}
                      onChange={setSourceLanguage}
                    />
                  </View>

                  <AnimatedTouchable
                    onPress={handleSwapLanguages}
                    disabled={sourceLanguage === 'auto'}
                    style={[styles.swapButton]}
                  >
                    <View style={[styles.swapButtonGradient, { backgroundColor: theme.colors.primary }]}>
                      <Animated.View style={swapAnimatedStyle}>
                        <Ionicons name="swap-horizontal" size={22} color="#FFFFFF" />
                      </Animated.View>
                    </View>
                  </AnimatedTouchable>

                  <View style={styles.languageSelectorWrapper}>
                    <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>
                      TO
                    </Text>
                    <LanguageSelector
                      value={targetLanguage}
                      onChange={setTargetLanguage}
                      excludeAuto
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Source Text Input Card */}
            <View style={[
              styles.textCard,
              {
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.primary + (isDark ? '15' : '0F'),
              }
            ]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.flagEmoji}>{sourceLang?.flag || '🌐'}</Text>
                  <Text style={[styles.languageName, { color: theme.colors.text }]}>
                    {sourceLang?.name || 'Auto Detect'}
                  </Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  {isProcessing && (
                    <View style={styles.autoTranslateIndicator}>
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                      <Text style={[styles.autoTranslateText, { color: theme.colors.primary }]}>
                        Translating...
                      </Text>
                    </View>
                  )}
                  {sourceText.length > 0 && (
                    <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
                      <Ionicons name="close-circle" size={22} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <TextInput
                style={[styles.textInput, { color: theme.colors.text, height: inputHeight }]}
                placeholder="Type to translate instantly..."
                placeholderTextColor={theme.colors.textTertiary}
                value={sourceText}
                onChangeText={setSourceText}
                multiline
                textAlignVertical="top"
              />
              {/* Drag handle to resize */}
              <View
                {...dragPanResponder.panHandlers}
                style={styles.dragHandleContainer}
              >
                <View style={[
                  styles.dragHandle,
                  { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(71, 85, 105, 0.25)' }
                ]} />
              </View>
              <View style={styles.cardFooter}>
                <Text style={[styles.charCount, { color: theme.colors.textTertiary }]}>
                  {sourceText.length} / 5000
                </Text>
              </View>
            </View>

            {/* Action Buttons Row */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={isRecording ? handleStopRecording : handleStartRecording}
                disabled={isProcessing}
                activeOpacity={0.8}
              >
                <RNAnimated.View
                  style={[
                    styles.micButton,
                    {
                      backgroundColor: isRecording
                        ? theme.colors.error
                        : theme.colors.primary + (isDark ? '33' : '1F'),
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <Ionicons
                    name={isRecording ? 'stop' : 'mic'}
                    size={24}
                    color={isRecording ? '#FFFFFF' : theme.colors.primary}
                  />
                  {isRecording && (
                    <Text style={styles.recordingTime}>
                      {formatDuration(recordingDuration)}
                    </Text>
                  )}
                </RNAnimated.View>
              </TouchableOpacity>

              <AnimatedTouchable
                onPress={handleTranslate}
                disabled={isProcessing || !sourceText.trim()}
                style={[styles.translateButtonWrapper, translateButtonAnimatedStyle]}
                activeOpacity={0.9}
              >
                <View
                  style={[
                    styles.translateButton,
                    {
                      backgroundColor: (!sourceText.trim() || isProcessing)
                        ? (isDark ? '#4B5563' : '#94A3B8')
                        : theme.colors.primary
                    }
                  ]}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="language" size={22} color="#FFFFFF" />
                      <Text style={styles.translateButtonText}>Translate</Text>
                    </>
                  )}
                </View>
              </AnimatedTouchable>
            </View>

            {/* Translation Result Card */}
            {translatedText.length > 0 && (
              <Animated.View
                entering={FadeInDown.duration(300).springify()}
                style={[
                  styles.textCard,
                  styles.resultCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderTopWidth: 2,
                    borderTopColor: theme.colors.primary + '30',
                  }
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.flagEmoji}>{targetLang?.flag || '🌐'}</Text>
                    <Text style={[styles.languageName, { color: theme.colors.text }]}>
                      {targetLang?.name || 'Unknown'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleCopyTranslation}
                    style={[styles.copyButton, {
                      backgroundColor: theme.colors.primary + (isDark ? '26' : '1A'),
                    }]}
                  >
                    <Ionicons name="copy-outline" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.translatedText, { color: theme.colors.text }]}
                  selectable
                >
                  {translatedText}
                </Text>
              </Animated.View>
            )}

            {/* Quick Tips - Collapsible */}
            {!sourceText && !translatedText && (
              <View style={[
                styles.tipsContainer,
                { backgroundColor: theme.colors.card + (isDark ? 'CC' : 'F0') }
              ]}>
                <TouchableOpacity
                  onPress={() => setTipsExpanded(!tipsExpanded)}
                  style={styles.tipsHeader}
                  activeOpacity={0.7}
                >
                  <Ionicons name="bulb" size={18} color={theme.colors.warning} />
                  <Text style={[styles.tipsTitle, { color: theme.colors.text }]}>Quick Tips</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons
                    name={tipsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.colors.textTertiary}
                  />
                </TouchableOpacity>
                {tipsExpanded && (
                  <Animated.View entering={FadeInDown.duration(200)}>
                    <View style={styles.tipItem}>
                      <View style={[styles.tipIconContainer, { backgroundColor: theme.colors.primary + '1A' }]}>
                        <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                      </View>
                      <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>
                        Type or paste text above to translate instantly
                      </Text>
                    </View>
                    <View style={styles.tipItem}>
                      <View style={[styles.tipIconContainer, { backgroundColor: theme.colors.accent + '1A' }]}>
                        <Ionicons name="swap-horizontal" size={18} color={theme.colors.accent} />
                      </View>
                      <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>
                        Tap the swap button to switch languages
                      </Text>
                    </View>
                    <View style={styles.tipItem}>
                      <View style={[styles.tipIconContainer, { backgroundColor: theme.colors.success + '1A' }]}>
                        <Ionicons name="mic" size={18} color={theme.colors.success} />
                      </View>
                      <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>
                        Use voice input for hands-free translation
                      </Text>
                    </View>
                  </Animated.View>
                )}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  languageContainer: {
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  languageContent: {
    padding: 16,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageSelectorWrapper: {
    flex: 1,
  },
  languageLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 1,
  },
  swapButton: {
    marginHorizontal: 12,
    marginTop: 20,
  },
  swapButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  textCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    minHeight: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  resultCard: {
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoTranslateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoTranslateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  flagEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 100,
  },
  dragHandleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  cardFooter: {
    marginTop: 4,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  micButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  recordingTime: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  translateButtonWrapper: {
    flex: 1,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  translateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  translatedText: {
    fontSize: 16,
    lineHeight: 26,
  },
  copyButton: {
    padding: 8,
    borderRadius: 10,
  },
  tipsContainer: {
    borderRadius: 16,
    padding: 14,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 10,
  },
  tipIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  tipText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
