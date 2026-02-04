import React, { useState } from 'react';
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
    setTheme,
    setColorScheme,
    setFontSize,
    setAutoPlayTranslation,
    setSaveHistory,
    setHapticFeedback,
    setTranslationProvider,
    setDeeplApiKey,
    setConverseTts,
  } = useSettingsStore();
  const { user, logout } = useUserStore();
  const { clearHistory } = useHistoryStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark, currentColorScheme);
  const [showDeeplKey, setShowDeeplKey] = useState(false);

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

          {/* Translation Provider Section */}
          <Animated.View entering={FadeInDown.delay(175).springify()}>
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
          <Animated.View entering={FadeInDown.delay(200).springify()}>
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
          <Animated.View entering={FadeInDown.delay(250).springify()}>
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
          <Animated.View entering={FadeInDown.delay(300).springify()}>
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
});
