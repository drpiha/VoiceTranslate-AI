import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColorScheme } from 'react-native';
import { createTheme } from '../constants/theme';
import { useSettingsStore } from '../store/settingsStore';
import { Translation } from '../types';
import { getLanguageName } from '../constants/languages';
import * as Haptics from 'expo-haptics';

interface TranslationCardProps {
  translation: Translation;
  onPress?: () => void;
  onToggleFavorite?: () => void;
}

export const TranslationCard: React.FC<TranslationCardProps> = ({
  translation,
  onPress,
  onToggleFavorite,
}) => {
  const colorScheme = useColorScheme();
  const { theme: themePreference, hapticFeedback } = useSettingsStore();
  const isDark = themePreference === 'dark' || (themePreference === 'system' && colorScheme === 'dark');
  const theme = createTheme(isDark);

  const handleFavoritePress = () => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggleFavorite?.();
  };

  const formattedDate = new Date(translation.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.colors.card }, theme.shadows.sm]}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.languageInfo}>
          <Text style={[styles.languageText, { color: theme.colors.textSecondary }]}>
            {getLanguageName(translation.sourceLanguage)} → {getLanguageName(translation.targetLanguage)}
          </Text>
          <Text style={[styles.dateText, { color: theme.colors.textTertiary }]}>
            {formattedDate}
          </Text>
        </View>
        <TouchableOpacity onPress={handleFavoritePress}>
          <Text style={styles.favoriteIcon}>{translation.isFavorite ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sourceText, { color: theme.colors.text }]} numberOfLines={2}>
        {translation.sourceText}
      </Text>
      
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
      
      <Text style={[styles.translatedText, { color: theme.colors.primary }]} numberOfLines={2}>
        {translation.translatedText}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  languageInfo: {
    flex: 1,
  },
  languageText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 11,
  },
  favoriteIcon: {
    fontSize: 20,
  },
  sourceText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  translatedText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
});