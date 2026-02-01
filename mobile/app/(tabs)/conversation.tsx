import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
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
import { useConversationStore, ConversationTurn } from '../../src/store/conversationStore';
import { useHistoryStore } from '../../src/store/historyStore';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { ConversationBubble } from '../../src/components/ConversationBubble';
import { translationService, RealtimeTranslationResult } from '../../src/services/translationService';
import { audioService, AudioSegment } from '../../src/services/audioService';
import { getLanguageByCode } from '../../src/constants/languages';
import { useDebouncedSpeaking } from '../../src/hooks/useDebouncedSpeaking';

export default function ConversationScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback } = useSettingsStore();
  const {
    personALang,
    personBLang,
    turns,
    currentTurn,
    activeSpeaker,
    isListening,
    isProcessing,
    isConnected,
    setPersonALang,
    setPersonBLang,
    setActiveSpeaker,
    setIsListening,
    setIsProcessing,
    setIsConnected,
    setCurrentTurn,
    finalizeTurn,
    clearConversation,
    loadLanguages,
  } = useConversationStore();
  const { addTranslation } = useHistoryStore();

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const scrollRefA = useRef<ScrollView>(null);
  const scrollRefB = useRef<ScrollView>(null);
  const segmentIdCounter = useRef(0);

  // Refs to avoid stale closures in callbacks passed to services
  const activeSpeakerRef = useRef(activeSpeaker);
  const personALangRef = useRef(personALang);
  const personBLangRef = useRef(personBLang);
  const currentTurnRef = useRef(currentTurn);

  useEffect(() => { activeSpeakerRef.current = activeSpeaker; }, [activeSpeaker]);
  useEffect(() => { personALangRef.current = personALang; }, [personALang]);
  useEffect(() => { personBLangRef.current = personBLang; }, [personBLang]);
  useEffect(() => { currentTurnRef.current = currentTurn; }, [currentTurn]);

  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  const personAInfo = getLanguageByCode(personALang);
  const personBInfo = getLanguageByCode(personBLang);

  // Load persisted language selections on mount
  useEffect(() => {
    loadLanguages();
  }, []);

  // Auto-scroll when new turns arrive
  useEffect(() => {
    setTimeout(() => {
      scrollRefA.current?.scrollToEnd({ animated: true });
      scrollRefB.current?.scrollToEnd({ animated: true });
    }, 150);
  }, [turns, currentTurn]);

  const handleHaptic = useCallback(() => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [hapticFeedback]);

  // WebSocket message handler for conversation (uses refs to avoid stale closures)
  const handleWebSocketMessage = useCallback((data: RealtimeTranslationResult) => {
    const speaker = activeSpeakerRef.current;
    if (!speaker) return;

    if (data.type === 'realtime_ready') {
      setIsProcessing(false);
    } else if (data.type === 'segment_result') {
      setIsProcessing(false);

      if (data.isEmpty || (!data.transcript && !data.translation)) return;

      const turnId = `${speaker}-${data.segmentId || Date.now()}`;
      const sourceLang = speaker === 'A' ? personALangRef.current : personBLangRef.current;
      const targetLang = speaker === 'A' ? personBLangRef.current : personALangRef.current;
      const isFinal = data.isFinal ?? false;

      if (isFinal) {
        const curTurn = currentTurnRef.current;
        const finalTurn: ConversationTurn = {
          id: turnId,
          speaker,
          originalText: data.transcript || curTurn?.originalText || '',
          translatedText: data.translation || curTurn?.translatedText || '',
          originalLang: sourceLang,
          translatedLang: targetLang,
          timestamp: new Date(),
          isFinal: true,
        };
        finalizeTurn(finalTurn);
        handleHaptic();

        // Save to history
        addTranslation({
          sourceText: finalTurn.originalText,
          translatedText: finalTurn.translatedText,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          isFavorite: false,
          mode: 'conversation',
        });
      } else {
        setCurrentTurn({
          id: turnId,
          speaker,
          originalText: data.transcript || '',
          translatedText: data.translation || '',
          originalLang: sourceLang,
          translatedLang: targetLang,
          timestamp: new Date(),
          isFinal: false,
        });
      }
    } else if (data.type === 'error') {
      console.error('Conversation WebSocket error:', data.error);
      setConnectionError(data.error || 'Unknown error');
      setIsProcessing(false);
    }
  }, [finalizeTurn, handleHaptic, addTranslation, setCurrentTurn, setIsProcessing]);

  const handleSegmentReady = useCallback((segment: AudioSegment) => {
    const speaker = activeSpeakerRef.current;
    if (!speaker) return;
    setIsProcessing(true);
    const sourceLang = speaker === 'A' ? personALangRef.current : personBLangRef.current;
    const targetLang = speaker === 'A' ? personBLangRef.current : personALangRef.current;
    translationService.sendAudioSegment(
      segment.base64,
      segment.segmentId,
      sourceLang,
      targetLang
    );
  }, [setIsProcessing]);

  const handleMeteringUpdate = useCallback((_level: number, speaking: boolean) => {
    setIsSpeaking(speaking);
  }, []);

  const startSpeaking = async (speaker: 'A' | 'B') => {
    if (isListening) return; // Already someone speaking

    handleHaptic();
    setActiveSpeaker(speaker);
    setConnectionError(null);

    // Disconnect existing WebSocket if any
    if (translationService.isConnected()) {
      translationService.disconnect();
      setIsConnected(false);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const sourceLang = speaker === 'A' ? personALang : personBLang;
    const targetLang = speaker === 'A' ? personBLang : personALang;

    // Await WebSocket connection before starting audio
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        translationService.connectRealtimeWebSocket(
          handleWebSocketMessage,
          (error) => {
            clearTimeout(timeout);
            console.error('Conversation WS error:', error);
            reject(error);
          },
          () => {
            clearTimeout(timeout);
            setIsConnected(true);
            translationService.startRealtimeSession(sourceLang, targetLang);
            resolve();
          }
        );
      });
    } catch (error) {
      setConnectionError('Connection failed. Try again.');
      setIsConnected(false);
      setIsListening(false);
      setActiveSpeaker(null);
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
      Alert.alert('Microphone Error', 'Could not start microphone.');
      setActiveSpeaker(null);
    }
  };

  const stopSpeaking = () => {
    handleHaptic();
    audioService.stopRealtimeMode();
    setIsListening(false);
    setIsSpeaking(false);
    setActiveSpeaker(null);
  };

  const handleClear = () => {
    handleHaptic();
    if (isListening) {
      audioService.stopRealtimeMode();
      setIsListening(false);
      setIsSpeaking(false);
      setActiveSpeaker(null);
    }
    if (translationService.isConnected()) {
      translationService.disconnect();
      setIsConnected(false);
    }
    audioService.resetSegmentCount();
    clearConversation();
    setConnectionError(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioService.stopRealtimeMode();
      translationService.disconnect();
    };
  }, []);

  // Render bubbles for a specific person's view
  const renderBubblesForPerson = (viewer: 'A' | 'B') => {
    const allTurns = [...turns, ...(currentTurn ? [currentTurn] : [])];
    if (allTurns.length === 0) return null;

    return allTurns.map((turn) => {
      const isOwnSpeech = turn.speaker === viewer;
      // For the viewer: show other person's translation prominently, own speech small
      const displayTranslated = isOwnSpeech ? turn.originalText : turn.translatedText;
      const displayOriginal = isOwnSpeech ? '' : turn.originalText;
      const displayTranslatedLang = isOwnSpeech ? turn.originalLang : turn.translatedLang;
      const displayOriginalLang = turn.originalLang;
      const speakerInfo = turn.speaker === 'A' ? personAInfo : personBInfo;

      return (
        <ConversationBubble
          key={turn.id}
          theme={theme}
          translatedText={displayTranslated}
          originalText={displayOriginal}
          translatedLang={displayTranslatedLang}
          originalLang={displayOriginalLang}
          speaker={turn.speaker}
          isOwnSpeech={isOwnSpeech}
          isCurrent={!turn.isFinal}
          flag={speakerInfo?.flag}
        />
      );
    });
  };

  // Debounce the speaking state to prevent rapid label flickering
  const displaySpeaking = useDebouncedSpeaking(isSpeaking, isListening, 500);

  const SpeakButton = ({ person, isTop }: { person: 'A' | 'B'; isTop: boolean }) => {
    const isActive = isListening && activeSpeaker === person;
    const isOtherActive = isListening && activeSpeaker !== person;
    const accentColor = person === 'A' ? theme.colors.accent : theme.colors.secondary;

    return (
      <TouchableOpacity
        onPress={() => isActive ? stopSpeaking() : startSpeaking(person)}
        disabled={isOtherActive}
        activeOpacity={0.8}
        style={[
          styles.speakButton,
          { backgroundColor: isActive ? theme.colors.error : accentColor },
          isOtherActive && styles.speakButtonDisabled,
        ]}
      >
        <Ionicons
          name={isActive ? 'stop' : 'mic'}
          size={20}
          color="#FFF"
        />
        <Text style={styles.speakButtonText}>
          {isActive
            ? 'Tap to stop'
            : `Tap to speak - Person ${person}`}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[theme.colors.secondary, theme.colors.accent] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerIconBg}
          >
            <Ionicons name="people" size={20} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.title, { color: theme.colors.text }]}>Conversation</Text>
        </View>
        <View style={styles.headerRight}>
          {turns.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={20} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
          <View style={[
            styles.statusBadge,
            { backgroundColor: isConnected ? theme.colors.success : theme.colors.primary }
          ]}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? theme.colors.successLight : theme.colors.primaryLight }]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Live' : 'Ready'}
            </Text>
          </View>
        </View>
      </View>

      {/* Person A Section (Top - rotated 180deg for face-to-face) */}
      <View style={[styles.personSection, styles.personASection]}>
        <View style={styles.rotatedContent}>
          {/* Conversation bubbles (Person A's view) */}
          <ScrollView
            ref={scrollRefA}
            style={styles.bubblesContainer}
            contentContainerStyle={styles.bubblesContent}
            showsVerticalScrollIndicator={false}
          >
            {turns.length === 0 && !currentTurn ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={32} color={theme.colors.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                  Tap the button to start speaking
                </Text>
              </View>
            ) : (
              renderBubblesForPerson('A')
            )}
          </ScrollView>

          {/* Speak button for Person A */}
          <SpeakButton person="A" isTop={true} />
        </View>
      </View>

      {/* Language Bar - Center (NOT rotated, both selectors accessible) */}
      <View style={[styles.languageBar, { backgroundColor: theme.colors.card }]}>
        <View style={styles.langBarSide}>
          <View style={[styles.personBadge, { backgroundColor: theme.colors.accent + '15' }]}>
            <Text style={styles.personFlag}>{personAInfo?.flag || '🌐'}</Text>
            <Text style={[styles.personLabel, { color: theme.colors.accent }]}>A</Text>
          </View>
          <View style={styles.langSelectCompact}>
            <LanguageSelector value={personALang} onChange={setPersonALang} excludeAuto />
          </View>
        </View>

        <TouchableOpacity
          onPress={() => {
            handleHaptic();
            const tempLang = personALang;
            setPersonALang(personBLang);
            setPersonBLang(tempLang);
          }}
          style={styles.swapButton}
        >
          <LinearGradient
            colors={[theme.colors.secondary, theme.colors.accent] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.swapButtonGradient}
          >
            <Ionicons name="swap-horizontal" size={16} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.langBarSide}>
          <View style={styles.langSelectCompact}>
            <LanguageSelector value={personBLang} onChange={setPersonBLang} excludeAuto />
          </View>
          <View style={[styles.personBadge, { backgroundColor: theme.colors.secondary + '15' }]}>
            <Text style={styles.personFlag}>{personBInfo?.flag || '🌐'}</Text>
            <Text style={[styles.personLabel, { color: theme.colors.secondary }]}>B</Text>
          </View>
        </View>
      </View>

      {/* Person B Section (Bottom - normal orientation) */}
      <View style={[styles.personSection, styles.personBSection]}>
        {/* Speak button for Person B */}
        <SpeakButton person="B" isTop={false} />

        {/* Conversation bubbles (Person B's view) */}
        <ScrollView
          ref={scrollRefB}
          style={styles.bubblesContainer}
          contentContainerStyle={styles.bubblesContent}
          showsVerticalScrollIndicator={false}
        >
          {turns.length === 0 && !currentTurn ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={32} color={theme.colors.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                Tap the button to start speaking
              </Text>
            </View>
          ) : (
            renderBubblesForPerson('B')
          )}
        </ScrollView>
      </View>

      {/* Connection Error */}
      {connectionError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.colors.error + '15' }]}>
          <Ionicons name="warning" size={16} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{connectionError}</Text>
        </View>
      )}
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
    paddingVertical: 10,
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
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  clearBtn: {
    padding: 6,
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
  personSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  personASection: {
    transform: [{ rotate: '180deg' }],
  },
  personBSection: {},
  rotatedContent: {
    flex: 1,
  },
  personBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  personFlag: {
    fontSize: 14,
  },
  personLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  languageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginVertical: 4,
  },
  langBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langSelectCompact: {
    flex: 1,
  },
  swapButton: {
    marginHorizontal: 8,
  },
  swapButtonGradient: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubblesContainer: {
    flex: 1,
  },
  bubblesContent: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  speakButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    gap: 8,
    marginVertical: 4,
  },
  speakButtonDisabled: {
    opacity: 0.4,
  },
  speakButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
