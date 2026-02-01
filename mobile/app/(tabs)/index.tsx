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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
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
  const { theme: themePreference, hapticFeedback } = useSettingsStore();
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
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('online');
  const [isRetranslating, setIsRetranslating] = useState(false);

  // Finalized sentences that won't change
  const [finalizedSentences, setFinalizedSentences] = useState<FinalizedSentence[]>([]);
  // Current sentence being processed
  const [currentSegment, setCurrentSegment] = useState<CurrentSegment | null>(null);

  // Panel expansion states
  const [sourcePanelExpanded, setSourcePanelExpanded] = useState(false);
  const [targetPanelExpanded, setTargetPanelExpanded] = useState(false);

  // Auto-reconnect state
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;

  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

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
        setDetectedLang(data.detectedLanguage);
      }

      const segmentId = data.segmentId || Date.now();
      const isFinal = data.isFinal ?? false;

      if (isFinal) {
        const newFinalizedSentence: FinalizedSentence = {
          id: segmentId,
          transcript: data.transcript || currentSegment?.transcript || '',
          translation: data.translation || currentSegment?.translation || '',
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
  }, [handleHaptic, currentSegment]);

  const handleSegmentReady = useCallback((segment: AudioSegment) => {
    setIsProcessing(true);
    translationService.sendAudioSegment(
      segment.base64,
      segment.segmentId,
      sourceLanguage,
      targetLanguage
    );
  }, [sourceLanguage, targetLanguage]);

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
    setSegments([]);
    setFinalizedSentences([]);
    setCurrentSegment(null);
    setDetectedLang(null);
    setConnectionError(null);
    reconnectAttempts.current = 0;

    if (translationService.isConnected()) {
      translationService.disconnect();
      setIsConnected(false);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Await WebSocket connection before starting audio
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        setConnectionError(null);
        setBackendStatus('checking');
        translationService.connectRealtimeWebSocket(
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

    // Only start audio AFTER WebSocket is confirmed connected
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
    setIsProcessing(false);
    setConnectionError(null);
  };

  // Swap languages
  const handleSwapLanguages = () => {
    handleHaptic();
    if (sourceLanguage === 'auto' && !detectedLang) {
      Alert.alert('Cannot Swap', 'Please select a specific source language or speak first to detect the language.');
      return;
    }
    const actualSourceLang = detectedLang || sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(actualSourceLang === 'auto' ? 'en' : actualSourceLang);
    setDetectedLang(null);
  };

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

  // Get language info
  const sourceLangInfo = detectedLang ? getLanguageByCode(detectedLang) : getLanguageByCode(sourceLanguage);
  const targetLangInfo = getLanguageByCode(targetLanguage);
  const isCurrentlyUpdating = currentSegment !== null && !currentSegment.isFinal;
  const hasContent = finalizedSentences.length > 0 || (currentSegment?.transcript?.length ?? 0) > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[theme.colors.gradient1, theme.colors.gradient2] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerIconBg}
          >
            <Ionicons name="globe" size={20} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.title, { color: theme.colors.text }]}>Live Translate</Text>
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
      <View style={[styles.languageCard, { backgroundColor: theme.colors.card }]}>
        <View style={styles.languageRow}>
          <View style={styles.languageSelectorWrapper}>
            <View style={styles.languageLabelRow}>
              <Ionicons name="mic-outline" size={14} color={theme.colors.primary} />
              <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>From</Text>
            </View>
            <LanguageSelector value={sourceLanguage} onChange={setSourceLanguage} />
          </View>

          <TouchableOpacity onPress={handleSwapLanguages} style={styles.arrowContainer}>
            <LinearGradient
              colors={[theme.colors.gradient1, theme.colors.gradient2] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.arrowBadge}
            >
              <Ionicons name="swap-horizontal" size={18} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.languageSelectorWrapper}>
            <View style={styles.languageLabelRow}>
              <Ionicons name="volume-medium-outline" size={14} color={theme.colors.accent} />
              <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>To</Text>
            </View>
            <LanguageSelector value={targetLanguage} onChange={handleTargetLanguageChange} excludeAuto />
          </View>
        </View>
      </View>

      {/* Two Panel Translation View */}
      <View style={styles.translationPanels}>
        <TranscriptPanel
          theme={theme}
          field="transcript"
          languageCode={detectedLang || sourceLanguage}
          languageName={detectedLang ? detectedLang.toUpperCase() : (sourceLangInfo?.name || 'Auto Detect')}
          languageFlag={sourceLangInfo?.flag || '🌐'}
          finalizedSentences={finalizedSentences}
          currentSegment={currentSegment}
          isExpanded={sourcePanelExpanded}
          isOtherExpanded={targetPanelExpanded}
          onToggleExpand={() => setSourcePanelExpanded(!sourcePanelExpanded)}
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

        <TranscriptPanel
          theme={theme}
          field="translation"
          languageCode={targetLanguage}
          languageName={targetLangInfo?.name || targetLanguage.toUpperCase()}
          languageFlag={targetLangInfo?.flag || '🌐'}
          finalizedSentences={finalizedSentences}
          currentSegment={currentSegment}
          isExpanded={targetPanelExpanded}
          isOtherExpanded={sourcePanelExpanded}
          onToggleExpand={() => setTargetPanelExpanded(!targetPanelExpanded)}
          accentColor={theme.colors.accent}
          isUpdating={isRetranslating}
          isProcessing={isRetranslating}
          emptyText={isRetranslating ? 'Translating...' : 'Translation will appear here'}
          processingText="Translating..."
          showSentenceCount={true}
        />
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

      {/* Mic Button */}
      <FloatingMicButton
        isListening={isListening}
        isSpeaking={isSpeaking}
        onPress={toggleListening}
        theme={theme}
      />
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
  headerIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
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
    padding: 12,
    marginBottom: 12,
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
    gap: 4,
    marginBottom: 6,
  },
  languageLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  },
  translationPanels: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 10,
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
