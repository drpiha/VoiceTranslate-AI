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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function TextScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback, saveHistory } = useSettingsStore();
  const { user } = useUserStore();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
  const theme = createTheme(isDark);

  // Animation values
  const swapRotation = useSharedValue(0);
  const translateButtonScale = useSharedValue(1);

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

  const bgGradientColors = isDark
    ? ['#0F0F1A', '#1A1A2E', '#16162A'] as const
    : ['#F8FAFC', '#EEF2FF', '#E0E7FF'] as const;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={bgGradientColors}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.orbContainer}>
        <LinearGradient
          colors={isDark
            ? ['rgba(99, 102, 241, 0.15)', 'transparent']
            : ['rgba(99, 102, 241, 0.1)', 'transparent']
          }
          style={[styles.orb, styles.orb1]}
        />
        <LinearGradient
          colors={isDark
            ? ['rgba(236, 72, 153, 0.12)', 'transparent']
            : ['rgba(236, 72, 153, 0.08)', 'transparent']
          }
          style={[styles.orb, styles.orb2]}
        />
      </View>

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
              <View>
                <Text style={[styles.title, { color: theme.colors.text }]}>Text</Text>
                <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                  Type or speak, translate instantly
                </Text>
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
                    { backgroundColor: isBackendConnected ? '#22C55E' : '#EF4444' }
                  ]} />
                  <Text style={[
                    styles.connectionText,
                    { color: isBackendConnected ? '#22C55E' : '#EF4444' }
                  ]}>
                    {isBackendConnected ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Language Selection Card */}
            <View style={[
              styles.languageContainer,
              { backgroundColor: isDark ? 'rgba(26, 26, 46, 0.8)' : 'rgba(255, 255, 255, 0.9)' }
            ]}>
              {Platform.OS === 'ios' && BlurView && (
                <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              )}
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
                    <LinearGradient
                      colors={['#6366F1', '#8B5CF6']}
                      style={styles.swapButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Animated.View style={swapAnimatedStyle}>
                        <Ionicons name="swap-horizontal" size={22} color="#FFFFFF" />
                      </Animated.View>
                    </LinearGradient>
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
              { backgroundColor: isDark ? 'rgba(26, 26, 46, 0.8)' : 'rgba(255, 255, 255, 0.95)' }
            ]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.flagEmoji}>{sourceLang?.flag || '🌐'}</Text>
                  <Text style={[styles.languageName, { color: theme.colors.text }]}>
                    {sourceLang?.name || 'Auto Detect'}
                  </Text>
                </View>
                {sourceText.length > 0 && (
                  <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
                    <Ionicons name="close-circle" size={22} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.textInput, { color: theme.colors.text }]}
                placeholder="Enter text to translate..."
                placeholderTextColor={theme.colors.textTertiary}
                value={sourceText}
                onChangeText={setSourceText}
                multiline
                textAlignVertical="top"
              />
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
                        ? '#EF4444'
                        : isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.15)',
                      transform: [{ scale: pulseAnim }],
                    },
                  ]}
                >
                  <Ionicons
                    name={isRecording ? 'stop' : 'mic'}
                    size={26}
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
                <LinearGradient
                  colors={
                    (!sourceText.trim() || isProcessing)
                      ? ['#94A3B8', '#64748B']
                      : ['#6366F1', '#EC4899']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.translateButton}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="language" size={22} color="#FFFFFF" />
                      <Text style={styles.translateButtonText}>Translate</Text>
                    </>
                  )}
                </LinearGradient>
              </AnimatedTouchable>
            </View>

            {/* Translation Result Card */}
            {translatedText.length > 0 && (
              <View style={[
                styles.textCard,
                styles.resultCard,
                {
                  backgroundColor: isDark ? 'rgba(26, 26, 46, 0.9)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.3)',
                }
              ]}>
                <LinearGradient
                  colors={isDark
                    ? ['rgba(99, 102, 241, 0.1)', 'transparent']
                    : ['rgba(99, 102, 241, 0.05)', 'transparent']
                  }
                  style={styles.resultGradient}
                />
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.flagEmoji}>{targetLang?.flag || '🌐'}</Text>
                    <Text style={[styles.languageName, { color: theme.colors.text }]}>
                      {targetLang?.name || 'Unknown'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleCopyTranslation} style={styles.copyButton}>
                    <Ionicons name="copy-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.translatedText, { color: theme.colors.text }]}>
                  {translatedText}
                </Text>
              </View>
            )}

            {/* Quick Tips */}
            {!sourceText && !translatedText && (
              <View style={[
                styles.tipsContainer,
                { backgroundColor: isDark ? 'rgba(26, 26, 46, 0.6)' : 'rgba(255, 255, 255, 0.8)' }
              ]}>
                <View style={styles.tipsHeader}>
                  <Ionicons name="bulb" size={22} color="#F59E0B" />
                  <Text style={[styles.tipsTitle, { color: theme.colors.text }]}>Quick Tips</Text>
                </View>
                <View style={styles.tipItem}>
                  <View style={[styles.tipIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
                    <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>
                    Type or paste text above to translate instantly
                  </Text>
                </View>
                <View style={styles.tipItem}>
                  <View style={[styles.tipIconContainer, { backgroundColor: 'rgba(236, 72, 153, 0.1)' }]}>
                    <Ionicons name="swap-horizontal" size={18} color="#EC4899" />
                  </View>
                  <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>
                    Tap the swap button to switch languages
                  </Text>
                </View>
                <View style={styles.tipItem}>
                  <View style={[styles.tipIconContainer, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                    <Ionicons name="mic" size={18} color="#22C55E" />
                  </View>
                  <Text style={[styles.tipText, { color: theme.colors.textSecondary }]}>
                    Use voice input for hands-free translation
                  </Text>
                </View>
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
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: 300,
    height: 300,
    top: -100,
    right: -100,
  },
  orb2: {
    width: 250,
    height: 250,
    bottom: 100,
    left: -80,
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
    fontSize: 32,
    fontWeight: '800',
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
    shadowColor: '#6366F1',
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
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  resultGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
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
  flagEmoji: {
    fontSize: 24,
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
  cardFooter: {
    marginTop: 8,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  micButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
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
    borderRadius: 8,
  },
  tipsContainer: {
    borderRadius: 20,
    padding: 20,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
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
