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
  PanResponder,
} from 'react-native';
import ReAnimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ttsService } from '../../src/services/ttsService';
import { Ionicons } from '@expo/vector-icons';
import { createTheme } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useConversationStore, ConversationTurn } from '../../src/store/conversationStore';
import { useHistoryStore } from '../../src/store/historyStore';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { ConversationBubble } from '../../src/components/ConversationBubble';
import { CompactLanguagePill } from '../../src/components/CompactLanguagePill';
import { ConversationEmptyState } from '../../src/components/ConversationEmptyState';
import { BlurView } from 'expo-blur';
import { Modal, FlatList, TextInput } from 'react-native';
import { translationService, RealtimeTranslationResult } from '../../src/services/translationService';
import { audioService, AudioSegment } from '../../src/services/audioService';
import { getLanguageByCode, LANGUAGES, Language } from '../../src/constants/languages';
import { useDebouncedSpeaking } from '../../src/hooks/useDebouncedSpeaking';
import { useNavigationStore } from '../../src/store/navigationStore';

export default function ConversationScreen() {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback, converseTts, faceToFaceMode, colorScheme: userColorScheme } = useSettingsStore();
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
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [langModalFor, setLangModalFor] = useState<'A' | 'B' | null>(null);

  const scrollRefA = useRef<ScrollView>(null);
  const scrollRefB = useRef<ScrollView>(null);
  const segmentIdCounter = useRef(0);

  // --- Session accumulation refs ---
  // All VAD segments during one mic press accumulate into these refs.
  // Only finalized into a single turn when the user presses stop.
  const sessionTranscriptRef = useRef('');
  const sessionTranslationRef = useRef('');
  const sessionTurnIdRef = useRef('');
  const isRecordingSessionRef = useRef(false);
  const finalizationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-resize for face-to-face mode
  const conversePanelRatio = useSharedValue(0.5);
  const converseStartRatio = useSharedValue(0.5);
  const converseContainerHeight = useSharedValue(0);
  const lastConverseTap = useRef(0);

  const SNAP_POINTS = [0.2, 0.35, 0.5, 0.65, 0.8];
  const snapToNearest = (ratio: number) => {
    let closest = SNAP_POINTS[0];
    let minDist = Math.abs(ratio - closest);
    for (const snap of SNAP_POINTS) {
      const dist = Math.abs(ratio - snap);
      if (dist < minDist) { minDist = dist; closest = snap; }
    }
    return closest;
  };

  const doHapticLight = useCallback(() => {
    if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [hapticFeedback]);

  const conversePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        converseStartRatio.value = conversePanelRatio.value;
        runOnJS(doHapticLight)();
        const now = Date.now();
        if (now - lastConverseTap.current < 300) {
          conversePanelRatio.value = withSpring(0.5, { damping: 20, stiffness: 200 });
          runOnJS(doHapticLight)();
          lastConverseTap.current = 0;
          return;
        }
        lastConverseTap.current = now;
      },
      onPanResponderMove: (_, gestureState) => {
        if (converseContainerHeight.value > 0) {
          const newRatio = converseStartRatio.value + gestureState.dy / converseContainerHeight.value;
          conversePanelRatio.value = Math.max(0.15, Math.min(0.85, newRatio));
        }
      },
      onPanResponderRelease: () => {
        const snapped = snapToNearest(conversePanelRatio.value);
        conversePanelRatio.value = withSpring(snapped, { damping: 20, stiffness: 200 });
        runOnJS(doHapticLight)();
      },
    })
  ).current;

  // Use flex-based sizing so the fixed-height language bar and drag handle
  // don't get squeezed out by explicit pixel heights.
  const topSectionStyle = useAnimatedStyle(() => {
    return { flex: conversePanelRatio.value };
  });
  const bottomSectionStyle = useAnimatedStyle(() => {
    return { flex: 1 - conversePanelRatio.value };
  });

  // Swap animation
  const swapRotation = useRef(new Animated.Value(0)).current;
  const swapRotationCount = useRef(0);

  // Active speak button animations
  const speakAPulse = useRef(new Animated.Value(1)).current;
  const speakBPulse = useRef(new Animated.Value(1)).current;
  const badgeAGlow = useRef(new Animated.Value(0)).current;
  const badgeBGlow = useRef(new Animated.Value(0)).current;

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
  const theme = createTheme(isDark, userColorScheme);

  const personAInfo = getLanguageByCode(personALang);
  const personBInfo = getLanguageByCode(personBLang);

  // Load persisted language selections on mount
  useEffect(() => {
    loadLanguages();
  }, []);

  // Preconnect WebSocket on mount for instant recording
  useEffect(() => {
    translationService.preconnect();
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

  // --- Finalize a complete recording session as one turn ---
  const finalizeSession = useCallback((speaker: 'A' | 'B' | null) => {
    const transcript = sessionTranscriptRef.current.trim();
    const translation = sessionTranslationRef.current.trim();

    if (speaker && (transcript || translation)) {
      const sourceLang = speaker === 'A' ? personALangRef.current : personBLangRef.current;
      const targetLang = speaker === 'A' ? personBLangRef.current : personALangRef.current;

      const finalTurn: ConversationTurn = {
        id: sessionTurnIdRef.current,
        speaker,
        originalText: transcript,
        translatedText: translation,
        originalLang: sourceLang,
        translatedLang: targetLang,
        timestamp: new Date(),
        isFinal: true,
      };

      finalizeTurn(finalTurn);

      // Save to history
      addTranslation({
        sourceText: finalTurn.originalText,
        translatedText: finalTurn.translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        isFavorite: false,
        mode: 'conversation',
      });

      // TTS only after mic is stopped - read the complete translation
      const ttsEnabled = useSettingsStore.getState().converseTts;
      if (ttsEnabled && translation) {
        ttsService.speak(translation, targetLang).catch(console.error);
      }
    }

    // Clear currentTurn to remove typing dots
    setCurrentTurn(null);
    setActiveSpeaker(null);

    // Reset session
    sessionTranscriptRef.current = '';
    sessionTranslationRef.current = '';
    sessionTurnIdRef.current = '';
  }, [finalizeTurn, addTranslation, setCurrentTurn, setActiveSpeaker]);

  // WebSocket message handler - accumulates segments into one session turn
  const handleWebSocketMessage = useCallback((data: RealtimeTranslationResult) => {
    const speaker = activeSpeakerRef.current;
    if (!speaker) return;

    if (data.type === 'realtime_ready') {
      setIsProcessing(false);
    } else if (data.type === 'segment_result') {
      setIsProcessing(false);

      if (data.isEmpty || (!data.transcript && !data.translation)) return;

      const sourceLang = speaker === 'A' ? personALangRef.current : personBLangRef.current;
      const targetLang = speaker === 'A' ? personBLangRef.current : personALangRef.current;
      const isFinal = data.isFinal ?? false;

      if (isFinal) {
        // Accumulate this finalized segment into the session
        const newTranscript = data.transcript || '';
        const newTranslation = data.translation || '';

        if (newTranscript) {
          sessionTranscriptRef.current += (sessionTranscriptRef.current ? ' ' : '') + newTranscript;
        }
        if (newTranslation) {
          sessionTranslationRef.current += (sessionTranslationRef.current ? ' ' : '') + newTranslation;
        }

        // Show accumulated progress as currentTurn (NOT finalized yet)
        setCurrentTurn({
          id: sessionTurnIdRef.current,
          speaker,
          originalText: sessionTranscriptRef.current,
          translatedText: sessionTranslationRef.current,
          originalLang: sourceLang,
          translatedLang: targetLang,
          timestamp: new Date(),
          isFinal: false,
        });

        handleHaptic();
      } else {
        // Interim (non-final) result - show accumulated text + this interim segment
        const interimTranscript = data.transcript || '';
        const interimTranslation = data.translation || '';

        setCurrentTurn({
          id: sessionTurnIdRef.current,
          speaker,
          originalText: sessionTranscriptRef.current + (interimTranscript ? (sessionTranscriptRef.current ? ' ' : '') + interimTranscript : ''),
          translatedText: sessionTranslationRef.current + (interimTranslation ? (sessionTranslationRef.current ? ' ' : '') + interimTranslation : ''),
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
  }, [handleHaptic, setCurrentTurn, setIsProcessing]);

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
    if (isListening) return; // Already recording

    // Cancel any pending finalization from a previous session and finalize immediately
    if (finalizationTimeoutRef.current) {
      clearTimeout(finalizationTimeoutRef.current);
      finalizationTimeoutRef.current = null;
      // Finalize the previous session immediately if there's accumulated text
      if (sessionTranscriptRef.current.trim() || sessionTranslationRef.current.trim()) {
        finalizeSession(activeSpeakerRef.current);
      }
    }

    // Stop any currently playing TTS
    ttsService.stop();

    // Recording START haptic - distinct notification type
    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    // Reset session accumulation for new recording
    sessionTranscriptRef.current = '';
    sessionTranslationRef.current = '';
    sessionTurnIdRef.current = `${speaker}-session-${Date.now()}`;
    isRecordingSessionRef.current = true;

    setActiveSpeaker(speaker);
    setConnectionError(null);

    const sourceLang = speaker === 'A' ? personALang : personBLang;
    const targetLang = speaker === 'A' ? personBLang : personALang;

    // Connect WebSocket (reuses preconnected socket if available)
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        translationService.ensureConnected(
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
      isRecordingSessionRef.current = false;
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
      Alert.alert('Microphone Error', 'Could not start microphone.');
      setActiveSpeaker(null);
      isRecordingSessionRef.current = false;
    }
  };

  const stopSpeaking = () => {
    // Recording STOP haptic - success type (distinct from start)
    if (hapticFeedback) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    audioService.stopRealtimeMode();
    setIsListening(false);
    setIsSpeaking(false);
    isRecordingSessionRef.current = false;

    // Capture speaker before the timeout clears it
    const speaker = activeSpeakerRef.current;

    // Wait briefly for any pending segment results to arrive, then finalize
    finalizationTimeoutRef.current = setTimeout(() => {
      finalizeSession(speaker);
      finalizationTimeoutRef.current = null;
    }, 1200);
  };

  const handleClear = () => {
    handleHaptic();

    // Cancel pending finalization
    if (finalizationTimeoutRef.current) {
      clearTimeout(finalizationTimeoutRef.current);
      finalizationTimeoutRef.current = null;
    }

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

    ttsService.stop();
    audioService.resetSegmentCount();
    clearConversation();
    setConnectionError(null);

    // Reset session refs
    sessionTranscriptRef.current = '';
    sessionTranslationRef.current = '';
    sessionTurnIdRef.current = '';
    isRecordingSessionRef.current = false;
  };

  // Handle per-bubble speak button - TOGGLE: tap to play, tap again to stop
  const handleBubbleSpeak = useCallback((text: string, lang: string) => {
    if (ttsService.isPlaying()) {
      ttsService.stop();
    } else {
      ttsService.speak(text, lang).catch(console.error);
    }
  }, []);

  const toggleTts = () => {
    handleHaptic();
    useSettingsStore.getState().setConverseTts(!converseTts);
  };

  const toggleFaceToFace = () => {
    handleHaptic();
    useSettingsStore.getState().setFaceToFaceMode(!faceToFaceMode);
  };

  // Pulse animation for active speak button + badge glow
  useEffect(() => {
    if (isListening && activeSpeaker === 'A') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(speakAPulse, { toValue: 1.04, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(speakAPulse, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(badgeAGlow, { toValue: 1, duration: 600, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(badgeAGlow, { toValue: 0, duration: 600, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      glow.start();
      return () => { pulse.stop(); glow.stop(); };
    } else {
      speakAPulse.setValue(1);
      badgeAGlow.setValue(0);
    }
  }, [isListening, activeSpeaker]);

  useEffect(() => {
    if (isListening && activeSpeaker === 'B') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(speakBPulse, { toValue: 1.04, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(speakBPulse, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(badgeBGlow, { toValue: 1, duration: 600, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(badgeBGlow, { toValue: 0, duration: 600, useNativeDriver: false, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      glow.start();
      return () => { pulse.stop(); glow.stop(); };
    } else {
      speakBPulse.setValue(1);
      badgeBGlow.setValue(0);
    }
  }, [isListening, activeSpeaker]);

  const swapSpin = swapRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioService.stopRealtimeMode();
      translationService.disconnect();
      ttsService.stop();
      if (finalizationTimeoutRef.current) {
        clearTimeout(finalizationTimeoutRef.current);
      }
    };
  }, []);

  // Render bubbles for a specific person's view
  const renderBubblesForPerson = (viewer: 'A' | 'B') => {
    const allTurns = [...turns, ...(currentTurn ? [currentTurn] : [])];
    if (allTurns.length === 0) return null;

    return allTurns.map((turn, index) => {
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
          isLatest={index === allTurns.length - 1}
          flag={speakerInfo?.flag}
          onSpeak={handleBubbleSpeak}
          showSpeakButton={converseTts}
        />
      );
    });
  };

  // Debounce the speaking state to prevent rapid label flickering
  const displaySpeaking = useDebouncedSpeaking(isSpeaking, isListening, 500);

  // Premium waveform bars for active speak button
  const WaveformBar = ({ delay, color }: { delay: number; color: string }) => {
    const anim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
      const wave = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 300 + Math.random() * 200,
            delay,
            useNativeDriver: true,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
          }),
          Animated.timing(anim, {
            toValue: 0.4,
            duration: 300 + Math.random() * 200,
            useNativeDriver: true,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
          }),
        ])
      );
      wave.start();
      return () => wave.stop();
    }, []);

    return (
      <Animated.View
        style={{
          width: 4,
          height: 20,
          borderRadius: 2,
          backgroundColor: color,
          transform: [{ scaleY: anim }],
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 4,
        }}
      />
    );
  };

  const SpeakButton = ({ person, isTop }: { person: 'A' | 'B'; isTop: boolean }) => {
    const isActive = isListening && activeSpeaker === person;
    const isOtherActive = isListening && activeSpeaker !== person;
    const pulseAnim = person === 'A' ? speakAPulse : speakBPulse;
    const personInfo = person === 'A' ? personAInfo : personBInfo;

    const buttonScale = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
      Animated.spring(buttonScale, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 150,
        friction: 5,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(buttonScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 150,
        friction: 5,
      }).start();
    };

    return (
      <TouchableOpacity
        onPress={() => isActive ? stopSpeaking() : startSpeaking(person)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isOtherActive}
        activeOpacity={1}
      >
        <Animated.View style={[
          isOtherActive && styles.speakButtonDisabled,
          { transform: [{ scale: Animated.multiply(pulseAnim, buttonScale) }] },
        ]}>
          <View style={[
            styles.speakButton,
            {
              backgroundColor: isActive
                ? theme.colors.error
                : theme.colors.primary + '12',
              borderWidth: 2,
              borderColor: isActive
                ? theme.colors.error
                : theme.colors.primary + '30',
              shadowColor: isActive ? theme.colors.error : theme.colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isActive ? 0.3 : 0.15,
              shadowRadius: 12,
              elevation: isActive ? 8 : 4,
            },
          ]}>
            <View style={styles.speakButtonContent}>
              {isActive && displaySpeaking ? (
                <View style={styles.waveformContainer}>
                  {[0, 60, 120, 180, 240].map((delay, i) => (
                    <WaveformBar key={i} delay={delay} color={'#FFF'} />
                  ))}
                </View>
              ) : (
                <View style={styles.micIconContainer}>
                  <Ionicons
                    name={isActive ? 'stop-circle' : 'mic'}
                    size={24}
                    color={isActive ? '#FFF' : theme.colors.primary}
                  />
                </View>
              )}
              <View style={styles.speakTextContainer}>
                <Text style={[styles.speakButtonLabel, {
                  color: isActive ? 'rgba(255, 255, 255, 0.7)' : theme.colors.textTertiary,
                }]}>
                  {personInfo?.flag} Speaker {person}
                </Text>
                <Text style={[styles.speakButtonText, {
                  color: isActive ? '#FFF' : theme.colors.text,
                }]}>
                  {isActive
                    ? (displaySpeaking ? 'Listening...' : 'Tap to stop')
                    : 'Tap to speak'}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={useNavigationStore.getState().openDrawer} style={styles.menuBtn}>
            <Ionicons name="menu" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.text }]}>Converse</Text>
          <View style={[
            styles.statusDotSmall,
            { backgroundColor: isConnected ? theme.colors.success : theme.colors.textTertiary }
          ]} />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleFaceToFace} style={[
            styles.ttsToggle,
            {
              backgroundColor: faceToFaceMode
                ? theme.colors.primary + '15'
                : 'transparent',
              borderWidth: 1,
              borderColor: faceToFaceMode
                ? theme.colors.primary + '30'
                : (isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.08)'),
            }
          ]}>
            <Ionicons
              name={faceToFaceMode ? 'people' : 'person'}
              size={18}
              color={faceToFaceMode ? theme.colors.primary : theme.colors.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleTts} style={[
            styles.ttsToggle,
            {
              backgroundColor: converseTts
                ? theme.colors.primary + '15'
                : 'transparent',
              borderWidth: 1,
              borderColor: converseTts
                ? theme.colors.primary + '30'
                : (isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.08)'),
            }
          ]}>
            <Ionicons
              name={converseTts ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={18}
              color={converseTts ? theme.colors.primary : theme.colors.textTertiary}
            />
          </TouchableOpacity>
          {turns.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {faceToFaceMode ? (
        <View
          style={styles.faceToFaceContainer}
          onLayout={(e) => { converseContainerHeight.value = e.nativeEvent.layout.height; }}
        >
          {/* Person A Section (Top - inner content rotated for face-to-face) */}
          <ReAnimated.View style={[styles.personSection, topSectionStyle]}>
            <View style={styles.rotatedContent}>
              <ScrollView
                ref={scrollRefA}
                style={styles.bubblesContainer}
                contentContainerStyle={styles.bubblesContent}
                showsVerticalScrollIndicator={false}
              >
                {turns.length === 0 && !currentTurn ? (
                  <ConversationEmptyState theme={theme} mode="face-to-face" />
                ) : (
                  renderBubblesForPerson('A')
                )}
              </ScrollView>
              <SpeakButton person="A" isTop={true} />
            </View>
          </ReAnimated.View>

          {/* Drag handle between sections */}
          <View
            style={styles.converseDragHandle}
            {...conversePanResponder.panHandlers}
          >
            <View style={[styles.converseDragPill, { backgroundColor: theme.colors.textTertiary }]} />
          </View>

          {/* Enhanced Language Bar with glassmorphism */}
          <BlurView
            intensity={60}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.languageBarBlur, {
              backgroundColor: isDark
                ? 'rgba(26, 35, 50, 0.85)'
                : 'rgba(255, 255, 255, 0.85)',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }]}
          >
            <View style={styles.langBarContent}>
              <View style={styles.langBarSide}>
                <CompactLanguagePill
                  languageCode={personALang}
                  theme={theme}
                  onPress={() => {
                    handleHaptic();
                    setLangModalFor('A');
                    setLangModalVisible(true);
                  }}
                  isRecording={isListening && activeSpeaker === 'A'}
                />
              </View>

              <TouchableOpacity
                onPress={() => {
                  handleHaptic();
                  swapRotationCount.current += 1;
                  Animated.spring(swapRotation, {
                    toValue: swapRotationCount.current,
                    useNativeDriver: true,
                    tension: 50,
                    friction: 8,
                  }).start();
                  const tempLang = personALang;
                  setPersonALang(personBLang);
                  setPersonBLang(tempLang);
                }}
                style={styles.swapButton}
              >
                <Animated.View style={{ transform: [{ rotate: swapSpin }] }}>
                  <View style={[styles.swapButtonCircle, {
                    backgroundColor: theme.colors.primary + '15',
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary + '30',
                  }]}>
                    <Ionicons name="swap-horizontal" size={20} color={theme.colors.primary} />
                  </View>
                </Animated.View>
              </TouchableOpacity>

              <View style={styles.langBarSide}>
                <CompactLanguagePill
                  languageCode={personBLang}
                  theme={theme}
                  onPress={() => {
                    handleHaptic();
                    setLangModalFor('B');
                    setLangModalVisible(true);
                  }}
                  isRecording={isListening && activeSpeaker === 'B'}
                />
              </View>
            </View>
          </BlurView>

          {/* Person B Section (Bottom) */}
          <ReAnimated.View style={[styles.personSection, bottomSectionStyle]}>
            <SpeakButton person="B" isTop={false} />
            <ScrollView
              ref={scrollRefB}
              style={styles.bubblesContainer}
              contentContainerStyle={styles.bubblesContent}
              showsVerticalScrollIndicator={false}
            >
              {turns.length === 0 && !currentTurn ? (
                <ConversationEmptyState theme={theme} mode="face-to-face" />
              ) : (
                renderBubblesForPerson('B')
              )}
            </ScrollView>
          </ReAnimated.View>
        </View>
      ) : (
        <>
          {/* Unified Chat Mode - Enhanced Language Bar */}
          <BlurView
            intensity={60}
            tint={isDark ? 'dark' : 'light'}
            style={[styles.languageBarBlur, {
              backgroundColor: isDark
                ? 'rgba(26, 35, 50, 0.85)'
                : 'rgba(255, 255, 255, 0.85)',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }]}
          >
            <View style={styles.langBarContent}>
              <View style={styles.langBarSide}>
                <CompactLanguagePill
                  languageCode={personALang}
                  theme={theme}
                  onPress={() => {
                    handleHaptic();
                    setLangModalFor('A');
                    setLangModalVisible(true);
                  }}
                  isRecording={isListening && activeSpeaker === 'A'}
                />
              </View>

              <TouchableOpacity
                onPress={() => {
                  handleHaptic();
                  swapRotationCount.current += 1;
                  Animated.spring(swapRotation, {
                    toValue: swapRotationCount.current,
                    useNativeDriver: true,
                    tension: 50,
                    friction: 8,
                  }).start();
                  const tempLang = personALang;
                  setPersonALang(personBLang);
                  setPersonBLang(tempLang);
                }}
                style={styles.swapButton}
              >
                <Animated.View style={{ transform: [{ rotate: swapSpin }] }}>
                  <View style={[styles.swapButtonCircle, {
                    backgroundColor: theme.colors.primary + '15',
                    borderWidth: 1.5,
                    borderColor: theme.colors.primary + '30',
                  }]}>
                    <Ionicons name="swap-horizontal" size={20} color={theme.colors.primary} />
                  </View>
                </Animated.View>
              </TouchableOpacity>

              <View style={styles.langBarSide}>
                <CompactLanguagePill
                  languageCode={personBLang}
                  theme={theme}
                  onPress={() => {
                    handleHaptic();
                    setLangModalFor('B');
                    setLangModalVisible(true);
                  }}
                  isRecording={isListening && activeSpeaker === 'B'}
                />
              </View>
            </View>
          </BlurView>

          {/* Single unified chat view */}
          <View style={styles.unifiedChatContainer}>
            <ScrollView
              ref={scrollRefB}
              style={styles.bubblesContainer}
              contentContainerStyle={styles.bubblesContent}
              showsVerticalScrollIndicator={false}
            >
              {turns.length === 0 && !currentTurn ? (
                <ConversationEmptyState theme={theme} mode="chat" />
              ) : (
                renderBubblesForPerson('B')
              )}
            </ScrollView>
          </View>

          {/* Both speak buttons side by side */}
          <View style={styles.unifiedSpeakRow}>
            <View style={styles.unifiedSpeakBtn}>
              <SpeakButton person="A" isTop={false} />
            </View>
            <View style={styles.unifiedSpeakBtn}>
              <SpeakButton person="B" isTop={false} />
            </View>
          </View>
        </>
      )}

      {/* Connection Error */}
      {connectionError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.colors.error + '15' }]}>
          <Ionicons name="warning" size={16} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{connectionError}</Text>
        </View>
      )}

      {/* Compact Language Selector Modal */}
      <Modal
        visible={langModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setLangModalVisible(false);
          setLangModalFor(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setLangModalVisible(false);
              setLangModalFor(null);
            }}
          />
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                Select Language for Speaker {langModalFor}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setLangModalVisible(false);
                  setLangModalFor(null);
                }}
              >
                <Text style={[styles.modalClose, { color: theme.colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES.filter(l => l.code !== 'auto')}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const isSelected = (langModalFor === 'A' ? personALang : personBLang) === item.code;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      handleHaptic();
                      if (langModalFor === 'A') {
                        setPersonALang(item.code);
                      } else if (langModalFor === 'B') {
                        setPersonBLang(item.code);
                      }
                      setLangModalVisible(false);
                      setLangModalFor(null);
                    }}
                    style={[
                      styles.langOption,
                      { borderBottomColor: theme.colors.borderLight },
                      isSelected && { backgroundColor: theme.colors.primary + '10' },
                    ]}
                  >
                    <Text style={styles.langFlag}>{item.flag}</Text>
                    <View style={styles.langTextContainer}>
                      <Text style={[styles.langName, { color: theme.colors.text }]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.langNative, { color: theme.colors.textSecondary }]}>
                        {item.nativeName}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statusDotSmall: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  menuBtn: {
    padding: 4,
    marginRight: 4,
  },
  clearBtn: {
    padding: 6,
  },
  ttsToggle: {
    padding: 7,
    borderRadius: 10,
  },
  faceToFaceContainer: {
    flex: 1,
  },
  personSection: {
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  rotatedContent: {
    flex: 1,
    transform: [{ rotate: '180deg' }],
  },
  converseDragHandle: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  converseDragPill: {
    width: 50,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  personBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  personFlag: {
    fontSize: 20,
  },
  languageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginVertical: 3,
  },
  languageBarBlur: {
    marginHorizontal: 12,
    borderRadius: 16,
    marginVertical: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  langBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginHorizontal: 10,
  },
  swapButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  bubblesContainer: {
    flex: 1,
  },
  bubblesContent: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  speakButton: {
    borderRadius: 16,
    marginVertical: 6,
    marginHorizontal: 4,
    overflow: 'hidden',
  },
  speakButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
  },
  speakButtonDisabled: {
    opacity: 0.35,
  },
  micIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakTextContainer: {
    flex: 1,
    gap: 2,
  },
  speakButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  speakButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    width: 48,
    justifyContent: 'center',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
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
  unifiedChatContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  unifiedSpeakRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  unifiedSpeakBtn: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    maxHeight: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '600',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  langFlag: {
    fontSize: 28,
  },
  langTextContainer: {
    flex: 1,
  },
  langName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  langNative: {
    fontSize: 14,
  },
});
