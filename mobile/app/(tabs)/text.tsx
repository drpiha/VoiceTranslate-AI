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
  Share,
  Animated,
  Easing,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTranslationStore } from '../../src/store/translationStore';
import { useNavigationStore } from '../../src/store/navigationStore';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { STTWaveform } from '../../src/components/STTWaveform';
import { RecordingTimer } from '../../src/components/RecordingTimer';
import { TranscriptEditor } from '../../src/components/TranscriptEditor';
import { StateAdaptiveButton, STTScreenState } from '../../src/components/StateAdaptiveButton';
import { NavigationDrawer } from '../../src/components/NavigationDrawer';
import { translationService, RealtimeTranslationResult } from '../../src/services/translationService';
import { audioService, AudioSegment } from '../../src/services/audioService';

export default function TextScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, colorScheme: currentColorScheme, hapticFeedback } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, currentColorScheme);
  const { isDrawerOpen, closeDrawer } = useNavigationStore();

  const {
    isRecording, setRecording,
    isProcessing, setProcessing,
    sourceLanguage, setSourceLanguage,
    targetLanguage, setTargetLanguage,
    translatedText, setTranslatedText,
    error, setError,
    sttMode, setSttMode,
    sttSessionTitle, setSttSessionTitle,
    sttTranscript, setSttTranscript,
    resetStt, swapLanguages,
  } = useTranslationStore();

  // Local state
  const [meteringLevel, setMeteringLevel] = useState(-60);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('online');
  const [copied, setCopied] = useState(false);

  // Refs
  const sourceLanguageRef = useRef(sourceLanguage);
  const targetLanguageRef = useRef(targetLanguage);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 3;

  // Swap button animation
  const swapRotation = useRef(new Animated.Value(0)).current;
  const swapRotationCount = useRef(0);
  const swapSpin = swapRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  useEffect(() => { sourceLanguageRef.current = sourceLanguage; }, [sourceLanguage]);
  useEffect(() => { targetLanguageRef.current = targetLanguage; }, [targetLanguage]);

  // Preconnect WebSocket on mount (for real-time mode)
  useEffect(() => {
    translationService.preconnect();
  }, []);

  const handleHaptic = useCallback(() => {
    if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [hapticFeedback]);

  // Determine screen state
  const screenState: STTScreenState = (() => {
    if (isRecording) return 'recording';
    if (isProcessing && !translatedText) return sttTranscript ? 'translating' : 'processing';
    if (translatedText) return 'has_translation';
    if (sttTranscript) return 'has_transcript';
    return 'idle';
  })();

  // Generate session title
  const generateTitle = () => {
    const now = new Date();
    return `Recording ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // === REAL-TIME MODE ===
  const handleWebSocketMessage = useCallback((data: RealtimeTranslationResult) => {
    if (data.type === 'realtime_ready') {
      reconnectAttempts.current = 0;
    } else if (data.type === 'segment_result') {
      if (data.isEmpty || (!data.transcript && !data.translation)) return;
      if (data.transcript) {
        setSttTranscript(
          useTranslationStore.getState().sttTranscript +
          (useTranslationStore.getState().sttTranscript ? ' ' : '') +
          data.transcript
        );
      }
    } else if (data.type === 'error') {
      setError(data.error || 'Unknown error');
    }
  }, [setSttTranscript, setError]);

  const handleSegmentReady = useCallback((segment: AudioSegment) => {
    translationService.sendAudioSegment(
      segment.base64,
      segment.segmentId,
      sourceLanguageRef.current,
      targetLanguageRef.current
    );
  }, []);

  const handleMeteringUpdate = useCallback((level: number, speaking: boolean) => {
    setMeteringLevel(level);
    setIsSpeaking(speaking);
  }, []);

  const startRealtimeRecording = async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        setBackendStatus('checking');
        translationService.ensureConnected(
          handleWebSocketMessage,
          (err) => { clearTimeout(timeout); setBackendStatus('offline'); reject(err); },
          () => {
            clearTimeout(timeout);
            setIsConnected(true);
            setBackendStatus('online');
            reconnectAttempts.current = 0;
            translationService.startRealtimeSession(sourceLanguageRef.current, targetLanguageRef.current);
            resolve();
          }
        );
      });
    } catch {
      setError('Connection failed. Try batch mode or check your connection.');
      return;
    }

    const success = await audioService.startRealtimeMode(handleSegmentReady, handleMeteringUpdate);
    if (success) {
      setRecording(true);
    } else {
      Alert.alert('Microphone Error', 'Could not start microphone. Please check permissions.');
    }
  };

  const stopRealtimeRecording = () => {
    audioService.stopRealtimeMode();
    setRecording(false);
    setIsSpeaking(false);
    setMeteringLevel(-60);
  };

  // === BATCH MODE ===
  const startBatchRecording = async () => {
    try {
      await audioService.startRecordingWithMetering(handleMeteringUpdate);
      setRecording(true);
    } catch {
      Alert.alert('Microphone Error', 'Could not start microphone. Please check permissions.');
    }
  };

  const stopBatchRecording = async () => {
    try {
      setRecording(false);
      setMeteringLevel(-60);
      setIsSpeaking(false);
      setProcessing(true);

      const audioUri = await audioService.stopRecordingWithMetering();
      if (audioUri) {
        const result = await translationService.transcribeAudio(audioUri, sourceLanguageRef.current);
        if (result.transcript) {
          setSttTranscript(result.transcript);
        } else {
          setError('No speech detected. Try again.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Transcription failed');
    } finally {
      setProcessing(false);
    }
  };

  // === UNIFIED CONTROLS ===
  const startRecording = () => {
    handleHaptic();
    setError(null);
    setTranslatedText('');
    if (!sttSessionTitle) setSttSessionTitle(generateTitle());

    if (sttMode === 'realtime') {
      startRealtimeRecording();
    } else {
      startBatchRecording();
    }
  };

  const stopRecording = () => {
    handleHaptic();
    if (sttMode === 'realtime') {
      stopRealtimeRecording();
    } else {
      stopBatchRecording();
    }
  };

  const translateTranscript = async () => {
    handleHaptic();
    setProcessing(true);
    setError(null);
    try {
      const result = await translationService.translate(
        sttTranscript,
        sourceLanguageRef.current,
        targetLanguageRef.current
      );
      setTranslatedText(result.translatedText);
    } catch (err: any) {
      setError(err.message || 'Translation failed');
    } finally {
      setProcessing(false);
    }
  };

  const newRecording = () => {
    handleHaptic();
    resetStt();
    setTranslatedText('');
    setError(null);
    setMeteringLevel(-60);
    setIsSpeaking(false);
  };

  const handlePrimaryButton = () => {
    switch (screenState) {
      case 'idle': startRecording(); break;
      case 'recording': stopRecording(); break;
      case 'has_transcript': translateTranscript(); break;
      case 'has_translation': newRecording(); break;
    }
  };

  const handleSwap = () => {
    handleHaptic();
    swapRotationCount.current += 1;
    Animated.spring(swapRotation, {
      toValue: swapRotationCount.current,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
    swapLanguages();
  };

  const handleCopy = async () => {
    handleHaptic();
    await Clipboard.setStringAsync(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    handleHaptic();
    try {
      await Share.share({
        message: `${sttTranscript}\n\n---\n\n${translatedText}`,
      });
    } catch {
      // Share cancelled
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => useNavigationStore.getState().openDrawer()}
              style={styles.menuBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="menu" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.colors.text }]}>Text</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: backendStatus === 'online' ? theme.colors.success + '20' : theme.colors.error + '20' }
            ]}>
              <View style={[
                styles.statusDot,
                { backgroundColor: backendStatus === 'online' ? theme.colors.success : theme.colors.error }
              ]} />
              <Text style={[
                styles.statusText,
                { color: backendStatus === 'online' ? theme.colors.success : theme.colors.error }
              ]}>
                {backendStatus === 'checking' ? 'Connecting' : backendStatus === 'online' ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          {/* Session Title */}
          <TextInput
            style={[styles.sessionTitle, { color: theme.colors.text, borderBottomColor: theme.colors.borderLight }]}
            value={sttSessionTitle}
            onChangeText={setSttSessionTitle}
            placeholder="Session title..."
            placeholderTextColor={theme.colors.textTertiary}
          />

          {/* Language Pair */}
          <View style={[styles.languageRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.langSide}>
              <LanguageSelector value={sourceLanguage} onChange={setSourceLanguage} />
            </View>
            <TouchableOpacity onPress={handleSwap} style={styles.swapBtn} disabled={sourceLanguage === 'auto'}>
              <Animated.View style={{ transform: [{ rotate: swapSpin }] }}>
                <View style={[styles.swapCircle, { backgroundColor: theme.colors.primary + '10' }]}>
                  <Ionicons name="swap-horizontal" size={16} color={theme.colors.primary} />
                </View>
              </Animated.View>
            </TouchableOpacity>
            <View style={styles.langSide}>
              <LanguageSelector value={targetLanguage} onChange={setTargetLanguage} excludeAuto />
            </View>
          </View>

          {/* Recording Card */}
          <View style={[styles.recordingCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            {/* Mode Toggle */}
            <View style={[styles.modeToggle, { backgroundColor: isDark ? theme.colors.surface : '#F1F5F9' }]}>
              <TouchableOpacity
                onPress={() => { if (!isRecording) setSttMode('realtime'); }}
                style={[
                  styles.modeOption,
                  sttMode === 'realtime' && { backgroundColor: theme.colors.primary },
                ]}
                disabled={isRecording}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.modeText,
                  { color: sttMode === 'realtime' ? '#FFFFFF' : theme.colors.textSecondary },
                ]}>Real-time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (!isRecording) setSttMode('batch'); }}
                style={[
                  styles.modeOption,
                  sttMode === 'batch' && { backgroundColor: theme.colors.primary },
                ]}
                disabled={isRecording}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.modeText,
                  { color: sttMode === 'batch' ? '#FFFFFF' : theme.colors.textSecondary },
                ]}>Batch</Text>
              </TouchableOpacity>
            </View>

            {/* Waveform */}
            <View style={styles.waveformContainer}>
              <STTWaveform
                isActive={isRecording}
                meteringLevel={meteringLevel}
                isSpeaking={isSpeaking}
                primaryColor={theme.colors.primary}
                accentColor={theme.colors.accent}
              />
            </View>

            {/* Timer */}
            <RecordingTimer
              isRecording={isRecording}
              textColor={isRecording ? theme.colors.error : theme.colors.textTertiary}
            />

            {/* Recording indicator */}
            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={[styles.recordingDot, { backgroundColor: theme.colors.error }]} />
                <Text style={[styles.recordingLabel, { color: theme.colors.error }]}>
                  {sttMode === 'realtime' ? 'Listening...' : 'Recording...'}
                </Text>
              </View>
            )}
          </View>

          {/* Transcript Card */}
          <View style={styles.transcriptSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Transcript</Text>
              {sttTranscript.length > 0 && (
                <TouchableOpacity onPress={() => setSttTranscript('')} activeOpacity={0.7}>
                  <Text style={[styles.clearBtn, { color: theme.colors.textTertiary }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TranscriptEditor
              transcript={sttTranscript}
              onEdit={setSttTranscript}
              isEditable={!isRecording && !isProcessing}
              textColor={theme.colors.text}
              placeholderColor={theme.colors.textTertiary}
              backgroundColor={theme.colors.card}
              borderColor={theme.colors.border}
              accentColor={theme.colors.primary}
            />
          </View>

          {/* Error Banner */}
          {error && (
            <View style={[styles.errorBanner, { backgroundColor: theme.colors.error + '15' }]}>
              <Ionicons name="warning-outline" size={16} color={theme.colors.error} />
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
            </View>
          )}

          {/* Primary Action Button */}
          <StateAdaptiveButton
            state={screenState}
            onPress={handlePrimaryButton}
            primaryColor={theme.colors.primary}
            errorColor={theme.colors.error}
            disabled={screenState === 'processing' || screenState === 'translating'}
          />

          {/* Translation Result */}
          {translatedText.length > 0 && (
            <View style={[styles.resultCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Translation</Text>
              </View>
              <Text style={[styles.resultText, { color: theme.colors.text }]} selectable>
                {translatedText}
              </Text>
              <View style={styles.resultActions}>
                <TouchableOpacity onPress={handleCopy} style={[styles.actionBtn, { backgroundColor: theme.colors.primary + '10' }]}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={theme.colors.primary} />
                  <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShare} style={[styles.actionBtn, { backgroundColor: theme.colors.accent + '10' }]}>
                  <Ionicons name="share-outline" size={18} color={theme.colors.accent} />
                  <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>

      <NavigationDrawer isOpen={isDrawerOpen} onClose={closeDrawer} />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuBtn: {
    padding: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  langSide: {
    flex: 1,
  },
  swapBtn: {
    paddingHorizontal: 4,
  },
  swapCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    alignSelf: 'stretch',
  },
  modeOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  waveformContainer: {
    width: '100%',
    paddingVertical: 8,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  transcriptSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearBtn: {
    fontSize: 13,
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  resultText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
