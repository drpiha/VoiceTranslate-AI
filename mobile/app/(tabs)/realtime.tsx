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
  Dimensions,
  TextInput,
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
import { translationService, RealtimeTranslationResult } from '../../src/services/translationService';
import { audioService, AudioSegment } from '../../src/services/audioService';
import { getLanguageByCode } from '../../src/constants/languages';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

interface TranslationSegment {
  id: number;
  transcript: string;
  translation: string;
  detectedLanguage?: string;
  timestamp: Date;
  isFinal: boolean;
}

// Animated Wave Bar Component
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

// Audio Visualizer Component
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

// Glowing Orb Animation
const GlowingOrb = ({ isActive, size, color }: { isActive: boolean; size: number; color: string }) => {
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      const glowAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.5,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      const scaleAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      glowAnimation.start();
      scaleAnimation.start();
      return () => {
        glowAnimation.stop();
        scaleAnimation.stop();
      };
    } else {
      glowAnim.setValue(0.5);
      scaleAnim.setValue(1);
    }
  }, [isActive]);

  return (
    <Animated.View
      style={[
        styles.glowOrb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: glowAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    />
  );
};

export default function RealtimeScreen() {
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
  const [currentLevel, setCurrentLevel] = useState(-100);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline' | 'starting'>('online');
  const [editedTranscript, setEditedTranscript] = useState<string | null>(null);
  const [editedTranslation, setEditedTranslation] = useState<string | null>(null);
  const [isRetranslating, setIsRetranslating] = useState(false);

  const sourceScrollRef = useRef<ScrollView>(null);
  const targetScrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;

  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  // Pulse animation for listening state
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Rotate animation for processing indicator
  useEffect(() => {
    if (isProcessing) {
      const rotate = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      rotate.start();
      return () => rotate.stop();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isProcessing]);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (segments.length > 0) {
      // Immediate scroll
      sourceScrollRef.current?.scrollToEnd({ animated: false });
      targetScrollRef.current?.scrollToEnd({ animated: false });
      // Also delayed scroll to catch any layout changes
      setTimeout(() => {
        sourceScrollRef.current?.scrollToEnd({ animated: true });
        targetScrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [segments]);

  const handleHaptic = useCallback(() => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [hapticFeedback]);

  // Button press animation
  const animateButtonPress = useCallback(() => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Handle WebSocket messages with sentence-level updates
  const handleWebSocketMessage = useCallback((data: RealtimeTranslationResult) => {
    console.log('Received message:', data.type, {
      segmentId: data.segmentId,
      isFinal: data.isFinal,
      isCorrection: data.isCorrection,
    });

    if (data.type === 'realtime_ready') {
      console.log('Realtime session ready');
      setIsProcessing(false);
    } else if (data.type === 'segment_result') {
      setIsProcessing(false);

      if (data.isEmpty || (!data.transcript && !data.translation)) {
        return;
      }

      // Update detected language
      if (data.detectedLanguage) {
        setDetectedLang(data.detectedLanguage);
      }

      const segmentId = data.segmentId || Date.now();
      const isFinal = data.isFinal ?? false;

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
          const newSegment: TranslationSegment = {
            id: segmentId,
            transcript: data.transcript || '',
            translation: data.translation || '',
            detectedLanguage: data.detectedLanguage,
            timestamp: new Date(),
            isFinal,
          };
          return [...prev, newSegment];
        }
      });

      if (isFinal) {
        handleHaptic();
      }
    } else if (data.type === 'error') {
      console.error('WebSocket error:', data.error);
      setConnectionError(data.error || 'Unknown error');
      setIsProcessing(false);
    }
  }, [handleHaptic]);

  const handleSegmentReady = useCallback((segment: AudioSegment) => {
    console.log('Audio segment ready:', segment.segmentId);
    setIsProcessing(true);
    translationService.sendAudioSegment(
      segment.base64,
      segment.segmentId,
      sourceLanguage,
      targetLanguage
    );
  }, [sourceLanguage, targetLanguage]);

  const handleMeteringUpdate = useCallback((level: number, speaking: boolean) => {
    setCurrentLevel(level);
    setIsSpeaking(speaking);
  }, []);

  const connectWebSocket = useCallback(() => {
    setConnectionError(null);
    setBackendStatus('checking');
    translationService.connectRealtimeWebSocket(
      handleWebSocketMessage,
      (error) => {
        console.error('WebSocket connection error:', error);
        setConnectionError('Connection failed. Tap retry or try again.');
        setIsConnected(false);
        setIsListening(false);
        setBackendStatus('offline');
      },
      () => {
        setIsConnected(true);
        setBackendStatus('online');
        translationService.startRealtimeSession(sourceLanguage, targetLanguage);
      }
    );
  }, [sourceLanguage, targetLanguage, handleWebSocketMessage]);

  const startListening = async () => {
    handleHaptic();
    animateButtonPress();

    // Don't block - let user try, WebSocket will show error if it fails
    setSegments([]);
    setDetectedLang(null);
    setConnectionError(null);

    // Always start a fresh session - disconnect and reconnect
    // This ensures language settings are properly sent to backend
    if (translationService.isConnected()) {
      console.log('Disconnecting existing WebSocket for fresh session...');
      translationService.disconnect();
      setIsConnected(false);
      // Small delay to ensure clean disconnect
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Now connect fresh with current language settings
    connectWebSocket();

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
    animateButtonPress();
    audioService.stopRealtimeMode();
    setIsListening(false);
    setIsSpeaking(false);
    setCurrentLevel(-100);
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
      });
      console.log('Saved to history:', { transcript: currentTranscript.substring(0, 50) });
    }

    // Stop audio recording if active
    if (isListening) {
      audioService.stopRealtimeMode();
      setIsListening(false);
      setIsSpeaking(false);
      setCurrentLevel(-100);
    }

    // Reset segment counter for fresh IDs
    audioService.resetSegmentCount();

    // Disconnect WebSocket to ensure fresh session
    if (translationService.isConnected()) {
      console.log('Disconnecting WebSocket for clean reset...');
      translationService.disconnect();
      setIsConnected(false);
    }

    // Clear all state
    setSegments([]);
    setDetectedLang(null);
    setIsProcessing(false);
    setConnectionError(null);
    setEditedTranscript(null);
    setEditedTranslation(null);

    console.log('Session cleared - ready for fresh start');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioService.stopRealtimeMode();
      translationService.disconnect();
    };
  }, []);

  const getTextAlign = (lang?: string) => {
    if (lang && RTL_LANGUAGES.includes(lang)) {
      return 'right';
    }
    return 'left';
  };

  // Swap source and target languages
  const handleSwapLanguages = async () => {
    handleHaptic();

    // Can't swap if source is auto
    if (sourceLanguage === 'auto' && !detectedLang) {
      Alert.alert('Cannot Swap', 'Please select a specific source language or speak first to detect the language.');
      return;
    }

    const actualSourceLang = detectedLang || sourceLanguage;
    const currentTranscript = editedTranscript ?? mergedTranscript;
    const currentTranslation = editedTranslation ?? mergedTranslation;

    // Swap languages
    setSourceLanguage(targetLanguage);
    setTargetLanguage(actualSourceLang === 'auto' ? 'en' : actualSourceLang);
    setDetectedLang(null);

    // Swap content
    if (currentTranscript || currentTranslation) {
      setEditedTranscript(currentTranslation);
      setEditedTranslation(currentTranscript);
      setSegments([]);
    }
  };

  // Retranslate content when target language changes
  const retranslateContent = async (newTargetLang: string) => {
    const textToTranslate = editedTranscript ?? mergedTranscript;
    if (!textToTranslate.trim()) return;

    setIsRetranslating(true);
    try {
      const result = await translationService.translate(
        textToTranslate,
        detectedLang || sourceLanguage,
        newTargetLang
      );
      setEditedTranslation(result.translatedText);
    } catch (error) {
      console.error('Retranslation failed:', error);
      Alert.alert('Translation Error', 'Failed to translate. Please try again.');
    } finally {
      setIsRetranslating(false);
    }
  };

  // Handle target language change with retranslation
  const handleTargetLanguageChange = (newLang: string) => {
    setTargetLanguage(newLang);
    const hasContent = (editedTranscript ?? mergedTranscript).trim().length > 0;
    if (hasContent && !isListening) {
      retranslateContent(newLang);
    }
  };

  // Merge all transcripts and translations
  const mergedTranscript = segments.map(s => s.transcript).filter(Boolean).join(' ');
  const mergedTranslation = segments.map(s => s.translation).filter(Boolean).join(' ');
  const displayTranscript = editedTranscript ?? mergedTranscript;
  const displayTranslation = editedTranslation ?? mergedTranslation;
  const hasContent = displayTranscript.length > 0 || displayTranslation.length > 0;
  const isCurrentlyUpdating = segments.some(s => !s.isFinal);

  // Get language info
  const sourceLangInfo = detectedLang ? getLanguageByCode(detectedLang) : getLanguageByCode(sourceLanguage);
  const targetLangInfo = getLanguageByCode(targetLanguage);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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

      {/* Language Selection - Compact */}
      <View style={[styles.languageCard, { backgroundColor: theme.colors.card }]}>
        <View style={styles.languageRow}>
          <View style={styles.languageSelectorWrapper}>
            <View style={styles.languageLabelRow}>
              <Ionicons name="mic-outline" size={14} color={theme.colors.primary} />
              <Text style={[styles.languageLabel, { color: theme.colors.textSecondary }]}>From</Text>
            </View>
            <LanguageSelector
              value={sourceLanguage}
              onChange={setSourceLanguage}
            />
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
            <LanguageSelector
              value={targetLanguage}
              onChange={handleTargetLanguageChange}
              excludeAuto
            />
          </View>
        </View>
      </View>

      {/* Two Panel Translation View */}
      <View style={styles.translationPanels}>
        {/* Source Language Panel (Top) */}
        <View style={[
          styles.panel,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.primary + '30' }
        ]}>
          <View style={styles.panelHeader}>
            <View style={[styles.panelBadge, { backgroundColor: theme.colors.primary + '15' }]}>
              <Text style={styles.panelFlag}>{sourceLangInfo?.flag || '🌐'}</Text>
              <Text style={[styles.panelLangName, { color: theme.colors.primary }]}>
                {detectedLang ? detectedLang.toUpperCase() : (sourceLangInfo?.name || 'Auto Detect')}
              </Text>
              {isCurrentlyUpdating && (
                <View style={[styles.liveDot, { backgroundColor: theme.colors.accent }]} />
              )}
            </View>
            {hasContent && (
              <TouchableOpacity onPress={clearSegments} style={styles.clearBtn}>
                <Ionicons name="trash-outline" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            ref={sourceScrollRef}
            style={styles.panelContent}
            contentContainerStyle={styles.panelContentContainer}
            showsVerticalScrollIndicator={true}
          >
            {hasContent ? (
              <TextInput
                style={[
                  styles.panelText,
                  styles.sourceText,
                  styles.editableText,
                  { color: theme.colors.text, textAlign: getTextAlign(detectedLang || undefined) }
                ]}
                value={displayTranscript + (isCurrentlyUpdating ? ' ...' : '')}
                onChangeText={(text) => setEditedTranscript(text.replace(' ...', ''))}
                multiline
                placeholder="Spoken text will appear here"
                placeholderTextColor={theme.colors.textTertiary}
                editable={!isListening}
              />
            ) : (
              <View style={styles.emptyPanel}>
                {isListening ? (
                  <>
                    <AudioVisualizer
                      isActive={isListening}
                      isSpeaking={isSpeaking}
                      primaryColor={theme.colors.primary}
                      accentColor={theme.colors.accent}
                    />
                    <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                      {isSpeaking ? 'Listening...' : 'Waiting for speech...'}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                    Spoken text will appear here
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
          {isProcessing && (
            <View style={styles.processingIndicator}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons name="sync" size={14} color={theme.colors.primary} />
              </Animated.View>
            </View>
          )}
        </View>

        {/* Target Language Panel (Bottom) */}
        <View style={[
          styles.panel,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.accent + '30' }
        ]}>
          <View style={styles.panelHeader}>
            <View style={[styles.panelBadge, { backgroundColor: theme.colors.accent + '15' }]}>
              <Text style={styles.panelFlag}>{targetLangInfo?.flag || '🌐'}</Text>
              <Text style={[styles.panelLangName, { color: theme.colors.accent }]}>
                {targetLangInfo?.name || targetLanguage.toUpperCase()}
              </Text>
              {isRetranslating && (
                <View style={[styles.liveDot, { backgroundColor: theme.colors.accent }]} />
              )}
            </View>
          </View>
          <ScrollView
            ref={targetScrollRef}
            style={styles.panelContent}
            contentContainerStyle={styles.panelContentContainer}
            showsVerticalScrollIndicator={true}
          >
            {displayTranslation ? (
              <TextInput
                style={[
                  styles.panelText,
                  styles.translationText,
                  styles.editableText,
                  { color: theme.colors.text, textAlign: getTextAlign(targetLanguage) }
                ]}
                value={displayTranslation + (isCurrentlyUpdating ? ' ...' : '')}
                onChangeText={(text) => setEditedTranslation(text.replace(' ...', ''))}
                multiline
                placeholder="Translation will appear here"
                placeholderTextColor={theme.colors.textTertiary}
                editable={!isListening && !isRetranslating}
              />
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                  {isRetranslating ? 'Translating...' : 'Translation will appear here'}
                </Text>
              </View>
            )}
          </ScrollView>
          {isRetranslating && (
            <View style={styles.processingIndicator}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons name="sync" size={14} color={theme.colors.accent} />
              </Animated.View>
            </View>
          )}
        </View>
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

      {/* Control Button Area */}
      <View style={styles.controlsContainer}>
        {/* Glow effect behind button */}
        {isListening && (
          <>
            <GlowingOrb isActive={true} size={140} color={theme.colors.glow} />
            <GlowingOrb isActive={true} size={180} color={theme.colors.glowAccent} />
          </>
        )}

        <TouchableOpacity
          onPress={toggleListening}
          activeOpacity={0.9}
          style={styles.mainButtonTouchable}
        >
          <Animated.View style={{ transform: [{ scale: Animated.multiply(pulseAnim, buttonScaleAnim) }] }}>
            <LinearGradient
              colors={isListening
                ? [theme.colors.error, theme.colors.errorLight] as [string, string]
                : [theme.colors.gradient1, theme.colors.gradient2] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mainButton}
            >
              <Ionicons
                name={isListening ? "stop" : "mic"}
                size={30}
                color="#FFF"
              />
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>

        {/* Status Text */}
        <View style={styles.statusLabelContainer}>
          {isListening ? (
            <View style={styles.statusRow}>
              <View style={[styles.recordingDot, { backgroundColor: isSpeaking ? theme.colors.accent : theme.colors.primary }]} />
              <Text style={[styles.statusLabelText, { color: theme.colors.text }]}>
                {isSpeaking ? 'Recording' : 'Listening'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.statusLabelText, { color: theme.colors.textSecondary }]}>
              Tap to start
            </Text>
          )}
        </View>
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
  panel: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  panelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  panelFlag: {
    fontSize: 16,
  },
  panelLangName: {
    fontSize: 13,
    fontWeight: '700',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  clearBtn: {
    padding: 6,
  },
  panelContent: {
    flex: 1,
    padding: 16,
  },
  panelContentContainer: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  panelText: {
    fontSize: 20,
    lineHeight: 32,
    letterSpacing: 0.3,
  },
  sourceText: {
    fontWeight: '400',
  },
  translationText: {
    fontWeight: '500',
    fontSize: 22,
    lineHeight: 34,
  },
  editableText: {
    flex: 1,
    textAlignVertical: 'top',
    padding: 0,
    margin: 0,
  },
  emptyPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '400',
  },
  processingIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
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
  controlsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glowOrb: {
    position: 'absolute',
  },
  mainButtonTouchable: {
    zIndex: 10,
  },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  statusLabelContainer: {
    marginTop: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabelText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
