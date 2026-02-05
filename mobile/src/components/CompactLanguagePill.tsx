import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { getLanguageByCode } from '../constants/languages';

interface CompactLanguagePillProps {
  languageCode: string;
  theme: Theme;
  onPress: () => void;
  isRecording?: boolean;
}

export const CompactLanguagePill: React.FC<CompactLanguagePillProps> = ({
  languageCode,
  theme,
  onPress,
  isRecording = false,
}) => {
  const language = getLanguageByCode(languageCode);

  if (!language) return null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.pill,
        {
          backgroundColor: theme.colors.surface,
          borderColor: isRecording ? theme.colors.primary : theme.colors.border,
          borderWidth: isRecording ? 1.5 : 1,
        },
      ]}
    >
      <Text style={styles.flag}>{language.flag}</Text>
      <Text
        style={[
          styles.code,
          { color: isRecording ? theme.colors.primary : theme.colors.text },
        ]}
      >
        {language.code.toUpperCase()}
      </Text>
      <Ionicons
        name="chevron-down"
        size={14}
        color={theme.colors.textTertiary}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  flag: {
    fontSize: 18,
  },
  code: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  chevron: {
    marginLeft: -2,
  },
});
