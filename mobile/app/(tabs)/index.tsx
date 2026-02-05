import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import ReAnimated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useUserStore } from '../../src/store/userStore';
import { useHistoryStore } from '../../src/store/historyStore';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { FloatingMicButton } from '../../src/components/FloatingMicButton';
import { TranscriptPanel, FinalizedSentence, CurrentSegment } from '../../src/components/TranscriptPanel';
import { translationService, RealtimeTranslationResult } from '../../src/services/translationService';
import { audioService, AudioSegment } from '../../src/services/audioService';
import { getLanguageByCode } from '../../src/constants/languages';
import { useNavigationStore } from '../../src/store/navigationStore';

interface TranslationSegment {
  id: number;
  transcript: string;
  translation: string;
  detectedLanguage?: string;
  timestamp: Date;
  isFinal: boolean;
}

export default function LiveScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, colorScheme: currentColorScheme, hapticFeedback } = useSettingsStore();
  const { user } = useUserStore();
  const { addTranslation } = useHistoryStore();

  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [stableDetectedLang, setStableDetectedLang] = useState<string | null>(null);
  const langDetectionCount = useRef<Record<string, number>>({});
  const LANG_STABILITY_THRESHOLD = 3; // Need 3 consecutive detections to change language
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('online');
  const [isRetranslating, setIsRetranslating] = useState(false);

  // Finalized sentences that won't change
  const [finalizedSentences, setFinalizedSentences] = useState<FinalizedSentence[]>([]);
  // Current sentence being processed
  const [currentSegment, setCurrentSegment] = useState<CurrentSegment | null>(null);

  // Panel ratio for drag-to-resize (shared values for smooth gesture)
  const panelRatio = useSharedValue(0.5);
  const startRatio = useSharedValue(0.5);
  const containerHeight = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const lastTapTime = useRef(0);

  // Swap animation
  const swapRotation = useRef(new Animated.Value(0)).current;
  const swapRotationCount = useRef(0);

  // Language card animation
  const languageCardHeight = useSharedValue(1);
  const languageCardOpacity = useSharedValue(1);

  // Auto-reconnect state
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;

  // Refs to avoid stale closures in callbacks passed to services
  const sourceLanguageRef = useRef(sourceLanguage);
  const targetLanguageRef = useRef(targetLanguage);
  const currentSegmentRef = useRef(currentSegment);

  useEffect(() => { sourceLanguageRef.current = sourceLanguage; }, [sourceLanguage]);
  useEffect(() => { targetLanguageRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { currentSegmentRef.current = currentSegment; }, [currentSegment]);

  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, currentColorScheme);

  const handleHaptic = useCallback(() => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [hapticFeedback]);

  // Handle WebSocket messages with sentence-level updates
  const handleWebSocketMessage = useCallback((data: RealtimeTranslationResult) => {
    if (data.type === 'realtime_ready') {
      setIsProcessing(false);
      reconnectAttempts.current = 0;
    } else if (data.type === 'segment_result') {
      setIsProcessing(false);

      if (data.isEmpty || (!data.transcript && !data.translation)) {
        return;
      }

      if (data.detectedLanguage) {
        // Stabilize language detection - don't change on every segment
        const newLang = data.detectedLanguage;
        if (newLang !== stableDetectedLang) {
          // Count how many times we've seen this language
          langDetectionCount.current[newLang] = (langDetectionCount.current[newLang] || 0) + 1;

          // Only change if we've seen this language consistently
          if (langDetectionCount.current[newLang] >= LANG_STABILITY_THRESHOLD) {
            setStableDetectedLang(newLang);
            setDetectedLang(newLang);
            // Reset counters
            langDetectionCount.current = {};
          }
        } else {
          // Same language, keep the count
          langDetectionCount.current[newLang] = (langDetectionCount.current[newLang] || 0) + 1;
        }

        // Set initial detected lang on first detection
        if (!stableDetectedLang && !detectedLang) {
          setDetectedLang(newLang);
          setStableDetectedLang(newLang);
        }
      }

      const segmentId = data.segmentId || Date.now();
      const isFinal = data.isFinal ?? false;

      if (isFinal) {
        const curSeg = currentSegmentRef.current;
        const newFinalizedSentence: FinalizedSentence = {
          id: segmentId,
          transcript: data.transcript || curSeg?.transcript || '',
          translation: data.translation || curSeg?.translation || '',
          timestamp: new Date(),
        };

        setFinalizedSentences(prev => {
          if (prev.some(s => s.id === segmentId)) return prev;
          return [...prev, newFinalizedSentence];
        });
        setCurrentSegment(null);
        handleHaptic();
      } else {
        setCurrentSegment({
          id: segmentId,
          transcript: data.transcript || '',
          translation: data.translation || '',
          isFinal: false,
        });
      }

      // Legacy segments for compatibility
      setSegments(prev => {
        const existingIndex = prev.findIndex(s => s.id === segmentId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            transcript: data.transcript || updated[existingIndex].transcript,
            translation: data.translation || updated[existingIndex].translation,
            detectedLanguage: data.detectedLanguage,
            timestamp: new Date(),
            isFinal,
          };
          return updated;
        } else {
          return [...prev, {
            id: segmentId,
            transcript: data.transcript || '',
            translation: data.translation || '',
            detectedLanguage: data.detectedLanguage,
            timestamp: new Date(),
            isFinal,
          }];
        }
      });
    } else if (data.type === 'error') {
      console.error('WebSocket error:', data.error);
      setConnectionError(data.error || 'Unknown error');
      setIsProcessing(false);
    }
  }, [handleHaptic]);

  const handleSegmentReady = useCallback((segment: AudioSegment) => {
    setIsProcessing(true);
    translationService.sendAudioSegment(
      segment.base64,
      segment.segmentId,
      sourceLanguageRef.current,
      targetLanguageRef.current
    );
  }, []);

  const handleMeteringUpdate = useCallback((_level: number, speaking: boolean) => {
    setIsSpeaking(speaking);
  }, []);

  const connectWebSocket = useCallback(() => {
    setConnectionError(null);
    setBackendStatus('checking');
    translationService.connectRealtimeWebSocket(
      handleWebSocketMessage,
      (error) => {
        console.error('WebSocket connection error:', error);
        setIsConnected(false);
        setBackendStatus('offline');

        // Auto-reconnect with exponential backoff
        if (isListening && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 16000);
          reconnectAttempts.current += 1;
          setConnectionError(`Connection lost. Reconnecting (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
          reconnectTimer.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else {
          setConnectionError('Connection failed. Tap retry or try again.');
          setIsListening(false);
        }
      },
      () => {
        setIsConnected(true);
        setBackendStatus('online');
        reconnectAttempts.current = 0;
        translationService.startRealtimeSession(sourceLanguage, targetLanguage);
      }
    );
  }, [sourceLanguage, targetLanguage, handleWebSocketMessage, isListening]);

  const startListening = async () => {
    handleHaptic();
    setDetectedLang(null);
    setConnectionError(null);
    reconnectAttempts.current = 0;

    // Use ensureConnected - reuses preconnected WebSocket if available (instant start)
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        setConnectionError(null);
        setBackendStatus('checking');
        translationService.ensureConnected(
          handleWebSocketMessage,
          (error) => {
            clearTimeout(timeout);
            console.error('WebSocket connection error:', error);
            setBackendStatus('offline');
            reject(error);
          },
          () => {
            clearTimeout(timeout);
            setIsConnected(true);
            setBackendStatus('online');
            reconnectAttempts.current = 0;
            translationService.startRealtimeSession(sourceLanguage, targetLanguage);
            resolve();
          }
        );
      });
    } catch (error) {
      setConnectionError('Connection failed. Tap retry or try again.');
      setIsConnected(false);
      setIsListening(false);
      return;
    }

    // Start audio AFTER WebSocket is confirmed connected
    const success = await audioService.startRealtimeMode(
      handleSegmentReady,
      handleMeteringUpdate
    );

    if (success) {
      setIsListening(true);
    } else {
      Alert.alert('Microphone Error', 'Could not start microphone. Please check permissions.');
    }
  };

  const stopListening = () => {
    handleHaptic();
    audioService.stopRealtimeMode();
    setIsListening(false);
    setIsSpeaking(false);
    setIsProcessing(false);
    // Finalize current segment if exists (so typing dots stop)
    if (currentSegment && currentSegment.transcript) {
      setFinalizedSentences(prev => {
        if (prev.some(s => s.id === currentSegment.id)) return prev;
        return [...prev, {
          id: currentSegment.id,
          transcript: currentSegment.transcript,
          translation: currentSegment.translation,
          timestamp: new Date(),
        }];
      });
      setCurrentSegment(null);
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const clearSegments = async () => {
    handleHaptic();

    // Save to history if there's content
    const currentTranscript = segments.map(s => s.transcript).filter(Boolean).join(' ').trim();
    const currentTranslation = segments.map(s => s.translation).filter(Boolean).join(' ').trim();

    if (currentTranscript || currentTranslation) {
      const finalSourceLang = detectedLang || (sourceLanguage === 'auto' ? 'en' : sourceLanguage);
      addTranslation({
        sourceText: currentTranscript || '[Audio]',
        translatedText: currentTranslation || '',
        sourceLanguage: finalSourceLang,
        targetLanguage: targetLanguage,
        isFavorite: false,
        mode: 'live',
      });
    }

    if (isListening) {
      audioService.stopRealtimeMode();
      setIsListening(false);
      setIsSpeaking(false);
    }

    audioService.resetSegmentCount();

    if (translationService.isConnected()) {
      translationService.disconnect();
      setIsConnected(false);
    }

    setSegments([]);
    setFinalizedSentences([]);
    setCurrentSegment(null);
    setDetectedLang(null);
    setStableDetectedLang(null);
    langDetectionCount.current = {};
    setIsProcessing(false);
    setConnectionError(null);
  };

  // Swap languages with animation
  const handleSwapLanguages = () => {
    handleHaptic();
    if (sourceLanguage === 'auto' && !detectedLang) {
      Alert.alert('Cannot Swap', 'Please select a specific source language or speak first to detect the language.');
      return;
    }

    // Animate swap icon rotation
    swapRotationCount.current += 1;
    Animated.spring(swapRotation, {
      toValue: swapRotationCount.current,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    const actualSourceLang = detectedLang || sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(actualSourceLang === 'auto' ? 'en' : actualSourceLang);
    setDetectedLang(null);
  };

  const swapSpin = swapRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Retranslate when target language changes
  const handleTargetLanguageChange = (newLang: string) => {
    setTargetLanguage(newLang);
    const hasContent = finalizedSentences.length > 0 || (currentSegment?.transcript?.length ?? 0) > 0;
    if (hasContent && !isListening) {
      retranslateContent(newLang);
    }
  };

  const retranslateContent = async (newTargetLang: string) => {
    const allTranscripts = [
      ...finalizedSentences.map(s => s.transcript),
      currentSegment?.transcript || '',
    ].filter(Boolean).join(' ').trim();
    if (!allTranscripts) return;

    setIsRetranslating(true);
    try {
      const result = await translationService.translate(
        allTranscripts,
        detectedLang || sourceLanguage,
        newTargetLang
      );
      // Update the last finalized sentence with the retranslation
      if (finalizedSentences.length > 0) {
        setFinalizedSentences(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            translation: result.translatedText,
          };
          return updated;
        });
      }
    } catch (error) {
      console.error('Retranslation failed:', error);
    } finally {
      setIsRetranslating(false);
    }
  };

  // Preconnect WebSocket on mount for instant recording
  useEffect(() => {
    translationService.preconnect();
  }, []);

  // Animate language card when listening state changes
  useEffect(() => {
    languageCardHeight.value = withTiming(isListening ? 0.6 : 1, { duration: 300 });
    languageCardOpacity.value = withTiming(isListening ? 0.8 : 1, { duration: 300 });
  }, [isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioService.stopRealtimeMode();
      translationService.disconnect();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  // Snap to nearest preset position
  const SNAP_POINTS = [0.05, 0.25, 0.50, 0.75, 0.95];
  const snapToNearest = (ratio: number) => {
    let closest = SNAP_POINTS[0];
    let minDist = Math.abs(ratio - closest);
    for (const snap of SNAP_POINTS) {
      const dist = Math.abs(ratio - snap);
      if (dist < minDist) {
        minDist = dist;
        closest = snap;
      }
    }
    return closest;
  };

  const doHapticLight = useCallback(() => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticFeedback]);

  // Pan responder for drag-to-resize (updates shared values, no re-renders)
  const panResponder = useRef(
    PanResponder.create({
      // Don't capture immediately - let other touch handlers work
      onStartShouldSetPanResponder: () => false,
      // Only capture if clear vertical movement detected
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 2,
      onPanResponderGrant: () => {
        'worklet';
        startRatio.value = panelRatio.value;
        isDragging.value = true;
        runOnJS(doHapticLight)();

        // Double-tap detection: reset to 50/50
        const now = Date.now();
        if (now - lastTapTime.current < 300) {
          panelRatio.value = withSpring(0.5, { damping: 20, stiffness: 200 });
          isDragging.value = false;
          runOnJS(doHapticLight)();
          lastTapTime.current = 0;
        } else {
          lastTapTime.current = now;
        }
      },
      onPanResponderMove: (_, gestureState) => {
        'worklet';
        if (containerHeight.value > 0 && isDragging.value) {
          const newRatio = startRatio.value + gestureState.dy / containerHeight.value;
          panelRatio.value = Math.max(0.05, Math.min(0.95, newRatio));
        }
      },
      onPanResponderRelease: () => {
        'worklet';
        if (isDragging.value) {
          isDragging.value = false;
          // Snap to nearest preset with spring animation
          const snapped = snapToNearest(panelRatio.value);
          panelRatio.value = withSpring(snapped, { damping: 20, stiffness: 200 });
          runOnJS(doHapticLight)();
        }
      },
      // Prevent termination when other responders want to take over
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  // Get language info
  const sourceLangInfo = detectedLang ? getLanguageByCode(detectedLang) : getLanguageByCode(sourceLanguage);
  const targetLangInfo = getLanguageByCode(targetLanguage);
  const isCurrentlyUpdating = currentSegment !== null && !currentSegment.isFinal;
  const hasContent = finalizedSentences.length > 0 || (currentSegment?.transcript?.length ?? 0) > 0;

  // Animated style for language card
  const animatedLanguageCardStyle = useAnimatedStyle(() => ({
    opacity: languageCardOpacity.value,
    transform: [{ scaleY: languageCardHeight.value }],
  }));

  // Animated panel heights driven by shared values (no re-renders during drag)
  const topPanelStyle = useAnimatedStyle(() => {
    if (containerHeight.value <= 0) return { flex: 1 };
    return { height: containerHeight.value * panelRatio.value };
  });
  const bottomPanelStyle = useAnimatedStyle(() => {
    if (containerHeight.value <= 0) return { flex: 1 };
    return { height: containerHeight.value * (1 - panelRatio.value) };
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={useNavigationStore.getState().openDrawer} style={styles.menuBtn}>
            <Ionicons name="menu" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>Live</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: isConnected ? theme.colors.success :
              backendStatus === 'checking' ? theme.colors.primary :
              backendStatus === 'offline' ? theme.colors.error :
              theme.colors.success }
          ]}>
            <View style={[
              styles.statusDot,
              { backgroundColor: isConnected ? theme.colors.successLight :
                backendStatus === 'checking' ? theme.colors.primaryLight :
                backendStatus === 'offline' ? '#FCA5A5' :
                theme.colors.successLight }
            ]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Live' :
               backendStatus === 'checking' ? 'Connecting...' :
               backendStatus === 'offline' ? 'Offline' : 'Ready'}
            </Text>
          </View>
        </View>
      </View>

      {/* Language Selection */}
      <ReAnimated.View style={[
        styles.languageCard,
        {
          backgroundColor: theme.colors.primary + '08',
          borderColor: theme.colors.primary + '20',
        },
        animatedLanguageCardStyle
      ]}>
        {isListening ? (
          <View style={styles.languageRowCompact}>
            <View style={styles.compactLangItem}>
              <Text style={styles.compactFlag}>{sourceLangInfo?.flag || '🌐'}</Text>
              <Text style={[styles.compactCode, { color: theme.colors.text }]}>
                {detectedLang ? detectedLang.toUpperCase() : sourceLanguage.toUpperCase()}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.textSecondary} />
            <View style={styles.compactLangItem}>
              <Text style={styles.compactFlag}>{targetLangInfo?.flag || '🌐'}</Text>
              <Text style={[styles.compactCode, { color: theme.colors.text }]}>
                {targetLanguage.toUpperCase()}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.languageRow}>
            <View style={styles.languageSelectorWrapper}>
              <View style={styles.languageLabelRow}>
                <Ionicons name="mic-outline" size={14} color={theme.colors.primary} />
                <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>From</Text>
              </View>
              <LanguageSelector value={sourceLanguage} onChange={setSourceLanguage} />
            </View>

            <TouchableOpacity onPress={handleSwapLanguages} style={styles.arrowContainer}>
              <Animated.View style={{ transform: [{ rotate: swapSpin }] }}>
                <View style={[styles.arrowBadge, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                </View>
              </Animated.View>
            </TouchableOpacity>

            <View style={styles.languageSelectorWrapper}>
              <View style={styles.languageLabelRow}>
                <Ionicons name="volume-medium-outline" size={14} color={theme.colors.accent} />
                <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>To</Text>
              </View>
              <LanguageSelector value={targetLanguage} onChange={handleTargetLanguageChange} excludeAuto />
            </View>
          </View>
        )}
      </ReAnimated.View>

      {/* Two Panel Translation View */}
      <View
        style={styles.translationPanels}
        onLayout={(e) => { containerHeight.value = e.nativeEvent.layout.height; }}
      >
        <ReAnimated.View style={[styles.panelContainer, topPanelStyle]}>
          <TranscriptPanel
            theme={theme}
            field="transcript"
            languageCode={detectedLang || sourceLanguage}
            languageName={detectedLang ? detectedLang.toUpperCase() : (sourceLangInfo?.name || 'Auto Detect')}
            languageFlag={sourceLangInfo?.flag || '🌐'}
            finalizedSentences={finalizedSentences}
            currentSegment={currentSegment}
            accentColor={theme.colors.primary}
            isUpdating={isCurrentlyUpdating}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            onClear={clearSegments}
            hasContent={hasContent}
            emptyText="Spoken text will appear here"
            processingText="Processing..."
            showSentenceCount={true}
          />
        </ReAnimated.View>

        {/* Drag handle between panels */}
        <View
          style={styles.dragHandleArea}
          {...panResponder.panHandlers}
        >
          <View style={[styles.dragHandlePill, { backgroundColor: theme.colors.textTertiary }]} />
        </View>

        <ReAnimated.View style={[styles.panelContainer, bottomPanelStyle]}>
          <TranscriptPanel
            theme={theme}
            field="translation"
            languageCode={targetLanguage}
            languageName={targetLangInfo?.name || targetLanguage.toUpperCase()}
            languageFlag={targetLangInfo?.flag || '🌐'}
            finalizedSentences={finalizedSentences}
            currentSegment={currentSegment}
            accentColor={theme.colors.accent}
            isUpdating={isRetranslating}
            isProcessing={isRetranslating}
            emptyText={isRetranslating ? 'Translating...' : 'Translation will appear here'}
            processingText="Translating..."
            showSentenceCount={true}
          />
        </ReAnimated.View>
      </View>

      {/* Connection Error */}
      {connectionError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.colors.error + '15' }]}>
          <Ionicons name="warning" size={18} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{connectionError}</Text>
          <TouchableOpacity onPress={connectWebSocket} style={[styles.retryButton, { backgroundColor: theme.colors.error }]}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mic Button - absolutely positioned to always float above panels */}
      <View style={styles.micButtonOverlay}>
        <FloatingMicButton
          isListening={isListening}
          isSpeaking={isSpeaking}
          onPress={toggleListening}
          theme={theme}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuBtn: {
    padding: 4,
  },
  vtBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  vtText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
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
    color: '#FFFFFF',
  },
  languageCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  languageRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  compactLangItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactFlag: {
    fontSize: 18,
  },
  compactCode: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageSelectorWrapper: {
    flex: 1,
  },
  languageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  languageLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  arrowContainer: {
    paddingHorizontal: 12,
  },
  arrowBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  translationPanels: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  panelContainer: {
    overflow: 'hidden',
  },
  dragHandleArea: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dragHandlePill: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.4,
  },
  micButtonOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  retryText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
