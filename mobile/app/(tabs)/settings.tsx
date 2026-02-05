import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  useColorScheme,
  Image,
  Platform,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { createTheme, colorSchemeNames, colorSchemeIcons } from '../../src/constants/theme';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useUserStore } from '../../src/store/userStore';
import { useHistoryStore } from '../../src/store/historyStore';
import { ColorScheme, FontSize } from '../../src/types';
import * as Haptics from 'expo-haptics';
import { useNavigationStore } from '../../src/store/navigationStore';
import { ttsService } from '../../src/services/ttsService';

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const {
    theme: themePreference,
    colorScheme: currentColorScheme,
    fontSize: currentFontSize,
    autoPlayTranslation,
    saveHistory,
    hapticFeedback,
    translationProvider,
    deeplApiKey,
    converseTts,
    voiceGender,
    voiceTone,
    targetLanguage,
    voicePreferences,
    setTheme,
    setColorScheme,
    setFontSize,
    setAutoPlayTranslation,
    setSaveHistory,
    setHapticFeedback,
    setTranslationProvider,
    setDeeplApiKey,
    setConverseTts,
    setVoiceGender,
    setVoiceTone,
    setVoiceForLanguage,
  } = useSettingsStore();
  const { user, logout } = useUserStore();
  const { clearHistory } = useHistoryStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, currentColorScheme);
  const [showDeeplKey, setShowDeeplKey] = useState(false);
  const [voices, setVoices] = useState<any[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear History',
      'This will delete all translations except your favorites. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearHistory() },
      ]
    );
  };

  const cycleTheme = async () => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const t = ['light', 'dark', 'system'] as const;
    await setTheme(t[(t.indexOf(themePreference) + 1) % 3]);
  };

  const handleSubscription = () => {
    router.push('/subscription');
  };

  const getThemeIcon = () => {
    switch (themePreference) {
      case 'light':
        return 'sunny';
      case 'dark':
        return 'moon';
      default:
        return 'phone-portrait';
    }
  };

  useEffect(() => {
    loadVoices();
  }, [targetLanguage]);

  const loadVoices = async () => {
    setLoadingVoices(true);
    try {
      const lang = targetLanguage === 'auto' ? 'en' : targetLanguage;
      const availableVoices = await ttsService.getVoices(lang);
      setVoices(availableVoices);
    } catch (error) {
      console.error('Failed to load voices:', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const previewVoice = async (voiceName: string, gender: 'MALE' | 'FEMALE') => {
    if (playingVoice === voiceName) {
      await ttsService.stop();
      setPlayingVoice(null);
      return;
    }

    try {
      setPlayingVoice(voiceName);
      const sampleText = gender === 'MALE' ? 'Hello, this is a preview of the male voice.' : 'Hello, this is a preview of the female voice.';
      await ttsService.speak(sampleText, targetLanguage === 'auto' ? 'en' : targetLanguage, { voiceName });
      setTimeout(() => setPlayingVoice(null), 3000);
    } catch (error) {
      console.error('Voice preview failed:', error);
      setPlayingVoice(null);
    }
  };

  const selectVoice = async (voiceName: string) => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const lang = targetLanguage === 'auto' ? 'en' : targetLanguage;
    await setVoiceForLanguage(lang, voiceName);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <TouchableOpacity onPress={useNavigationStore.getState().openDrawer} style={{ padding: 4 }}>
                <Ionicons name="menu" size={22} color={theme.colors.text} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: theme.colors.text }]}>Settings</Text>
            </View>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              Customize your experience
            </Text>
          </View>

          {/* User Card */}
          {user ? (
            <Animated.View entering={FadeInDown.delay(50).springify()}>
              <View style={[
                styles.userCard,
                { backgroundColor: theme.colors.card }
              ]}>
                <View style={styles.userHeader}>
                  {user.profilePicture ? (
                    <Image source={{ uri: user.profilePicture }} style={styles.profilePicture} />
                  ) : (
                    <View style={[styles.profilePlaceholder, { backgroundColor: theme.colors.primary }]}>
                      <Text style={styles.profileInitial}>
                        {user.name?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: theme.colors.text }]}>
                      {user.name || 'User'}
                    </Text>
                    <Text style={[styles.userEmail, { color: theme.colors.textSecondary }]}>
                      {user.email}
                    </Text>
                    <View style={[
                      styles.tierBadge,
                      {
                        backgroundColor: user.subscriptionTier === 'premium'
                          ? theme.colors.primary + '26'
                          : (theme.colors.surface + (isDark ? '1A' : '0D'))
                      }
                    ]}>
                      <Ionicons
                        name={user.subscriptionTier === 'premium' ? 'diamond' : 'person'}
                        size={12}
                        color={user.subscriptionTier === 'premium' ? theme.colors.primary : theme.colors.textSecondary}
                      />
                      <Text style={[
                        styles.tierText,
                        { color: user.subscriptionTier === 'premium' ? theme.colors.primary : theme.colors.textSecondary }
                      ]}>
                        {user.subscriptionTier?.toUpperCase() || 'FREE'}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity onPress={handleSubscription} style={styles.upgradeButtonContainer}>
                  <View style={[styles.upgradeButton, { backgroundColor: theme.colors.primary }]}>
                    <Ionicons
                      name={user.subscriptionTier === 'premium' ? 'settings-outline' : 'arrow-up-circle'}
                      size={18}
                      color="#FFFFFF"
                    />
                    <Text style={styles.upgradeButtonText}>
                      {user.subscriptionTier === 'premium' ? 'Manage Plan' : 'Upgrade to Premium'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(50).springify()}>
              <TouchableOpacity
                style={[
                  styles.guestCard,
                  { backgroundColor: theme.colors.card }
                ]}
                onPress={() => router.push('/(auth)/login')}
                activeOpacity={0.8}
              >
                <View style={[styles.guestIconContainer, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="person" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.guestInfo}>
                  <Text style={[styles.guestTitle, { color: theme.colors.text }]}>Guest Mode</Text>
                  <Text style={[styles.guestSubtitle, { color: theme.colors.textSecondary }]}>
                    Sign in to save history and unlock premium features
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Appearance Section */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View style={[
              styles.section,
              { backgroundColor: theme.colors.card }
            ]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>
                APPEARANCE
              </Text>
              <TouchableOpacity style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} onPress={cycleTheme} activeOpacity={0.7}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '26' }]}>
                  <Ionicons name={getThemeIcon()} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Theme</Text>
                </View>
                <View style={styles.rowValue}>
                  <Text style={[styles.valueText, { color: theme.colors.textSecondary }]}>
                    {themePreference.charAt(0).toUpperCase() + themePreference.slice(1)}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </View>
              </TouchableOpacity>
              <View style={styles.row}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.accent + '26' }]}>
                  <Ionicons name="color-palette" size={20} color={theme.colors.accent} />
                </View>
                <View style={[styles.rowTextContainer, { marginBottom: 8 }]}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Color Theme</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorSchemeScroll} contentContainerStyle={styles.colorSchemeContent}>
                {(Object.keys(colorSchemeNames) as ColorScheme[]).map((scheme) => {
                  const isActive = currentColorScheme === scheme;
                  const schemePalette = createTheme(isDark, scheme).colors;
                  return (
                    <TouchableOpacity
                      key={scheme}
                      style={styles.colorChipContainer}
                      onPress={() => {
                        if (hapticFeedback) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        setColorScheme(scheme);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.colorChip,
                        { backgroundColor: schemePalette.primary },
                        isActive && { borderWidth: 3, borderColor: theme.colors.text }
                      ]}>
                        {isActive && (
                          <View style={styles.checkmarkBg}>
                            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                      <Text style={[
                        styles.colorChipLabel,
                        { color: isActive ? theme.colors.text : theme.colors.textSecondary },
                        isActive && { fontWeight: '700' }
                      ]}>
                        {colorSchemeNames[scheme]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {/* Font Size Picker */}
              <View style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', marginTop: 4 }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.warning + '26' }]}>
                  <Ionicons name="text" size={20} color={theme.colors.warning} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Font Size</Text>
                </View>
              </View>
              <View style={styles.fontSizeRow}>
                {([
                  { key: 'small' as FontSize, label: 'Small', previewSize: 14 },
                  { key: 'medium' as FontSize, label: 'Medium', previewSize: 18 },
                  { key: 'large' as FontSize, label: 'Large', previewSize: 22 },
                ]).map(({ key, label, previewSize }) => {
                  const isActive = currentFontSize === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.fontSizeButton,
                        {
                          backgroundColor: isActive
                            ? theme.colors.primary + '20'
                            : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          borderColor: isActive ? theme.colors.primary : 'transparent',
                        },
                      ]}
                      onPress={() => {
                        if (hapticFeedback) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                        setFontSize(key);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.fontSizePreview,
                        { fontSize: previewSize, color: isActive ? theme.colors.primary : theme.colors.text },
                      ]}>
                        Aa
                      </Text>
                      <Text style={[
                        styles.fontSizeLabel,
                        { color: isActive ? theme.colors.primary : theme.colors.textSecondary },
                        isActive && { fontWeight: '700' },
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Animated.View>

          {/* Translation Section */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <View style={[
              styles.section,
              { backgroundColor: theme.colors.card }
            ]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>
                TRANSLATION
              </Text>
              <View style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.success + '26' }]}>
                  <Ionicons name="volume-high" size={20} color={theme.colors.success} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Auto-play Translation</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Automatically speak translated text aloud using text-to-speech
                  </Text>
                </View>
                <Switch
                  value={autoPlayTranslation}
                  onValueChange={setAutoPlayTranslation}
                  trackColor={{ true: theme.colors.primary, false: isDark ? '#333' : '#E5E5E5' }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.accent + '26' }]}>
                  <Ionicons name="time" size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Save History</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Save all translations for later reference
                  </Text>
                </View>
                <Switch
                  value={saveHistory}
                  onValueChange={setSaveHistory}
                  trackColor={{ true: theme.colors.primary, false: isDark ? '#333' : '#E5E5E5' }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.info + '26' }]}>
                  <Ionicons name="volume-medium" size={20} color={theme.colors.info} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Read Aloud in Conversation</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Speak the other person's translated text aloud
                  </Text>
                </View>
                <Switch
                  value={converseTts}
                  onValueChange={setConverseTts}
                  trackColor={{ true: theme.colors.primary, false: isDark ? '#333' : '#E5E5E5' }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.row}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.warning + '26' }]}>
                  <Ionicons name="phone-portrait" size={20} color={theme.colors.warning} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Haptic Feedback</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Vibrate on button presses and completed translations
                  </Text>
                </View>
                <Switch
                  value={hapticFeedback}
                  onValueChange={setHapticFeedback}
                  trackColor={{ true: theme.colors.primary, false: isDark ? '#333' : '#E5E5E5' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </Animated.View>

          {/* Voice Settings Section */}
          <Animated.View entering={FadeInDown.delay(175).springify()}>
            <View style={[
              styles.section,
              { backgroundColor: theme.colors.card }
            ]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>
                VOICE SETTINGS
              </Text>

              <View style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.accent + '26' }]}>
                  <Ionicons name="person" size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Voice Gender</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Choose preferred voice gender for translations
                  </Text>
                </View>
              </View>

              <View style={styles.voiceGenderRow}>
                <TouchableOpacity
                  style={[
                    styles.voiceGenderButton,
                    {
                      backgroundColor: voiceGender === 'male'
                        ? theme.colors.primary + '20'
                        : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: voiceGender === 'male' ? theme.colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    if (hapticFeedback) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setVoiceGender('male');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="male"
                    size={28}
                    color={voiceGender === 'male' ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[
                    styles.voiceGenderLabel,
                    { color: voiceGender === 'male' ? theme.colors.primary : theme.colors.textSecondary },
                    voiceGender === 'male' && { fontWeight: '700' },
                  ]}>
                    Male
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.voiceGenderButton,
                    {
                      backgroundColor: voiceGender === 'female'
                        ? theme.colors.primary + '20'
                        : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: voiceGender === 'female' ? theme.colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    if (hapticFeedback) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setVoiceGender('female');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="female"
                    size={28}
                    color={voiceGender === 'female' ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[
                    styles.voiceGenderLabel,
                    { color: voiceGender === 'female' ? theme.colors.primary : theme.colors.textSecondary },
                    voiceGender === 'female' && { fontWeight: '700' },
                  ]}>
                    Female
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', marginTop: 4 }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.info + '26' }]}>
                  <Ionicons name="star" size={20} color={theme.colors.info} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Voice Tone</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Select formal or casual speaking style
                  </Text>
                </View>
              </View>

              <View style={styles.voiceToneRow}>
                <TouchableOpacity
                  style={[
                    styles.voiceToneButton,
                    {
                      backgroundColor: voiceTone === 'formal'
                        ? theme.colors.primary + '20'
                        : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: voiceTone === 'formal' ? theme.colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    if (hapticFeedback) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setVoiceTone('formal');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="business"
                    size={24}
                    color={voiceTone === 'formal' ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[
                    styles.voiceToneLabel,
                    { color: voiceTone === 'formal' ? theme.colors.primary : theme.colors.textSecondary },
                    voiceTone === 'formal' && { fontWeight: '700' },
                  ]}>
                    Formal
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.voiceToneButton,
                    {
                      backgroundColor: voiceTone === 'casual'
                        ? theme.colors.primary + '20'
                        : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: voiceTone === 'casual' ? theme.colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    if (hapticFeedback) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setVoiceTone('casual');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="happy"
                    size={24}
                    color={voiceTone === 'casual' ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[
                    styles.voiceToneLabel,
                    { color: voiceTone === 'casual' ? theme.colors.primary : theme.colors.textSecondary },
                    voiceTone === 'casual' && { fontWeight: '700' },
                  ]}>
                    Casual
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.row, { marginTop: 4 }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.success + '26' }]}>
                  <Ionicons name="mic" size={20} color={theme.colors.success} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>
                    Available Voices for {targetLanguage === 'auto' ? 'English' : targetLanguage.toUpperCase()}
                  </Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Tap to preview and select a voice
                  </Text>
                </View>
                <TouchableOpacity onPress={loadVoices} style={{ padding: 4 }}>
                  <Ionicons name="refresh" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>

              {loadingVoices ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                    Loading voices...
                  </Text>
                </View>
              ) : (
                <View style={styles.voiceListContainer}>
                  {voices
                    .filter(v => v.gender === voiceGender.toUpperCase())
                    .slice(0, 4)
                    .map((voice, index) => {
                      const isSelected = voicePreferences[targetLanguage === 'auto' ? 'en' : targetLanguage] === voice.name;
                      const isPlaying = playingVoice === voice.name;
                      return (
                        <TouchableOpacity
                          key={voice.name}
                          style={[
                            styles.voiceItem,
                            {
                              backgroundColor: isSelected
                                ? theme.colors.primary + '15'
                                : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              borderColor: isSelected ? theme.colors.primary : 'transparent',
                            },
                          ]}
                          onPress={() => selectVoice(voice.name)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.voiceItemContent}>
                            <View style={[
                              styles.voiceIconContainer,
                              { backgroundColor: isSelected ? theme.colors.primary : theme.colors.textTertiary }
                            ]}>
                              <Ionicons
                                name={voice.gender === 'MALE' ? 'male' : 'female'}
                                size={16}
                                color="#FFFFFF"
                              />
                            </View>
                            <View style={styles.voiceInfo}>
                              <Text style={[
                                styles.voiceName,
                                { color: isSelected ? theme.colors.primary : theme.colors.text },
                                isSelected && { fontWeight: '700' }
                              ]} numberOfLines={1}>
                                {voice.name.split('-').pop()?.replace('Neural', '') || 'Voice'}
                              </Text>
                              <Text style={[styles.voiceDetails, { color: theme.colors.textTertiary }]}>
                                {voice.gender.toLowerCase()} • {voiceTone} • {voice.languageCode.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.playButton,
                              { backgroundColor: isPlaying ? theme.colors.error + '20' : theme.colors.primary + '20' }
                            ]}
                            onPress={(e) => {
                              e.stopPropagation();
                              previewVoice(voice.name, voice.gender);
                            }}
                          >
                            <Ionicons
                              name={isPlaying ? 'stop' : 'play'}
                              size={16}
                              color={isPlaying ? theme.colors.error : theme.colors.primary}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              )}
            </View>
          </Animated.View>

          {/* Translation Provider Section */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <View style={[
              styles.section,
              { backgroundColor: theme.colors.card }
            ]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>
                TRANSLATION PROVIDER
              </Text>
              <TouchableOpacity
                style={[styles.row, styles.rowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                onPress={() => setTranslationProvider('backend')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '26' }]}>
                  <Ionicons name="cloud" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Backend AI</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Groq + OpenRouter (default, free)
                  </Text>
                </View>
                <Ionicons
                  name={translationProvider === 'backend' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={translationProvider === 'backend' ? theme.colors.primary : theme.colors.textTertiary}
                />
              </TouchableOpacity>
              <View style={styles.row}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
                  onPress={() => setTranslationProvider('deepl')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: theme.colors.info + '26' }]}>
                    <Ionicons name="language" size={20} color={theme.colors.info} />
                  </View>
                  <View style={styles.rowTextContainer}>
                    <Text style={[styles.rowText, { color: theme.colors.text }]}>DeepL</Text>
                    <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                      High quality translation via server
                    </Text>
                  </View>
                </TouchableOpacity>
                <Ionicons
                  name={translationProvider === 'deepl' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={translationProvider === 'deepl' ? theme.colors.info : theme.colors.textTertiary}
                />
              </View>
              {translationProvider === 'deepl' && (
                <View style={[styles.apiKeyContainer, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                  <Text style={[styles.apiKeyHint, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
                    Uses our server's DeepL integration by default.
                  </Text>
                  <Text style={[styles.apiKeyLabel, { color: theme.colors.textTertiary }]}>Own API Key (optional)</Text>
                  <View style={styles.apiKeyInputRow}>
                    <TextInput
                      style={[styles.apiKeyInput, {
                        color: theme.colors.text,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      }]}
                      placeholder="Leave empty to use server key"
                      placeholderTextColor={theme.colors.textTertiary}
                      value={deeplApiKey}
                      onChangeText={setDeeplApiKey}
                      secureTextEntry={!showDeeplKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity onPress={() => setShowDeeplKey(!showDeeplKey)} style={styles.eyeButton}>
                      <Ionicons
                        name={showDeeplKey ? 'eye-off' : 'eye'}
                        size={20}
                        color={theme.colors.textTertiary}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.apiKeyHint, { color: theme.colors.textTertiary }]}>
                    Only needed if you want to use your own DeepL account
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Data Section */}
          <Animated.View entering={FadeInDown.delay(225).springify()}>
            <View style={[
              styles.section,
              { backgroundColor: theme.colors.card }
            ]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>DATA</Text>
              <TouchableOpacity style={styles.row} onPress={handleClearHistory} activeOpacity={0.7}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.error + '26' }]}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Clear History</Text>
                  <Text style={[styles.rowSubtext, { color: theme.colors.textTertiary }]}>
                    Favorites will be preserved
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* About Section */}
          <Animated.View entering={FadeInDown.delay(275).springify()}>
            <View style={[
              styles.section,
              { backgroundColor: theme.colors.card }
            ]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textTertiary }]}>ABOUT</Text>
              <View style={styles.row}>
                <View style={[styles.iconContainer, { backgroundColor: theme.colors.info + '26' }]}>
                  <Ionicons name="information-circle" size={20} color={theme.colors.info} />
                </View>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>Version</Text>
                </View>
                <Text style={[styles.valueText, { color: theme.colors.textSecondary }]}>1.0.0</Text>
              </View>
            </View>
          </Animated.View>

          {/* Auth Button */}
          <Animated.View entering={FadeInDown.delay(325).springify()}>
            {user ? (
              <TouchableOpacity
                style={[
                  styles.authButton,
                  { backgroundColor: theme.colors.error + '1A', borderColor: theme.colors.error }
                ]}
                onPress={handleLogout}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
                <Text style={[styles.authButtonText, { color: theme.colors.error }]}>Sign Out</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.signInButtonContainer}
                onPress={() => router.push('/(auth)/login')}
                activeOpacity={0.9}
              >
                <View style={[styles.signInButton, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.signInButtonText}>Sign In</Text>
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Footer */}
          <Text style={[styles.footer, { color: theme.colors.textTertiary }]}>
            VoiceTranslate AI v1.0.0
          </Text>
        </ScrollView>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
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
  userCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profilePicture: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  profilePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    marginBottom: 10,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  tierText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  upgradeButtonContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  guestCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  guestInfo: {
    flex: 1,
  },
  guestTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  guestSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    padding: 16,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextContainer: {
    flex: 1,
  },
  rowText: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtext: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  rowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500',
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 20,
    gap: 8,
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  signInButtonContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  apiKeyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  apiKeyLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  apiKeyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  apiKeyInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  eyeButton: {
    padding: 8,
    marginLeft: 4,
  },
  apiKeyHint: {
    fontSize: 11,
    marginTop: 6,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 20,
  },
  colorSchemeScroll: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  colorSchemeContent: {
    paddingRight: 16,
    gap: 16,
  },
  colorChipContainer: {
    alignItems: 'center',
    gap: 8,
  },
  colorChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChipLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  fontSizeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  fontSizeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 4,
  },
  fontSizePreview: {
    fontWeight: '600',
  },
  fontSizeLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  voiceGenderRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  voiceGenderButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  voiceGenderLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  voiceToneRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  voiceToneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  voiceToneLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  voiceListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  voiceItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  voiceIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontSize: 15,
    fontWeight: '500',
  },
  voiceDetails: {
    fontSize: 11,
    marginTop: 2,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
